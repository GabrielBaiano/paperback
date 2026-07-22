import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

// Import SQLite helper functions
import { dbRun, dbGet, dbAll } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const JWT_SECRET = process.env.JWT_SECRET || 'foliate-jam-super-secret-key-12345';
let supabaseUrl = process.env.SUPABASE_URL;
if (supabaseUrl && supabaseUrl.includes('/rest/v1')) {
    supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '');
}
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

if (supabase) {
    console.log('[Supabase] Client initialized successfully. Using Supabase Storage.');
} else {
    console.log('[Supabase Warning] Credentials missing. Falling back to local ephemeral storage.');
}

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

// Configure multer for file uploads
let uploadDir;
let useDataDir = false;
try {
    if (fs.existsSync('/data')) {
        fs.accessSync('/data', fs.constants.W_OK);
        useDataDir = true;
    }
} catch (err) {
    console.warn('[Uploads Warning] /data directory exists but is not writable:', err.message);
}

uploadDir = useDataDir
    ? '/data/uploads'
    : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (err) {
        console.error('[Uploads Error] Failed to create upload directory at', uploadDir, err.message);
        if (useDataDir) {
            console.log('[Uploads] Falling back to local uploads directory.');
            uploadDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
        }
    }
}

const storage = supabase
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // Limit files to 20MB to prevent server abuse
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.epub') {
            return cb(new Error('Only EPUB files (.epub) are allowed.'));
        }
        cb(null, true);
    }
});

app.use(express.json());
app.use(cookieParser());

// Serve static files from root
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Route to serve the main reader page at the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'reader.html'));
});

// Lightweight health check endpoint with DB check for platform monitoring
app.get('/health', async (req, res) => {
    try {
        await dbGet('SELECT 1');
        res.status(200).json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('[Health Check Failure]', err);
        res.status(500).json({ status: 'error', database: err.message, timestamp: new Date().toISOString() });
    }
});

