<p align="center">
  <img src="https://raw.githubusercontent.com/GabrielBaiano/paperback/main/ui/logo.jpg" alt="Paperback Logo" width="200"/>
</p>

<h1 align="center">Paperback</h1>

<p align="center">
  <strong>A clean, fast, and lightweight collaborative e-book reader in the browser.</strong><br>
  <em>Built for readers who love sharing books with friends.</em>
</p>

<p align="center">
  <a href="https://paperback.fly.dev/"><img src="https://img.shields.io/badge/Launch%20App-Paperback-007acc?style=for-the-badge&logo=rocket" alt="Launch App"></a>
  <a href="https://github.com/GabrielBaiano/paperback"><img src="https://img.shields.io/badge/License-MIT-4caf50?style=for-the-badge" alt="License"></a>
  <a href="https://buymeacoffee.com/gabrielngal"><img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee"></a>
</p>

---

## Table of Contents
- [Introduction](#introduction)
- [How It Works (For Readers)](#how-it-works-for-readers)
- [Book Expiration and Highlights](#book-expiration-and-highlights)
- [Credits and Attribution](#credits-and-attribution)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Performance](#performance)
- [Installation](#installation)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Development](#development)
- [Deployment](#deployment)
- [Support](#support)
- [Contributing](#contributing)
- [License](#license)

## Introduction
Paperback is a high-performance web-based collaborative e-book reader. It forks the clean, browser-native EPUB rendering capabilities of Foliate-JS and extends it with real-time multiplayer synchronization, shared highlights, comments, and secure Discord authentication.

## How It Works (For Readers)
Paperback is designed to make reading with friends as seamless as possible:
1. **Connect your Profile**: Click "Connect with Discord" to log in. This allows your friends to see your username and avatar while reading.
2. **Create a Room**: Upload an EPUB file of the book you want to read. Once uploaded, a unique Room Code will be generated.
3. **Invite Friends**: Copy the Room Code or the invite link and share it with your friends. Once they join, they can see your current page position, highlights, and comments in real-time.
4. **Collaborate**: Highlight any text to select a color, write inline annotations, and view other readers' comments in the sidebar.

## Book Expiration and Highlights
To keep infrastructure costs completely free, Paperback operates on an ephemeral storage policy:
- **Automatic Pruning**: Book files are automatically deleted from our secure cloud storage after **24 hours of inactivity** (meaning no one has opened the room or read the book for 24 hours).
- **Your Highlights are Safe**: Deleting the book file **never** deletes your notes, highlights, or comments. Those are permanently stored in our database.
- **Easy Recovery**: If you open an expired room, Paperback will prompt you to drag and drop the required EPUB file. Once you provide the file, the session is restored instantly, and everyone can resume reading where they left off.

## Credits and Attribution
Paperback is a fork of [foliate-js](https://github.com/johnfactotum/foliate-js), the brilliant browser-native book rendering library created by [John Factotum](https://github.com/johnfactotum). We are incredibly grateful for his open-source work that forms the foundation of this collaborative reader.

## Key Features
- **Discord OAuth2 Integration**: Secure, single-click login using Discord profiles, showing reader avatars directly in the reading rooms.
- **Real-Time Collaboration**: Sychronized WebSocket broker broadcasts members' reading locations (CFI page hashes) live, rendering dynamic progress metrics.
- **Shared Highlights & Notes**: Create colored highlights, add inline comments, and view annotations placed by friends instantly while reading.
- **Ephemeral Cloud Storage**: Save bandwidth and disk space with a hybrid storage engine that uploads EPUB books to Supabase Storage, generating secure 24-hour signed URLs for downloads, with an automatic background cleanup task for inactive rooms.
- **Session Restoring Prompt**: If a book expires after 24 hours of inactivity, the database keeps highlights intact, and the UI prompts the reader to drag/select the EPUB file to restore the session instantly.

## Architecture
This project follows a clean Client-Server pattern.
- **Core Engine**: Foliate-JS epub rendering engine running locally in the browser to parse EPUB, FB2, and MOBI files.
- **Backend Broker**: Express.js web server and ws WebSocket server running on Node.js.
- **Database**: SQLite database persisting users, rooms, reading position, and highlight comments.
- **Storage Adapter**: Hybrid storage layer uploading to Supabase Storage (Object Storage) or falling back to Fly.io local disk.

## Performance
We take performance seriously.
- **Lightweight DB Records**: Progress coordinates and highlight JSON payloads are less than 1KB, ensuring sub-millisecond query execution.
- **Zero-Bandwidth Downloads**: When using Supabase Storage, book downloads are routed directly through Supabase's high-speed CDN, saving the application server's network bandwidth.
- **Clean Disk Footprint**: Inactive book files are automatically pruned by a background task after 24 hours of inactivity, keeping storage costs at absolute zero.

## Installation

### Prerequisites
- Node.js >= 20.0.0
- npm

### Setup
```bash
# Clone the repository
git clone https://github.com/GabrielBaiano/paperback.git

# Install dependencies
npm install
```

## Usage Examples

### Local Development (Mock Mode)
To run the server locally without configuring third-party Discord API keys or Supabase Storage:
1. Start the server:
   ```bash
   npm start
   ```
2. Open `http://localhost:3080` in your browser.
3. Click "Connect with Discord" to log in instantly with a development mock profile. All files will be saved to the local `uploads` directory.

### Production Environment Variables
Configure these variables in your `.env` or cloud provider panel (such as Fly.io secrets) to enable OAuth2 and Cloud Storage:
```env
# Discord OAuth Credentials
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=https://your-domain.com/api/auth/discord/callback

# JWT Token Secret
JWT_SECRET=your_jwt_signing_key

# Supabase Credentials (Optional - Falls back to local disk if omitted)
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_secret

# Whitelisted Admins (Comma-separated Discord usernames for infinite room creation)
ADMIN_USERS=gabrielbaiano_
```

## API Reference
The backend exposes the following REST API endpoints:
- `GET /api/auth/discord` - Initiates the Discord OAuth authentication flow.
- `GET /api/auth/discord/callback` - Processes OAuth callback and issues secure HTTP-only cookies.
- `GET /api/auth/me` - Retrieves the authenticated user profile.
- `POST /api/auth/logout` - Clears the authentication token cookie.
- `POST /api/rooms` - Creates a new reading room (accepts EPUB multipart upload).
- `GET /api/rooms/:roomId` - Returns room metadata and verifies if the book file exists.
- `POST /api/rooms/:roomId/reupload` - Restores an expired reading session with a fresh book file.
- `GET /api/my-rooms` - Lists rooms in which the user is active (history).

## Development
To start contributing to the development:
```bash
npm start
```

## Deployment
This project is configured for easy deployment on **Fly.io** using the provided `Dockerfile` and `fly.toml`:
```bash
# Log in to Fly.io
fly auth login

# Deploy the application
fly deploy
```

## Support
If you find Paperback helpful and want to support its active development, you can buy me a coffee!

Quer me ajudar? [Buy me a coffee!](https://buymeacoffee.com/gabrielngal)

## Contributing
Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are greatly appreciated.

## License
Distributed under the MIT License. See `LICENSE` for more information.

---
<p align="center">
  Quer me ajudar? <a href="https://buymeacoffee.com/gabrielngal">Buy me a coffee!</a>
</p>
<p align="center">
  Made by <a href="https://github.com/GabrielBaiano">Gabriel Baiano</a>
</p>
