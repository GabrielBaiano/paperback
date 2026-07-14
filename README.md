<p align="center">
  <img src="https://raw.githubusercontent.com/GabrielBaiano/paperback/main/ui/logo.jpg" alt="Paperback Logo" width="200"/>
</p>

<h1 align="center">Paperback</h1>

<p align="center">
  <strong>A clean, fast, and lightweight collaborative e-book reader in the browser.</strong><br>
  <em>Read books together with your friends, partners, or book clubs in real-time.</em>
</p>

<p align="center">
  <a href="https://paperback.fly.dev/"><img src="https://img.shields.io/badge/Website-Live-brightgreen.svg" alt="Website"></a>
  <a href="https://paperback.fly.dev/"><img src="https://img.shields.io/badge/Demo-Online-orange.svg" alt="Demo"></a>
  <a href="https://github.com/GabrielBaiano/paperback"><img src="https://img.shields.io/github/license/GabrielBaiano/paperback.svg" alt="License"></a>
  <a href="https://buymeacoffee.com/gabrielngal"><img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow.svg" alt="Buy Me A Coffee"></a>
</p>

---

## Table of Contents
- [Introduction](#introduction)
- [How to Use (Quick Start)](#how-to-use-quick-start)
- [Book Expiration and Highlights (FAQ)](#book-expiration-and-highlights-faq)
- [Credits and Attribution](#credits-and-attribution)
- [Key Features](#key-features)
- [Developer Setup](#developer-setup)
- [Support](#support)
- [License](#license)

## Introduction
Paperback is a free web application that allows multiple people to read e-books together in real-time. Whether you are running a virtual book club, studying textbook chapters with classmates, or sharing a novel with a long-distance partner, Paperback synchronizes your reading positions, highlights, and annotations instantly.

## How to Use (Quick Start)
Getting started with Paperback is simple and requires no software installation:
1. **Log In**: Visit the website and click "Connect with Discord". This links your reading profile so friends can identify you in the room.
2. **Create a Room**: Upload an EPUB file of the book you want to read. The app will immediately open the reader and generate a unique Room Code.
3. **Share the Code**: Copy the room URL or code and send it to your friends.
4. **Read Together**: As soon as your friends join, you will see their progress markers on the page. Highlight text to choose a color or write inline comments that everyone in the room can see instantly.

## Book Expiration and Highlights (FAQ)

### Do my books stay online forever?
To keep server and storage costs at absolute zero, book files are automatically removed after **24 hours of inactivity** (meaning 24 hours without anyone opening the room or reading). 

### Will I lose my highlights and notes if a book expires?
**No.** All of your highlights, colored markers, notes, and progress coordinates are stored permanently in our database. Deleting the book file never deletes your annotations.

### How do I restore an expired session?
If you open an expired room, Paperback will show a welcome prompt asking you to drop or choose the required EPUB file. Once you provide the file, the book is uploaded again and you can resume reading immediately with all your highlights intact.

## Credits and Attribution
Paperback is a fork of the amazing [foliate-js](https://github.com/johnfactotum/foliate-js) library created by [John Factotum](https://github.com/johnfactotum). Foliate-JS provides the high-performance, browser-native rendering engine for EPUB, MOBI, and FB2 formats that Paperback builds upon. We are incredibly grateful for his work.

## Key Features
- **Discord Integration**: Single-click secure login displaying user avatars and custom colors in the reader.
- **Live Location Sync**: WebSocket synchronization displays page markers and progression indicators for all active readers.
- **Shared Highlights**: Highlight passages and add inline notes that sync in real-time.
- **Zero-Bandwidth Downloads**: Ephemeral files are uploaded to Supabase Storage and served via signed CDN links directly to the client's browser.
- **Reading History**: Access your recently opened active and expired rooms directly from the home dashboard.

## Developer Setup
If you want to run Paperback locally or deploy your own instance:

### Prerequisites
- Node.js >= 20.0.0
- npm

### Installation
```bash
# Clone the repository
git clone https://github.com/GabrielBaiano/paperback.git

# Install dependencies
npm install
```

### Running Locally (Mock Mode)
You can start a local development server without setting up Discord credentials or cloud storage:
```bash
npm start
```
Open `http://localhost:3080`. Logging in will automatically use a mock profile, and uploaded books will be saved to the local `uploads` directory.

### Environment Variables
Configure these in your production host (such as Fly.io) to enable full features:
```env
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=https://your-domain.com/api/auth/discord/callback
JWT_SECRET=your_jwt_signing_key
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_secret
ADMIN_USERS=gabrielbaiano_
```

## Support
If you find Paperback helpful and want to support its active development, or share it with others:

### Buy Me a Coffee
Want to support Paperback? Buy me a coffee!

<a href="https://buymeacoffee.com/gabrielngal" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="200" height="50" style="height: 50px !important; width: 200px !important;" />
</a>

### Share the Project
If you love reading books collaboratively with Paperback, help us spread the word! You can share the link with friends, invite them to your rooms, or tweet about it:

<a href="https://twitter.com/intent/tweet?text=Check%20out%20Paperback,%20a%20clean%20and%20lightweight%20collaborative%20e-book%20reader%20in%20the%20browser!%20https://github.com/GabrielBaiano/paperback" target="_blank">
  <img src="https://img.shields.io/badge/Share%20on-Twitter-1da1f2.svg?logo=twitter&logoColor=white&style=flat-square" alt="Share on Twitter" />
</a>

### Help Us Improve
Want to help make Paperback even better? We welcome all bug reports, feature suggestions, and pull requests!

<a href="./CONTRIBUTING.md">
  <img src="https://img.shields.io/badge/Contribute-Help%20Improve-blue.svg?style=flat-square" alt="Contributing Guide" />
</a>

## License
Distributed under the MIT License. See `LICENSE` for more information.

---
<p align="center">
  Want to support Paperback? <a href="https://buymeacoffee.com/gabrielngal">Buy me a coffee!</a>
</p>
<p align="center">
  Made by <a href="https://github.com/GabrielBaiano">Gabriel Baiano</a>
</p>