// Helper to parse cookies
function parseCookies(cookieStr) {
    const list = {};
    if (!cookieStr) return list;
    cookieStr.split(';').forEach(c => {
        const parts = c.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    return list;
}


// Helper middleware to get authenticated user from JWT cookie
async function getAuthUser(req) {
    const token = req.cookies?.token;
    if (!token) return null;
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await dbGet('SELECT * FROM users WHERE discord_id = ?', [payload.discord_id]);
        return user || null;
    } catch (e) {
        return null;
    }
}

// --- Discord OAuth2 API Routes ---

// 1. Redirect to Discord OAuth2 or login mock user if running locally or keys are missing
app.get('/api/auth/discord', async (req, res) => {
    const host = req.headers.host || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1') || req.query.mock === 'true';
    const forceReal = req.query.real === 'true';

    if ((isLocalhost && !forceReal) || !DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
        console.log('[Auth] Local mode or missing Discord credentials. Logging in as Local Tester.');
        const mockUser = {
            discord_id: 'mock-id-local',
            username: 'Local_Tester',
            avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
            color: '#3b82f6'
        };
        
        await dbRun(`
            INSERT INTO users (discord_id, username, avatar_url, color, last_login)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET
                username=excluded.username,
                avatar_url=excluded.avatar_url,
                last_login=excluded.last_login
        `, [mockUser.discord_id, mockUser.username, mockUser.avatar_url, mockUser.color, new Date().toISOString()]);

        const sessionToken = jwt.sign({ discord_id: mockUser.discord_id }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', sessionToken, {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });
        return res.redirect('/');
    }

    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const redirectUri = process.env.DISCORD_REDIRECT_URI || `${protocol}://${host}/api/auth/discord/callback`;

    const authUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
    res.redirect(authUrl);
});

// 2. OAuth2 Callback
app.get('/api/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).send('Authorization code missing');
    }

    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const redirectUri = process.env.DISCORD_REDIRECT_URI || `${protocol}://${host}/api/auth/discord/callback`;

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!tokenResponse.ok) {
            const errBody = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${errBody}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!userResponse.ok) {
            throw new Error('Failed to fetch user profile from Discord');
        }

        const userData = await userResponse.json();
        const avatarUrl = userData.avatar
            ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${userData.discriminator % 5}.png`;

        const presets = [
            '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', 
            '#03a9f4', '#00bcd4', '#009688', '#259b24', 
            '#ff9800', '#ff5722'
        ];
        const randomColor = presets[Math.floor(Math.random() * presets.length)];

        const existingUser = await dbGet('SELECT * FROM users WHERE discord_id = ?', [userData.id]);
        const userColor = existingUser?.color || randomColor;

        await dbRun(`
            INSERT INTO users (discord_id, username, avatar_url, color, last_login)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET
                username=excluded.username,
                avatar_url=excluded.avatar_url,
                last_login=excluded.last_login
        `, [userData.id, userData.username, avatarUrl, userColor, new Date().toISOString()]);

        const sessionToken = jwt.sign({ discord_id: userData.id }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', sessionToken, {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });

        res.redirect('/');
    } catch (err) {
        console.error('[Auth Error]', err);
        res.status(500).send(`Authentication error: ${err.message}`);
    }
});

// 3. User profile endpoint
app.get('/api/auth/me', async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
        return res.json({ loggedIn: false });
    }
    res.json({ loggedIn: true, user });
});

// 4. Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// Admin and limits bypass check
function isLimitExempt(user) {
    if (!user) return false;
    const admins = process.env.ADMIN_USERS ? process.env.ADMIN_USERS.split(',').map(u => u.trim()) : [];
    return admins.includes(user.username) || user.username === 'gabrielbaiano_';
}

// Get rooms for the logged-in user (rooms they created or joined)
app.get('/api/my-rooms', async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    
    try {
        // Find rooms where the user is either the creator OR has progress records OR has highlights
        const rooms = await dbAll(`
            SELECT DISTINCT r.* FROM rooms r
            LEFT JOIN room_members m ON r.room_id = m.room_id
            LEFT JOIN highlights h ON r.room_id = h.room_id
            WHERE r.creator_id = ? OR m.discord_id = ? OR h.discord_id = ?
            ORDER BY r.last_active DESC
        `, [user.discord_id, user.discord_id, user.discord_id]);
        
        // Resolve signed URLs or local path checks dynamically
        const resolvedRooms = await Promise.all(rooms.map(async (room) => {
            let bookPath = room.book_path;
            let hasBook = false;
            
            if (room.book_path.startsWith('supabase://')) {
                if (supabase) {
                    const fileKey = room.book_path.replace('supabase://', '');
                    const { data: files } = await supabase.storage.from('books').list('', { search: fileKey });
                    const fileExists = files && files.some(f => f.name === fileKey);
                    if (fileExists) {
                        const { data: signedData } = await supabase.storage.from('books').createSignedUrl(fileKey, 86400);
                        if (signedData && signedData.signedUrl) {
                            bookPath = signedData.signedUrl;
                            hasBook = true;
                        }
                    }
                }
            } else {
                const filename = path.basename(room.book_path);
                const physicalPath = path.join(uploadDir, filename);
                hasBook = fs.existsSync(physicalPath);
            }
            
            // Count distinct readers that joined this room historically
            const memberCountRow = await dbGet(
                'SELECT COUNT(DISTINCT discord_id) as count FROM room_members WHERE room_id = ?',
                [room.room_id]
            );
            const memberCount = memberCountRow ? memberCountRow.count : 0;

            // Count live online readers in this room right now from in-memory clients
            const onlineCount = Array.from(clients.values())
                .filter(c => c.roomId === room.room_id).length;

            return {
                roomId: room.room_id,
                bookPath,
                title: room.title,
                author: room.author,
                createdAt: room.created_at,
                lastActive: room.last_active,
                hasBook,
                memberCount,
                onlineCount,
                creatorId: room.creator_id
            };
        }));
        
        res.json(resolvedRooms);
    } catch (e) {
        console.error('[API Error] Failed to fetch user rooms:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Book Club SQLite Rooms API ---

// Create Room via epub upload
app.post('/api/rooms', upload.single('book'), async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required. Please login with Discord.' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No book file uploaded' });
    }

    // Security Limits (Excludes Whitelisted Admins like gabrielbaiano_)
    if (!isLimitExempt(user)) {
        try {
            // 1. Hourly rate-limit check (Max 5 rooms per hour)
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const hourlyCountRow = await dbGet(
                'SELECT COUNT(*) as count FROM rooms WHERE creator_id = ? AND created_at > ?',
                [user.discord_id, oneHourAgo]
            );
            if (hourlyCountRow && hourlyCountRow.count >= 5) {
                return res.status(429).json({ error: 'Rate limit exceeded: You can only create up to 5 rooms per hour.' });
            }

            // 2. Active rooms limit check (Max 4 active rooms containing books)
            const activeCountRow = await dbGet(
                "SELECT COUNT(*) as count FROM rooms WHERE creator_id = ? AND book_path IS NOT NULL AND book_path != ''",
                [user.discord_id]
            );
            if (activeCountRow && activeCountRow.count >= 4) {
                return res.status(400).json({ error: 'Active rooms limit exceeded: You can have at most 4 active rooms at the same time.' });
            }
        } catch (err) {
            console.error('[Security Check Error]', err);
        }
    }

    const roomId = Math.random().toString(36).substring(2, 11);
    const title = req.body.title || 'Untitled';
    const author = req.body.author || 'Unknown';
    let bookPath = '';

    try {
        if (supabase) {
            // Upload to Supabase Storage
            const fileKey = `${roomId}-${Date.now()}.epub`;
            const { data, error } = await supabase.storage
                .from('books')
                .upload(fileKey, req.file.buffer, {
                    contentType: req.file.mimetype || 'application/epub+zip',
                    upsert: true
                });
            
            if (error) {
                console.error('[Supabase Upload Error]:', error);
                throw error;
            }
            
            bookPath = `supabase://${fileKey}`;
            console.log(`[Supabase Uploaded] Room ID: ${roomId}, File: ${fileKey}`);
        } else {
            // Local fallback
            bookPath = `/uploads/${req.file.filename}`;
            console.log(`[Local Uploaded] Room ID: ${roomId}, File: ${req.file.filename}`);
        }

        const nowStr = new Date().toISOString();
        await dbRun(`
            INSERT INTO rooms (room_id, book_path, filename, title, author, created_at, last_active, creator_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [roomId, bookPath, req.file.originalname, title, author, nowStr, nowStr, user.discord_id]);

        console.log(`[Room Created] Room ID: ${roomId}, Book: ${title}`);
        res.json({ roomId, bookPath, title, author });
    } catch (e) {
        console.error('[API Error] Failed to create room:', e);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

// Get room details
app.get('/api/rooms/:roomId', async (req, res) => {
    try {
        const room = await dbGet('SELECT * FROM rooms WHERE room_id = ?', [req.params.roomId]);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Limit user active room participation to 4 rooms maximum
        const user = await getAuthUser(req);
        if (user) {
            if (!isLimitExempt(user)) {
                // Check if user is already a member
                const isMember = await dbGet(
                    'SELECT 1 FROM room_members WHERE room_id = ? AND discord_id = ?',
                    [room.room_id, user.discord_id]
                );

                if (!isMember && room.book_path !== '') {
                    const participationCountRow = await dbGet(`
                        SELECT COUNT(DISTINCT r.room_id) as count
                        FROM rooms r
                        JOIN room_members rm ON r.room_id = rm.room_id
                        WHERE rm.discord_id = ? AND r.book_path IS NOT NULL AND r.book_path != ''
                    `, [user.discord_id]);

                    if (participationCountRow && participationCountRow.count >= 4) {
                        return res.status(400).json({ error: 'Participation limit exceeded: You cannot participate in more than 4 active rooms at the same time.' });
                    }
                }
            }
        }

        // Reset countdown by updating last_active
        const nowStr = new Date().toISOString();
        await dbRun('UPDATE rooms SET last_active = ? WHERE room_id = ?', [nowStr, room.room_id]);
        
        let bookPath = room.book_path;
        let hasBook = false;

        if (room.book_path.startsWith('supabase://')) {
            if (supabase) {
                const fileKey = room.book_path.replace('supabase://', '');
                
                // Verify that file still exists in bucket
                const { data: files } = await supabase.storage
                    .from('books')
                    .list('', { search: fileKey });
                
                const fileExists = files && files.some(f => f.name === fileKey);
                if (fileExists) {
                    // Create signed URL for download (expires in 24 hours)
                    const { data: signedData } = await supabase.storage
                        .from('books')
                        .createSignedUrl(fileKey, 86400);

                    if (signedData && signedData.signedUrl) {
                        bookPath = signedData.signedUrl;
                        hasBook = true;
                    }
                }
            }
        } else {
            // Local fallback
            const filename = path.basename(room.book_path);
            const physicalPath = path.join(uploadDir, filename);
            hasBook = fs.existsSync(physicalPath);
        }

        res.json({
            roomId: room.room_id,
            bookPath,
            title: room.title,
            author: room.author,
            hasBook
        });
    } catch (e) {
        console.error('[API Error] Failed to fetch room:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a room (Creator-only, deletes DB records and book file, disconnects active clients)
app.delete('/api/rooms/:roomId', async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required. Please login with Discord.' });
    }

    const { roomId } = req.params;

    try {
        const room = await dbGet('SELECT * FROM rooms WHERE room_id = ?', [roomId]);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Limit check: only creator (or whitelist exempt admins) can delete
        if (room.creator_id !== user.discord_id && !isLimitExempt(user)) {
            return res.status(403).json({ error: 'Only the creator of the room can delete it.' });
        }

        // 1. Delete physical book file if it exists
        if (room.book_path) {
            if (room.book_path.startsWith('supabase://')) {
                if (supabase) {
                    const fileKey = room.book_path.replace('supabase://', '');
                    const { error } = await supabase.storage.from('books').remove([fileKey]);
                    if (error) {
                        console.error('[Delete Room Warning] Failed to delete from Supabase:', error);
                    }
                }
            } else {
                const filename = path.basename(room.book_path);
                const filePath = path.join(uploadDir, filename);
                if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, (err) => {
                        if (err) console.error('[Delete Room Warning] Failed to delete local file:', err);
                    });
                }
            }
        }

        // 2. Cascade delete database records manually to be safe
        await dbRun('DELETE FROM highlights WHERE room_id = ?', [roomId]);
        await dbRun('DELETE FROM room_members WHERE room_id = ?', [roomId]);
        await dbRun('DELETE FROM rooms WHERE room_id = ?', [roomId]);

        console.log(`[Room Deleted] Room ID: ${roomId} deleted by ${user.username}`);

        // 3. Disconnect any active readers via WebSockets
        for (const [clientWs, clientInfo] of clients.entries()) {
            if (clientInfo.roomId === roomId) {
                try {
                    clientWs.send(JSON.stringify({ type: 'room_deleted', roomId }));
                    setTimeout(() => {
                        try { clientWs.close(); } catch (_) {}
                    }, 100);
                } catch (wsErr) {
                    console.error('[Delete Room Warning] Failed to send WS close signal:', wsErr);
                }
            }
        }

        res.json({ success: true, message: 'Room successfully deleted' });
    } catch (e) {
        console.error('[API Error] Failed to delete room:', e);
        res.status(500).json({ error: 'Failed to delete room' });
    }
});

// Leave a room (Removes user from membership, disconnects active WebSocket if online)
app.post('/api/rooms/:roomId/leave', async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required. Please login with Discord.' });
    }

    const { roomId } = req.params;

    try {
        const room = await dbGet('SELECT * FROM rooms WHERE room_id = ?', [roomId]);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Creators cannot leave their own room (they must delete it instead)
        if (room.creator_id === user.discord_id) {
            return res.status(400).json({ error: 'Creators cannot leave their own room. You can delete it instead.' });
        }

        // 1. Remove from room_members database table
        await dbRun('DELETE FROM room_members WHERE room_id = ? AND discord_id = ?', [roomId, user.discord_id]);

        // 2. If user has active WebSocket session, disconnect it (will broadcast member_left automatically)
        let disconnected = false;
        for (const [clientWs, clientInfo] of clients.entries()) {
            if (clientInfo.roomId === roomId && clientInfo.discordId === user.discord_id) {
                try {
                    clientWs.close();
                    disconnected = true;
                } catch (_) {}
            }
        }

        console.log(`[Room Left] ${user.username} left Room ID: ${roomId}`);
        res.json({ success: true, message: 'Room successfully left', disconnected });
    } catch (e) {
        console.error('[API Error] Failed to leave room:', e);
        res.status(500).json({ error: 'Failed to leave room' });
    }
});
// Re-upload a book for an expired room session
app.post('/api/rooms/:roomId/reupload', upload.single('book'), async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required. Please login with Discord.' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No book file uploaded' });
    }

    const { roomId } = req.params;
    let bookPath = '';

    try {
        const room = await dbGet('SELECT * FROM rooms WHERE room_id = ?', [roomId]);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        if (supabase) {
            // Upload to Supabase Storage
            const fileKey = `${roomId}-${Date.now()}.epub`;
            const { data, error } = await supabase.storage
                .from('books')
                .upload(fileKey, req.file.buffer, {
                    contentType: req.file.mimetype || 'application/epub+zip',
                    upsert: true
                });
            
            if (error) {
                console.error('[Supabase Reupload Error]:', error);
                throw error;
            }
            
            bookPath = `supabase://${fileKey}`;
            console.log(`[Supabase Restored] Room ID: ${roomId}, File: ${fileKey}`);
        } else {
            // Local fallback
            bookPath = `/uploads/${req.file.filename}`;
            console.log(`[Local Restored] Room ID: ${roomId}, File: ${req.file.filename}`);
        }

        const nowStr = new Date().toISOString();
        await dbRun('UPDATE rooms SET book_path = ?, last_active = ? WHERE room_id = ?', [bookPath, nowStr, roomId]);

        // If upload is to Supabase, generate signed link immediately to return
        let returnPath = bookPath;
        if (supabase && bookPath.startsWith('supabase://')) {
            const fileKey = bookPath.replace('supabase://', '');
            const { data: signedData } = await supabase.storage
                .from('books')
                .createSignedUrl(fileKey, 86400);
            if (signedData && signedData.signedUrl) {
                returnPath = signedData.signedUrl;
            }
        }

        console.log(`[Room Restored] Room ID: ${roomId}, New book file: ${req.file.originalname}`);
        res.json({
            roomId,
            bookPath: returnPath,
            title: room.title,
            author: room.author,
            hasBook: true
        });
    } catch (e) {
        console.error('[API Error] Failed to reupload book:', e);
        res.status(500).json({ error: 'Failed to reupload book' });
    }
});

