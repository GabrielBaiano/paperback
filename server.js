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
const supabaseUrl = process.env.SUPABASE_URL;
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
const uploadDir = fs.existsSync('/data')
    ? '/data/uploads'
    : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
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
const upload = multer({ storage });

app.use(express.json());
app.use(cookieParser());

// Serve static files from root
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Route to serve the main reader page at the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'reader.html'));
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

// 1. Redirect to Discord OAuth2 or login mock user if keys are missing
app.get('/api/auth/discord', async (req, res) => {
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
        console.log('[Auth] Discord credentials missing. Logging in as Mock User.');
        const mockUser = {
            discord_id: 'mock-id-123',
            username: 'DiscordUser_Dev',
            avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
            color: '#7289da'
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
        res.cookie('token', sessionToken, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        return res.redirect('/');
    }

    const host = req.headers.host;
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

    const roomId = Math.random().toString(36).substring(2, 11);
    const title = req.body.title || 'Untitled';
    const author = req.body.author || 'Unknown';
    let bookPath = '';

    try {
        if (supabase) {
            // Upload to Supabase Storage
            const fileKey = `${roomId}-${Date.now()}-${req.file.originalname}`;
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

        await dbRun(`
            INSERT INTO rooms (room_id, book_path, filename, title, author, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [roomId, bookPath, req.file.originalname, title, author, new Date().toISOString()]);

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
            const fileKey = `${roomId}-${Date.now()}-${req.file.originalname}`;
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

        await dbRun('UPDATE rooms SET book_path = ? WHERE room_id = ?', [bookPath, roomId]);

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
        SELECT rm.discord_id, rm.cfi, rm.fraction, u.username, u.avatar_url, u.color
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

    // Broadcast member joined to others online in the same room
    broadcastToRoom(roomId, ws, {
        type: 'member_joined',
        wsId,
        member: {
            name: user.username,
            color: user.color,
            avatarUrl: user.avatar_url,
            cfi: null,
            fraction: 0,
            isOnline: true
        }
    });
}

async function handleRelocate(ws, data, user) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId, wsId } = client;
    const { cfi, fraction } = data;

    await dbRun(`
        UPDATE room_members
        SET cfi = ?, fraction = ?, last_active = ?
        WHERE room_id = ? AND discord_id = ?
    `, [cfi, fraction, new Date().toISOString(), roomId, user.discord_id]);

    broadcastToRoom(roomId, ws, {
        type: 'member_relocated',
        wsId,
        cfi,
        fraction
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
        const now = Date.now();
        
        // 1. Supabase Pruning
        if (supabase) {
            try {
                // List files in the books bucket
                const { data: files, error } = await supabase.storage
                    .from('books')
                    .list('', { limit: 100 });
                
                if (error) {
                    console.error('[Pruner Error] Failed to list Supabase files:', error);
                } else if (files && files.length > 0) {
                    const filesToDelete = files
                        .filter(f => {
                            const createdTime = new Date(f.created_at).getTime();
                            const age = now - createdTime;
                            return age > ONE_DAY_MS;
                        })
                        .map(f => f.name);
                    
                    if (filesToDelete.length > 0) {
                        console.log(`[Pruner] Deleting ${filesToDelete.length} inactive files from Supabase Storage:`, filesToDelete);
                        const { error: removeError } = await supabase.storage
                            .from('books')
                            .remove(filesToDelete);
                        
                        if (removeError) {
                            console.error('[Pruner Error] Failed to delete files from Supabase:', removeError);
                        } else {
                            console.log('[Pruner] Successfully pruned inactive files from Supabase Storage.');
                        }
                    }
                }
            } catch (e) {
                console.error('[Pruner Error] Supabase pruning error:', e);
            }
        }
        
        // 2. Local Fallback Pruning
        fs.readdir(uploadDir, (err, files) => {
            if (err) {
                // Ignore if uploadDir doesn't exist or can't be read
                return;
            }
            
            files.forEach(file => {
                const filePath = path.join(uploadDir, file);
                fs.stat(filePath, (statErr, stats) => {
                    if (statErr) return;
                    
                    const age = now - stats.mtimeMs;
                    if (age > ONE_DAY_MS) {
                        console.log(`[Pruner] Local file ${file} is inactive. Deleting...`);
                        fs.unlink(filePath, unlinkErr => {
                            if (!unlinkErr) {
                                console.log(`[Pruner] Successfully deleted local inactive book file: ${file}`);
                            }
                        });
                    }
                });
            });
        });
    }, 60 * 60 * 1000); // Check every 1 hour
}

startPruningTask();

const PORT = process.env.PORT || 3080;
server.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
});
