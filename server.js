import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Configure multer for file uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
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

// Serve static files from root
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// In-memory state
// roomId -> { roomId, bookPath, filename, title, author, members: { wsId: { name, color, cfi, fraction } }, highlights: { cfi: { cfi, text, userName, userColor, comments: [] } } }
const rooms = new Map();

// API endpoint to create a room
app.post('/api/rooms', upload.single('book'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No book file uploaded' });
    }

    const roomId = Math.random().toString(36).substring(2, 11);
    const bookPath = `/uploads/${req.file.filename}`;
    
    const roomState = {
        roomId,
        bookPath,
        filename: req.file.originalname,
        title: req.body.title || 'Untitled',
        author: req.body.author || 'Unknown',
        members: {},
        highlights: {}
    };

    rooms.set(roomId, roomState);
    console.log(`[Room Created] Room ID: ${roomId}, Book: ${roomState.title}`);

    res.json({
        roomId,
        bookPath,
        title: roomState.title,
        author: roomState.author
    });
});

// API endpoint to get room metadata
app.get('/api/rooms/:roomId', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    res.json({
        roomId: room.roomId,
        bookPath: room.bookPath,
        title: room.title,
        author: room.author,
        hasBook: true
    });
});

// WebSockets Connection Handler
const clients = new Map(); // ws -> { roomId, name, color, wsId }

wss.on('connection', (ws) => {
    const wsId = Math.random().toString(36).substring(2, 9);
    console.log(`[WS Connected] ID: ${wsId}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    handleJoin(ws, wsId, data);
                    break;
                case 'relocate':
                    handleRelocate(ws, data);
                    break;
                case 'add_highlight':
                    handleAddHighlight(ws, data);
                    break;
                case 'delete_highlight':
                    handleDeleteHighlight(ws, data);
                    break;
                case 'add_comment':
                    handleAddComment(ws, data);
                    break;
                default:
                    console.warn(`[WS Warning] Unknown message type: ${data.type}`);
            }
        } catch (err) {
            console.error('[WS Error] Failed to parse message:', err);
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

function handleJoin(ws, wsId, data) {
    const { roomId, name, color } = data;
    const room = rooms.get(roomId);

    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
    }

    // Register client info
    clients.set(ws, { roomId, name, color, wsId });

    // Add to room members
    room.members[wsId] = {
        name,
        color,
        cfi: null,
        fraction: 0
    };

    console.log(`[Join] ${name} joined Room: ${roomId}`);

    // Send current state to joining user
    ws.send(JSON.stringify({
        type: 'room_state',
        roomId,
        members: room.members,
        highlights: room.highlights,
        yourId: wsId
    }));

    // Broadcast to others in the room
    broadcastToRoom(roomId, ws, {
        type: 'member_joined',
        wsId,
        member: room.members[wsId]
    });
}

function handleRelocate(ws, data) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId, wsId } = client;
    const { cfi, fraction } = data;
    const room = rooms.get(roomId);

    if (room && room.members[wsId]) {
        room.members[wsId].cfi = cfi;
        room.members[wsId].fraction = fraction;

        broadcastToRoom(roomId, ws, {
            type: 'member_relocated',
            wsId,
            cfi,
            fraction
        });
    }
}

function handleAddHighlight(ws, data) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId, name, color } = client;
    const { cfi, text, highlightColor } = data;
    const room = rooms.get(roomId);

    if (room) {
        room.highlights[cfi] = {
            cfi,
            text,
            userName: name,
            userColor: color,
            highlightColor: highlightColor || color,
            comments: []
        };

        broadcastToRoom(roomId, null, {
            type: 'highlight_added',
            highlight: room.highlights[cfi]
        });
    }
}

function handleDeleteHighlight(ws, data) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId } = client;
    const { cfi } = data;
    const room = rooms.get(roomId);

    if (room && room.highlights[cfi]) {
        delete room.highlights[cfi];

        broadcastToRoom(roomId, null, {
            type: 'highlight_deleted',
            cfi
        });
    }
}

function handleAddComment(ws, data) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId, name, color } = client;
    const { cfi, commentText } = data;
    const room = rooms.get(roomId);

    if (room && room.highlights[cfi]) {
        const comment = {
            id: Math.random().toString(36).substring(2, 9),
            userName: name,
            userColor: color,
            text: commentText,
            timestamp: new Date().toISOString()
        };

        room.highlights[cfi].comments.push(comment);

        broadcastToRoom(roomId, null, {
            type: 'comment_added',
            cfi,
            comment
        });
    }
}

function handleDisconnect(ws) {
    const client = clients.get(ws);
    if (!client) return;

    const { roomId, wsId, name } = client;
    clients.delete(ws);

    const room = rooms.get(roomId);
    if (room) {
        delete room.members[wsId];
        console.log(`[Leave] ${name} left Room: ${roomId}`);

        broadcastToRoom(roomId, null, {
            type: 'member_left',
            wsId
        });
    }
}

function broadcastToRoom(roomId, excludeWs, messageObj) {
    const messageStr = JSON.stringify(messageObj);
    for (const [ws, client] of clients.entries()) {
        if (client.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
            ws.send(messageStr);
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
});
