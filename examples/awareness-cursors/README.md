# Collaborative Cursors Demo

This example demonstrates the SyncKit Awareness Protocol with real-time collaborative cursors.

## Features

- **Real-time cursor tracking** - See other users' mouse positions in real-time
- **User presence** - Know who's online with you
- **Custom names and colors** - Personalize your cursor appearance
- **Automatic cleanup** - Cursors disappear when users leave
- **Live statistics** - Monitor connection status and updates

## How to Run

### 1. Start the SyncKit Server

First, make sure the SyncKit server is running:

```bash
cd server/typescript
npm run dev
```

The server will start on `http://localhost:8080`.

### 2. Open the Example

Open `index.html` in a browser. You can either:

**Option A:** Use a local server (recommended)

```bash
# From the synckit root directory
python3 -m http.server 8000
# or
npx http-server -p 8000
```

Then visit: `http://localhost:8000/examples/awareness-cursors/`

**Option B:** Open directly

Simply open `index.html` in your browser. Note that some browsers may restrict ES modules from `file://` URLs.

### 3. Test Multi-User Collaboration

Open the same page in multiple browser tabs or windows. You'll see:

- Each tab gets a random name and color
- Moving your mouse shows your cursor to others
- Other users' cursors appear with their names
- The sidebar shows all online users
- Closing a tab removes that user's cursor

## How It Works

The example uses the SyncKit Awareness Protocol:

1. **Initialization** - Creates a SyncKit instance connected to the server
2. **Awareness Instance** - Gets an awareness instance for the shared document
3. **Subscribe** - Listens for awareness changes (users joining/leaving, cursor moves)
4. **Update State** - Broadcasts cursor position on mouse move
5. **Render** - Displays other users' cursors based on their awareness state
6. **Cleanup** - Automatically sends leave message when tab closes

## Customization

You can customize the experience by modifying:

- **Document ID** - Change `'awareness-demo'` to use a different room
- **User Properties** - Add more fields to `myState` (e.g., selected tool, status)
- **Cursor Style** - Modify the `.cursor` CSS class
- **Update Throttling** - Add throttling to `mousemove` for better performance

## Code Highlights

### Setting Up Awareness

```javascript
const synckit = new SyncKit({
    serverUrl: 'ws://127.0.0.1:8080/ws'
})
await synckit.init()

const awareness = synckit.getAwareness('awareness-demo')
await awareness.init()
```

### Broadcasting State

```javascript
await awareness.setLocalState({
    user: { name: 'Alice', color: '#FF6B6B' },
    cursor: { x: 100, y: 200 }
})
```

### Subscribing to Changes

```javascript
awareness.subscribe(({ added, updated, removed }) => {
    // Handle users joining
    for (const clientId of added) {
        const state = awareness.getState(clientId)
        // Create cursor for new user
    }

    // Handle updates
    for (const clientId of updated) {
        const state = awareness.getState(clientId)
        // Update cursor position
    }

    // Handle users leaving
    for (const clientId of removed) {
        // Remove cursor
    }
})
```

## Learn More

- [Awareness Protocol Documentation](../../docs/awareness-protocol.md)
- [React Hooks for Awareness](../../sdk/src/adapters/react.tsx)
- [SyncKit API Reference](../../sdk/README.md)