// --- WebSocket Collaboration Hub (SQLite Backed) ---

const clients = new Map(); // ws -> { roomId, discordId, name, color, avatarUrl, wsId }

wss.on('connection', async (ws, req) => {
    const wsId = Math.random().toString(36).substring(2, 9);
    console.log(`[WS Connected] ID: ${wsId}`);

    const cookieHeader = req.headers.cookie || '';
    const cookies = parseCookies(cookieHeader);
    const token = cookies.token;

    let user = null;
    if (token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            user = await dbGet('SELECT * FROM users WHERE discord_id = ?', [payload.discord_id]);
        } catch (e) {
            console.error('[WS Auth Error] Invalid JWT session token');
        }
    }

    if (!user) {
        console.warn(`[WS Warning] Unauthenticated WebSocket connection. Closing.`);
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication required. Please login with Discord.' }));
        ws.close();
        return;
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                case 'join':
                    await handleJoin(ws, wsId, data, user);
                    break;
                case 'relocate':
                    await handleRelocate(ws, data, user);
                    break;
                case 'update_identity':
                    await handleUpdateIdentity(ws, data, user);
                    break;
                case 'add_highlight':
                    await handleAddHighlight(ws, data, user);
                    break;
                case 'delete_highlight':
                    await handleDeleteHighlight(ws, data, user);
                    break;
                case 'mousemove':
                    handleMouseMove(ws, data);
                    break;
                default:
                    console.warn(`[WS Warning] Unknown message type: ${data.type}`);
            }
        } catch (err) {
            console.error('[WS Error] Failed to process message:', err);
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

async function handleJoin(ws, wsId, data, user) {
    const { roomId } = data;
    const room = await dbGet('SELECT * FROM rooms WHERE room_id = ?', [roomId]);

    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
    }

    // Limit room to a maximum of 8 simultaneous readers
    const activeReaders = Array.from(clients.values()).filter(c => c.roomId === roomId);
    if (activeReaders.length >= 8) {
        const isAlreadyConnected = activeReaders.some(c => c.discordId === user.discord_id);
        if (!isAlreadyConnected) {
            ws.send(JSON.stringify({ type: 'error', message: 'This room is full (maximum 8 readers).' }));
            setTimeout(() => ws.close(), 100);
            return;
        }
    }

    // Limit user active room participation to 4 rooms maximum
    if (!isLimitExempt(user)) {
        const isMember = await dbGet(
            'SELECT 1 FROM room_members WHERE room_id = ? AND discord_id = ?',
            [roomId, user.discord_id]
        );

        if (!isMember) {
            const participationCountRow = await dbGet(`
                SELECT COUNT(DISTINCT r.room_id) as count
                FROM rooms r
                JOIN room_members rm ON r.room_id = rm.room_id
                WHERE rm.discord_id = ? AND r.book_path IS NOT NULL AND r.book_path != ''
            `, [user.discord_id]);

            if (participationCountRow && participationCountRow.count >= 4) {
                ws.send(JSON.stringify({ type: 'error', message: 'Participation limit exceeded: You cannot participate in more than 4 active rooms at the same time.' }));
                setTimeout(() => ws.close(), 100);
                return;
            }
        }
    }

    // Update room last_active to reset countdown
    await dbRun('UPDATE rooms SET last_active = ? WHERE room_id = ?', [new Date().toISOString(), roomId]);

    // Register active client info
    clients.set(ws, {
        roomId,
        discordId: user.discord_id,
        name: user.username,
        color: user.color,
        avatarUrl: user.avatar_url,
        wsId
    });

    // Update active member in SQLite
    await dbRun(`
        INSERT INTO room_members (room_id, discord_id, cfi, fraction, last_active)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(room_id, discord_id) DO UPDATE SET
            last_active = excluded.last_active
    `, [roomId, user.discord_id, null, 0, new Date().toISOString()]);

    console.log(`[Join] ${user.username} joined Room: ${roomId}`);

    // Load active room members from DB
    const membersRows = await dbAll(`
        SELECT rm.discord_id, rm.cfi, rm.fraction, rm.chapter, u.username, u.avatar_url, u.color
        FROM room_members rm
        JOIN users u ON rm.discord_id = u.discord_id
        WHERE rm.room_id = ?
    `, [roomId]);

    // Format room members state
    const members = {};
    membersRows.forEach(row => {
        // Map to client wsId format if active in memory, or fallback to discordId
        // Find if this member is currently online/connected
        const activeClient = Array.from(clients.values()).find(
            c => c.roomId === roomId && c.discordId === row.discord_id
        );
        
        const key = activeClient ? activeClient.wsId : `offline-${row.discord_id}`;
        members[key] = {
            name: row.username,
            color: row.color,
            avatarUrl: row.avatar_url,
            cfi: row.cfi,
            fraction: row.fraction,
            chapter: row.chapter || '',
            isOnline: !!activeClient
        };
    });

    // Load all room highlights from DB
    const highlightRows = await dbAll(`
        SELECT h.cfi, h.text, h.highlight_color, h.note, h.timestamp, u.username, u.color as user_color
        FROM highlights h
        JOIN users u ON h.discord_id = u.discord_id
        WHERE h.room_id = ?
    `, [roomId]);

    const highlights = {};
    highlightRows.forEach(row => {
        highlights[row.cfi] = {
            cfi: row.cfi,
            text: row.text,
            userName: row.username,
            userColor: row.user_color,
            highlightColor: row.highlight_color,
            note: row.note,
            timestamp: row.timestamp
        };
    });

    // Send room state to the joining user
    ws.send(JSON.stringify({
        type: 'room_state',
        roomId,
        members,
        highlights,
        yourId: wsId
    }));

    // Fetch this joining member's saved progress to broadcast it correctly
    const myProgress = await dbGet(`
        SELECT cfi, fraction, chapter FROM room_members 
        WHERE room_id = ? AND discord_id = ?
    `, [roomId, user.discord_id]);

    // Broadcast member joined to others online in the same room
    broadcastToRoom(roomId, ws, {
        type: 'member_joined',
        wsId,
        member: {
            name: user.username,
            color: user.color,
            avatarUrl: user.avatar_url,
            cfi: myProgress ? myProgress.cfi : null,
            fraction: myProgress ? myProgress.fraction : 0,
            chapter: (myProgress && myProgress.chapter) ? myProgress.chapter : '',
            isOnline: true
        }
    });
}

