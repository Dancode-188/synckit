# Awareness Protocol

The Awareness Protocol provides real-time presence and ephemeral state synchronization between connected clients. Unlike CRDTs which persist data, awareness tracks temporary information like who's online, cursor positions, and user selections.

## What is Awareness?

Awareness is perfect for:
- **User presence** - Who's currently viewing the document
- **Cursor positions** - Real-time cursor tracking
- **Selections** - Text or object selections
- **Typing indicators** - Show when users are typing
- **Custom presence metadata** - Any ephemeral state (status, activity, etc.)

Awareness state is:
- **Ephemeral** - Not persisted to storage
- **Real-time** - Broadcast immediately to connected clients
- **Scoped** - Per-document awareness instances
- **Conflict-free** - Uses logical clocks for ordering

## Quick Start

### Basic Usage

```javascript
import { SyncKit } from '@synckit-js/sdk'

// Initialize SyncKit
const synckit = new SyncKit({
    serverUrl: 'ws://localhost:8080/ws'
})
await synckit.init()

// Get awareness instance for a document
const awareness = synckit.getAwareness('my-document')
await awareness.init()

// Subscribe to awareness for this document
await synckit.syncManager.subscribeToAwareness('my-document')

// Set your local state
await awareness.setLocalState({
    user: {
        name: 'Alice',
        color: '#FF6B6B'
    },
    cursor: { x: 100, y: 200 }
})

// Subscribe to changes
awareness.subscribe(({ added, updated, removed }) => {
    console.log('Users joined:', added)
    console.log('Users updated:', updated)
    console.log('Users left:', removed)

    // Get all current states
    const states = awareness.getStates()
    console.log(`${states.size} users online`)
})
```

## React Hooks

SyncKit provides ready-to-use React hooks for awareness:

### usePresence

Manage local user presence state:

```tsx
import { usePresence } from '@synckit-js/sdk/react'

function Cursor() {
    const [presence, setPresence] = usePresence('doc-123', {
        user: { name: 'Alice', color: '#FF6B6B' }
    })

    const handleMouseMove = (e) => {
        setPresence({
            ...presence,
            cursor: { x: e.clientX, y: e.clientY }
        })
    }

    return <div onMouseMove={handleMouseMove}>Move your mouse</div>
}
```

### useOthers

Track other online users:

```tsx
import { useOthers } from '@synckit-js/sdk/react'

function OnlineUsers() {
    const others = useOthers('doc-123')

    return (
        <div>
            <h3>{others.length} others online</h3>
            {others.map(user => (
                <div key={user.client_id}>
                    {user.state.user?.name || 'Anonymous'}
                </div>
            ))}
        </div>
    )
}
```

### useSelf

Track your own awareness state:

```tsx
import { useSelf } from '@synckit-js/sdk/react'

function MyPresence() {
    const self = useSelf('doc-123')

    if (!self) return <p>Not initialized</p>

    return (
        <div>
            <p>You: {self.state.user?.name}</p>
            <p>Cursor: {JSON.stringify(self.state.cursor)}</p>
        </div>
    )
}
```

### useAwareness

Direct access to awareness instance:

```tsx
import { useAwareness } from '@synckit-js/sdk/react'

function UserPresence() {
    const [awareness, { setLocalState }] = useAwareness('doc-123')

    useEffect(() => {
        setLocalState({
            user: { name: 'Alice', color: '#FF6B6B' }
        })
    }, [])

    const states = awareness?.getStates()
    return <p>{states?.size || 0} users online</p>
}
```

## API Reference

### Awareness Class

#### `init(): Promise<void>`

Initialize the awareness instance. Must be called before using other methods.

```javascript
await awareness.init()
```

#### `setLocalState(state: Record<string, unknown>): Promise<AwarenessUpdate>`

Set your local awareness state. Automatically broadcasts to other clients.

```javascript
const update = await awareness.setLocalState({
    user: { name: 'Alice', color: '#FF6B6B' },
    cursor: { x: 100, y: 200 },
    selection: { start: 0, end: 10 }
})
```

#### `applyUpdate(update: AwarenessUpdate): void`

Apply a remote awareness update. Usually handled automatically by the sync manager.

```javascript
awareness.applyUpdate({
    client_id: 'client-2',
    state: { user: { name: 'Bob' } },
    clock: 5
})
```

#### `getStates(): Map<string, AwarenessState>`

Get all current client states.

```javascript
const states = awareness.getStates()
for (const [clientId, state] of states.entries()) {
    console.log(`${clientId}: ${state.state.user?.name}`)
}
```

#### `getState(clientId: string): AwarenessState | undefined`

Get state for a specific client.

```javascript
const state = awareness.getState('client-2')
console.log(state?.state.user?.name) // 'Bob'
```

#### `getLocalState(): AwarenessState | undefined`

Get your own awareness state.

```javascript
const myState = awareness.getLocalState()
console.log(myState?.state.cursor)
```

#### `subscribe(callback: AwarenessCallback): () => void`

Subscribe to awareness changes. Returns an unsubscribe function.

```javascript
const unsubscribe = awareness.subscribe(({ added, updated, removed }) => {
    console.log('Changes:', { added, updated, removed })
})

// Later: stop listening
unsubscribe()
```

#### `createLeaveUpdate(): AwarenessUpdate`

Create a leave update to notify other clients you're disconnecting. Automatically called on cleanup.

```javascript
const leaveUpdate = awareness.createLeaveUpdate()
```

#### `getClientId(): string`

Get your client ID.

```javascript
const myClientId = awareness.getClientId()
```

#### `clientCount(): number`

Get total number of online clients (including yourself).

