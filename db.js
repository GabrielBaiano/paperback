import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if /data directory exists (common persistent volume mount path in production like Fly.io)
const dataDirExists = fs.existsSync('/data');
const dbPath = dataDirExists 
    ? '/data/foliate_jam.db' 
    : path.join(__dirname, 'foliate_jam.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('[DB] Failed to open SQLite database:', err);
    } else {
        console.log('[DB] SQLite database connected successfully. Path:', dbPath);
    }
});

// Helper for database schema migrations / table setup
db.serialize(() => {
    // 1. Users Table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            discord_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            avatar_url TEXT,
            color TEXT,
            last_login TEXT
        )
    `);

    // 2. Rooms Table
    db.run(`
        CREATE TABLE IF NOT EXISTS rooms (
            room_id TEXT PRIMARY KEY,
            book_path TEXT NOT NULL,
            filename TEXT NOT NULL,
            title TEXT,
            author TEXT,
            created_at TEXT NOT NULL
        )
    `);

    // 3. Room Members Table (composite key)
    db.run(`
        CREATE TABLE IF NOT EXISTS room_members (
            room_id TEXT,
            discord_id TEXT,
            cfi TEXT,
            fraction REAL,
            last_active TEXT,
            PRIMARY KEY (room_id, discord_id),
            FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
            FOREIGN KEY (discord_id) REFERENCES users(discord_id) ON DELETE CASCADE
        )
    `);

    // 4. Highlights Table
    db.run(`
        CREATE TABLE IF NOT EXISTS highlights (
            cfi TEXT,
            room_id TEXT,
            text TEXT NOT NULL,
            discord_id TEXT NOT NULL,
            highlight_color TEXT,
            note TEXT,
            timestamp TEXT NOT NULL,
            PRIMARY KEY (cfi, room_id),
            FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
            FOREIGN KEY (discord_id) REFERENCES users(discord_id) ON DELETE CASCADE
        )
    `);
});

// Helper functions for promise-based SQLite calls
export function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

export function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

export function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

export default db;