async function handleRelocate(ws, data, user) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId, wsId } = client;
    const { cfi, fraction, chapter } = data;

    await dbRun(`
        UPDATE room_members
        SET cfi = ?, fraction = ?, last_active = ?, chapter = ?
        WHERE room_id = ? AND discord_id = ?
    `, [cfi, fraction, new Date().toISOString(), chapter || '', roomId, user.discord_id]);

    broadcastToRoom(roomId, ws, {
        type: 'member_relocated',
        wsId,
        cfi,
        fraction,
        chapter: chapter || ''
    });
}

async function handleUpdateIdentity(ws, data, user) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId, wsId } = client;
    const { color } = data;

    if (color) {
        await dbRun('UPDATE users SET color = ? WHERE discord_id = ?', [color, user.discord_id]);
        client.color = color;

        console.log(`[Identity] ${user.username} updated color: ${color}`);

        broadcastToRoom(roomId, null, {
            type: 'member_updated',
            wsId,
            member: {
                name: user.username,
                color: color,
                avatarUrl: user.avatar_url,
                isOnline: true
            }
        });
    }
}

async function handleAddHighlight(ws, data, user) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId } = client;
    const { cfi, text, highlightColor, note } = data;

    const highlight = {
        cfi,
        text,
        userName: user.username,
        userColor: user.color,
        highlightColor: highlightColor || user.color,
        note: note || '',
        timestamp: new Date().toISOString()
    };

    await dbRun(`
        INSERT INTO highlights (cfi, room_id, text, discord_id, highlight_color, note, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cfi, room_id) DO UPDATE SET
            note = excluded.note,
            highlight_color = excluded.highlight_color
    `, [cfi, roomId, text, user.discord_id, highlight.highlightColor, highlight.note, highlight.timestamp]);

    broadcastToRoom(roomId, null, {
        type: 'highlight_added',
        cfi,
        highlight
    });
}

