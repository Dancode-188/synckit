# Network Synchronization API

Complete API reference for SyncKit's network synchronization features (v0.2.0).

## Table of Contents

- [Configuration](#configuration)
- [Network Status](#network-status)
- [Sync State](#sync-state)
- [React Hooks](#react-hooks)
- [Types](#types)
- [Error Handling](#error-handling)

## Configuration

### NetworkConfig

Configure network behavior when initializing SyncKit:

```typescript
const synckit = new SyncKit({
  clientId: 'user-123',
  storage: new MemoryStorage(),
  serverUrl: 'ws://localhost:8080', // Enable network sync
  network: {
    // Optional: Reconnection settings
    reconnect: {
      initialDelay: 1000,    // Initial delay before reconnection (ms)
      maxDelay: 30000,       // Maximum delay between attempts (ms)
      multiplier: 1.5,       // Backoff multiplier
    },
    // Optional: Heartbeat settings
    heartbeat: {
      interval: 30000,       // Ping interval (ms)
      timeout: 5000,         // Pong timeout (ms)
    },
    // Optional: Queue settings
    queue: {
      maxSize: 1000,         // Maximum queued operations
      maxRetries: 5,         // Retry attempts per operation
      retryDelay: 1000,      // Initial retry delay (ms)
      retryBackoff: 2.0,     // Retry delay multiplier
    },
  },
})
```

**Default Values:**
- Reconnection: enabled with 1s initial delay, 30s max, 1.5x backoff
- Heartbeat: 30s interval, 5s timeout
- Queue: 1000 max operations, 5 retries, 1s delay, 2x backoff

### Zero-Config Offline Mode

Omit `serverUrl` for offline-only mode:

```typescript
const synckit = new SyncKit({
  clientId: 'user-123',
  storage: new MemoryStorage(),
  // No serverUrl = offline-only, no network code loaded
})
```

## Network Status

### getNetworkStatus()

Get current network status:

```typescript
const status = synckit.getNetworkStatus()

if (status) {
  console.log('Network state:', status.networkState)         // 'online' | 'offline' | 'unknown'
  console.log('Connection state:', status.connectionState)   // 'connected' | 'connecting' | ...
  console.log('Queued operations:', status.queueSize)
  console.log('Failed operations:', status.failedOperations)
  console.log('Oldest operation:', status.oldestOperation)   // timestamp or null
}
```

**Returns:** `NetworkStatus | null`

Returns `null` if network layer not initialized (offline-only mode).

**NetworkStatus Type:**
```typescript
interface NetworkStatus {
  networkState: 'online' | 'offline' | 'unknown'
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
  queueSize: number
  failedOperations: number
  oldestOperation: number | null
}
```

### onNetworkStatusChange()

Subscribe to network status changes:

```typescript
const unsubscribe = synckit.onNetworkStatusChange((status) => {
  console.log('Network status changed:', status)

  if (status.connectionState === 'connected') {
    console.log('Back online!')
  }
})

// Clean up when done
unsubscribe()
```

**Parameters:**
- `callback: (status: NetworkStatus) => void` - Called on status changes

**Returns:** `Unsubscribe | null` - Function to unsubscribe, or `null` if offline-only

## Sync State

### getSyncState()

Get document-specific sync state:

```typescript
const syncState = synckit.getSyncState('my-document')

if (syncState) {
  console.log('Sync state:', syncState.state)               // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  console.log('Pending operations:', syncState.pendingOperations)
  console.log('Last synced:', syncState.lastSyncedAt)       // timestamp or null
  console.log('Error:', syncState.error)                    // string or null
}
```

**Parameters:**
- `documentId: string` - Document identifier

**Returns:** `DocumentSyncState | null`

**DocumentSyncState Type:**
```typescript
interface DocumentSyncState {
  documentId: string
  state: 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  pendingOperations: number
  lastSyncedAt: number | null
  error: string | null
}
```

### onSyncStateChange()

Subscribe to document sync state changes:

```typescript
const unsubscribe = synckit.onSyncStateChange('my-document', (state) => {
  console.log('Document sync state:', state.state)

  if (state.state === 'synced') {
    console.log('Document fully synced!')
  }

  if (state.state === 'error' && state.error) {
    console.error('Sync error:', state.error)
  }
})

// Clean up
unsubscribe()
```

**Parameters:**
- `documentId: string` - Document identifier
- `callback: (state: DocumentSyncState) => void` - Called on state changes

**Returns:** `Unsubscribe | null`

### syncDocument()

Manually trigger document synchronization:

```typescript
await synckit.syncDocument('my-document')
```

**Parameters:**
- `documentId: string` - Document to sync

**Returns:** `Promise<void>`

Useful for forcing a sync after making changes or coming back online.

## React Hooks

### useNetworkStatus()

React hook for network status:

```typescript
import { useNetworkStatus } from '@synckit-js/sdk/react'

function NetworkIndicator() {
  const status = useNetworkStatus()

  if (!status) return null // Offline-only mode

  return (
    <div>
      <span>Connection: {status.connectionState}</span>
      {status.queueSize > 0 && (
        <span>Pending: {status.queueSize} operations</span>
      )}
    </div>
  )
}
```

**Returns:** `NetworkStatus | null`

Automatically updates when network status changes.

### useSyncState()

React hook for document sync state:

```typescript
import { useSyncState } from '@synckit-js/sdk/react'

function DocumentStatus({ documentId }: { documentId: string }) {
  const syncState = useSyncState(documentId)

  if (!syncState) return null

  return (
    <div>
      <span>Status: {syncState.state}</span>
      {syncState.pendingOperations > 0 && (
        <span>Pending: {syncState.pendingOperations}</span>
      )}
      {syncState.error && (
        <span>Error: {syncState.error}</span>
      )}
    </div>
  )
}
```

**Parameters:**
- `documentId: string` - Document to monitor

**Returns:** `DocumentSyncState | null`

### useSyncDocumentWithState()

Enhanced document hook with sync state:

```typescript
import { useSyncDocumentWithState } from '@synckit-js/sdk/react'

function TodoList() {
  const { data, setters, syncState } = useSyncDocumentWithState<{
    items: string[]
    completed: boolean[]
  }>('todo-list')

  return (
    <div>
      {syncState?.state === 'syncing' && <Spinner />}

      <ul>
        {data.items?.map((item, i) => (
          <li key={i}>
            <input
              type="checkbox"
              checked={data.completed?.[i]}
              onChange={(e) => {
                const newCompleted = [...(data.completed || [])]
                newCompleted[i] = e.target.checked
                setters.completed(newCompleted)
              }}
            />
            {item}
          </li>
        ))}
      </ul>

      {syncState?.error && (
        <div>Sync error: {syncState.error}</div>
      )}
    </div>
  )
}
```

**Returns:**
```typescript
{
  data: T                           // Document data
  setters: {                        // Field setters
    set: <K extends keyof T>(field: K, value: T[K]) => Promise<void>
    update: (updates: Partial<T>) => Promise<void>
    delete: <K extends keyof T>(field: K) => Promise<void>
  }
  document: SyncDocument<T>        // Document instance
  syncState: DocumentSyncState | null  // Sync state
}
```

## Types

### NetworkError

Custom error class for network-related errors:

```typescript
class NetworkError extends SyncKitError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR')
    this.name = 'NetworkError'
  }
}
```

NetworkError always has the code `'NETWORK_ERROR'`. For more specific WebSocket-related errors, see `WebSocketErrorCode` enum which includes:
- `CONNECTION_FAILED` - Failed to connect to server
- `AUTH_FAILED` - Authentication failed
- `SEND_FAILED` - Failed to send message
- `INVALID_MESSAGE` - Received invalid message
- `QUEUE_FULL` - Offline queue exceeded max size

### VectorClock

Type for vector clocks used in conflict resolution:

```typescript
interface VectorClock {
  [clientId: string]: number
}

// Example:
const clock: VectorClock = {
  'client-1': 5,
  'client-2': 3,
  'client-3': 7,
}
```

### Operation

Type for sync operations:

```typescript
interface Operation {
  type: 'set' | 'delete'
  documentId: string
  field?: string
  value?: unknown
  clock: VectorClock
  clientId: string
  timestamp: number
}
```

## Error Handling

### Network Errors

Handle network errors gracefully:

```typescript
const unsubscribe = synckit.onNetworkStatusChange((status) => {
  if (status.connectionState === 'failed') {
    console.error('Connection failed - will retry automatically')
  }

  if (status.failedOperations > 0) {
    console.warn(`${status.failedOperations} operations failed`)
  }
})
```

### Sync Errors

Handle document sync errors:

```typescript
const unsubscribe = synckit.onSyncStateChange('doc-id', (state) => {
  if (state.state === 'error' && state.error) {
    console.error('Sync error:', state.error)
  }
})
```

### Offline Gracefully

The SDK handles offline scenarios automatically:

1. **Operations queued** - Changes queued when offline
2. **Auto-reconnect** - Automatically reconnects with exponential backoff
3. **Auto-replay** - Queued operations replayed when reconnected
4. **Conflict resolution** - Vector clocks resolve conflicts

No special error handling required for offline scenarios!

## Best Practices

### 1. Monitor Network Status

```typescript
const status = synckit.getNetworkStatus()
if (status && status.queueSize > 100) {
  // Warn user about large pending queue
  showNotification('Large number of pending changes')
}
```

### 2. Handle Long Offline Periods

```typescript
synckit.onNetworkStatusChange((status) => {
  if (status.connectionState === 'connected' && status.queueSize > 0) {
    console.log(`Syncing ${status.queueSize} pending operations...`)
    // Show progress indicator
  }
})
```

### 3. Provide Feedback

```typescript
function SyncIndicator() {
  const status = useNetworkStatus()

  if (!status) return null

  if (status.connectionState === 'connected' && status.queueSize === 0) {
    return <CheckIcon /> // All synced
  }

  if (status.queueSize > 0) {
    return <SyncIcon spinning /> // Syncing
  }

  if (status.connectionState === 'failed') {
    return <ErrorIcon /> // Failed
  }

  return null
}
```

### 4. Use Document-Level Sync State

```typescript
const syncState = useSyncState(documentId)

// Show different UI based on sync state
if (syncState?.state === 'syncing') {
  return <Spinner />
}

if (syncState?.state === 'error') {
  return <ErrorMessage error={syncState.error} />
}

// Normal UI
```

## Examples

See the [examples directory](../../examples) for complete working examples:

- `examples/project-management` - Full-featured Kanban board with offline-first sync, cross-tab communication, and real-time collaboration
- `examples/collaborative-editor` - Real-time collaborative text editing with conflict resolution
- `examples/todo-app` - Simple todo list demonstrating basic offline-first patterns

## Migration Guide

Upgrading from offline-only to network-enabled:

```diff
const synckit = new SyncKit({
  clientId: 'user-123',
  storage: new MemoryStorage(),
+ serverUrl: 'ws://localhost:8080',
+ network: {
+   reconnect: { initialDelay: 1000 },
+ },
})

+// Monitor sync status
+synckit.onNetworkStatusChange((status) => {
+  console.log('Network:', status.connectionState)
+})
```

That's it! The SDK handles everything else automatically.

## See Also

- [Getting Started Guide](../guides/getting-started.md)
- [Offline-First Guide](../guides/offline-first.md)
- [Conflict Resolution Guide](../guides/conflict-resolution.md)
- [Performance Guide](../guides/performance.md)
- [SDK API Reference](./SDK_API.md)