```javascript
const total = awareness.clientCount()
```

#### `otherClientCount(): number`

Get number of other clients (excluding yourself).

```javascript
const others = awareness.otherClientCount()
```

## Lifecycle Management

### Automatic Cleanup

SyncKit automatically handles cleanup:

1. **Component Unmount** - React hooks send leave messages when components unmount
2. **Page Close** - beforeunload handler sends leave messages when closing tabs
3. **Dispose** - Calling `synckit.dispose()` sends leave messages for all awareness instances

```javascript
// Manual cleanup
synckit.sendAllLeaveUpdates()  // Send leave for all documents
synckit.dispose()               // Full cleanup with leave messages
```

### Server-Side Cleanup

The server also removes stale clients:
- Heartbeat mechanism detects dead connections
- Timeout-based removal of inactive clients
- Automatic broadcast of removal to other clients

## Best Practices

### 1. Keep State Small

Awareness is sent on every update, so keep state lightweight:

```javascript
// Good - minimal state
await awareness.setLocalState({
    cursor: { x: 100, y: 200 },
    color: '#FF6B6B'
})

// Bad - too much data
await awareness.setLocalState({
    cursor: { x: 100, y: 200 },
    fullDocument: { ...  }, // Don't include large objects
    history: [...] // Don't include arrays
})
```

### 2. Throttle High-Frequency Updates

Throttle rapid updates like mouse movement:

```javascript
import { throttle } from 'lodash'

const updateCursor = throttle(async (x, y) => {
    await awareness.setLocalState({
        ...myState,
        cursor: { x, y }
    })
}, 50) // Update at most every 50ms

canvas.addEventListener('mousemove', (e) => {
    updateCursor(e.clientX, e.clientY)
})
```

### 3. Handle Disconnections Gracefully

The awareness protocol handles disconnections automatically, but you should update your UI:

```javascript
awareness.subscribe(({ removed }) => {
    for (const clientId of removed) {
        removeCursorFromUI(clientId)
        showNotification(`${getUserName(clientId)} left`)
    }
})
```

### 4. Initialize State on Mount

Set initial state when component mounts:

```javascript
useEffect(() => {
    setLocalState({
        user: { name: getCurrentUser().name, color: '#FF6B6B' },
        status: 'active'
    })
}, [])
```

## Examples

### Collaborative Cursors

See [examples/awareness-cursors](../../examples/awareness-cursors/) for a complete working example with:
- Real-time cursor tracking
- User names and colors
- Live user list
- Automatic cleanup

### Typing Indicators

```javascript
let typingTimeout

input.addEventListener('input', async () => {
    // Set typing state
    await awareness.setLocalState({
        ...myState,
        typing: true
    })

    // Clear after 2 seconds of no typing
    clearTimeout(typingTimeout)
    typingTimeout = setTimeout(async () => {
        await awareness.setLocalState({
            ...myState,
            typing: false
        })
    }, 2000)
})

// Show who's typing
awareness.subscribe(() => {
    const states = awareness.getStates()
    const typingUsers = Array.from(states.values())
        .filter(s => s.state.typing && s.client_id !== awareness.getClientId())
        .map(s => s.state.user?.name)

    if (typingUsers.length > 0) {
        showTypingIndicator(`${typingUsers.join(', ')} ${typingUsers.length === 1 ? 'is' : 'are'} typing...`)
    }
})
```

### Selection Tracking

```javascript
document.addEventListener('selectionchange', async () => {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        await awareness.setLocalState({
            ...myState,
            selection: {
                start: range.startOffset,
                end: range.endOffset,
                text: range.toString()
            }
        })
    }
})
```

## Architecture

### How It Works

1. **Client Side**
   - Awareness state managed by WASM module (Rust)
   - Logical clock ensures ordering
   - onChange callback broadcasts to server

2. **Server Side**
   - Receives awareness updates via WebSocket
   - Broadcasts to all clients subscribed to the document
   - Tracks active clients and removes stale ones

3. **WASM Compatibility**
   - Time tracking conditionally compiled for WASM
   - Stale client removal handled server-side in WASM builds
   - Full protocol works in browser environments

### Message Flow

```
Client A                   Server                    Client B
   |                         |                          |
   |-- awareness_subscribe ->|                          |
   |<- awareness_state ------|                          |
   |                         |                          |
   |-- awareness_update ---->|                          |
   |   (cursor moved)        |--- awareness_update --->|
   |                         |    (Client A's cursor)  |
   |                         |                          |
   |                         |<-- awareness_update -----|
   |<-- awareness_update -----|   (Client B's cursor)  |
   |    (Client B's cursor)  |                          |
```

## Troubleshooting

### Awareness Not Syncing

1. Check server connection:
```javascript
const status = synckit.getNetworkStatus()
console.log('Connected:', status?.connected)
```

2. Verify subscription:
```javascript
await synckit.syncManager.subscribeToAwareness(documentId)
```

3. Check awareness initialization:
```javascript
await awareness.init()
```

### Performance Issues

1. Throttle high-frequency updates
2. Reduce state size
3. Limit number of tracked properties

### Memory Leaks

1. Always unsubscribe from awareness changes:
```javascript
const unsubscribe = awareness.subscribe(callback)
// Later:
unsubscribe()
```

2. Use React hooks (they handle cleanup automatically)

3. Call `dispose()` when done:
```javascript
synckit.dispose() // Cleans up all resources
```

## Learn More

- [API Reference](../api/SDK_API.md)
- [React Hooks Guide](./react-hooks.md)
- [Architecture Overview](../architecture/ARCHITECTURE.md)
- [Examples](../../examples/)
