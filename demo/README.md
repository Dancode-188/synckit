# SyncKit Live Demo

Production demo for SyncKit v0.2.3 showcasing real-time collaboration.

## What This Demo Does

- **Room isolation** - Each visitor gets a unique room (no shared state chaos)
- **URL-based sharing** - Share the link to collaborate with others
- **Real-time sync** - Type in one tab, see it in another instantly
- **Offline-first** - Works without internet connection
- **Cross-tab sync** - Changes sync across all tabs automatically

## Running Locally

Install dependencies:

```bash
cd demo
npm install
```

Start the dev server:

```bash
npm run dev
```

Test real-time sync by opening the same URL in multiple tabs:

1. Open http://localhost:5173
2. Copy the URL (it includes a room hash)
3. Paste it in a new tab
4. Type in one tab and watch it appear in the other

## How It Works

The demo uses URL hash-based room isolation. When you first visit, it generates a random room ID and adds it to the URL (`#room-abc123`). This means:

- Each visitor gets their own private room by default
- You can share the URL to invite others to your room
- No accidental shared state between random visitors
- Good for demos because it doesn't overwhelm the server with everyone editing the same document

## Testing Checklist

Basic functionality:
- Opens without errors
- Generates unique room ID in URL hash
- Multiple tabs with same URL sync in real-time
- Offline mode works (disconnect internet, type, reconnect)
- Copy URL button works
- UI is clean

## Notes

Previous attempts to deploy this on CodeSandbox ran into WASM serving issues. Local development and proper hosting (like Netlify) work fine.