async function handleDeleteHighlight(ws, data, user) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId } = client;
    const { cfi } = data;

    await dbRun('DELETE FROM highlights WHERE cfi = ? AND room_id = ?', [cfi, roomId]);

    broadcastToRoom(roomId, null, {
        type: 'highlight_deleted',
        cfi
    });
}

function handleMouseMove(ws, data) {
    const client = clients.get(ws);
    if (!client) return;
    
    broadcastToRoom(client.roomId, ws, {
        type: 'mousemove',
        wsId: client.wsId,
        name: client.name,
        color: client.color,
        x: data.x,
        y: data.y,
        index: data.index
    });
}

function handleDisconnect(ws) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId, wsId, name } = client;
    clients.delete(ws);

    console.log(`[Leave] ${name} left Room: ${roomId}`);

    broadcastToRoom(roomId, null, {
        type: 'member_left',
        wsId
    });
}

function broadcastToRoom(roomId, excludeWs, messageObj) {
    const messageStr = JSON.stringify(messageObj);
    for (const [ws, client] of clients.entries()) {
        if (client.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
            ws.send(messageStr);
        }
    }
}

// Ephemeral Storage: Prune files older than 24 hours (local and Supabase)
function startPruningTask() {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    
    console.log('[Pruner] Initializing automatic file pruning task (Runs every 1 hour).');
    
    setInterval(async () => {
        console.log('[Pruner] Running file pruning check...');
        const cutoffTime = new Date(Date.now() - ONE_DAY_MS).toISOString();
        
        try {
            // Find rooms where last_active is older than 24 hours (or last_active is empty)
            // and book_path is not empty.
            const inactiveRooms = await dbAll(
                "SELECT room_id, book_path FROM rooms WHERE (last_active < ? OR last_active IS NULL OR last_active = '') AND book_path != ''",
                [cutoffTime]
            );
            
            if (inactiveRooms && inactiveRooms.length > 0) {
                console.log(`[Pruner] Found ${inactiveRooms.length} expired room sessions to prune.`);
                
                const supabaseKeysToDelete = [];
                
                for (const room of inactiveRooms) {
                    if (room.book_path.startsWith('supabase://')) {
                        const fileKey = room.book_path.replace('supabase://', '');
                        supabaseKeysToDelete.push(fileKey);
                    } else {
                        // Local file deletion
                        const filename = path.basename(room.book_path);
                        const filePath = path.join(uploadDir, filename);
                        if (fs.existsSync(filePath)) {
                            fs.unlink(filePath, (err) => {
                                if (!err) console.log(`[Pruner] Deleted local inactive book: ${filename}`);
                            });
                        }
                    }
                    
                    // Update room in db to clear book_path reference to indicate it's expired
                    // We keep filename/title/author so we can prompt for reupload!
                    await dbRun("UPDATE rooms SET book_path = '' WHERE room_id = ?", [room.room_id]);
                }
                
                // Delete from Supabase in bulk
                if (supabase && supabaseKeysToDelete.length > 0) {
                    console.log('[Pruner] Deleting from Supabase Storage:', supabaseKeysToDelete);
                    const { error } = await supabase.storage
                        .from('books')
                        .remove(supabaseKeysToDelete);
                    
                    if (error) {
                        console.error('[Pruner Error] Failed to delete from Supabase Storage:', error);
                    } else {
                        console.log('[Pruner] Successfully pruned files from Supabase Storage.');
                    }
                }
            }
        } catch (e) {
            console.error('[Pruner Error] Pruning task encountered an error:', e);
        }
    }, 60 * 60 * 1000); // Check every 1 hour
}

startPruningTask();

// Express Error Handling Middleware to catch Multer and other unhandled errors gracefully
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum allowed size is 20MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err.message === 'Only EPUB files (.epub) are allowed.') {
        return res.status(400).json({ error: err.message });
    }
    console.error('[Unhandled Server Error]', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 3080;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`[Server] Running on http://${HOST}:${PORT}`);
});
