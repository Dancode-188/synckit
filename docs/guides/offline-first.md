# Offline-First Patterns with SyncKit

**⚠️ IMPORTANT - v0.1.0 STATUS:**

SyncKit v0.1.0 provides **complete offline-first architecture with network sync**.

**What works now:**
- ✅ IndexedDB/Memory storage
- ✅ All CRUD operations work offline
- ✅ Data persists across restarts
- ✅ **Network sync with WebSocket**
- ✅ **Offline queue with auto-replay**
- ✅ **Network status tracking APIs**
- ✅ **Cross-tab synchronization via BroadcastChannel API**

**Not yet implemented:**
- ❌ Sync strategies (eager/lazy/manual sync modes)
- ❌ Query API for filtering documents

**Use now for:** Offline-first apps with optional real-time sync across clients.

---

Learn how to build applications that work **everywhere, every time**—whether users are on a plane, in a tunnel, or with spotty connectivity.

---

## Table of Contents

1. [What is Offline-First?](#what-is-offline-first)
2. [Why Offline-First Matters](#why-offline-first-matters)
3. [Understanding SyncKit's Offline-First Architecture](#understanding-synckits-offline-first-architecture)
4. [IndexedDB Foundations](#indexeddb-foundations)
5. [Core Offline-First Patterns](#core-offline-first-patterns)
6. [Service Workers & Background Sync](#service-workers--background-sync)
7. [Advanced Patterns](#advanced-patterns)
8. [Common Pitfalls](#common-pitfalls)
9. [Troubleshooting](#troubleshooting)

---

## What is Offline-First?

**Offline-first** is an application architecture where the **local database is your source of truth**, not the server.

### Offline-First vs Online-First

| Architecture | Source of Truth | Network Required? | User Experience |
|-------------|-----------------|-------------------|-----------------|
| **Online-First** | Server | ✅ Yes | Breaks without connection |
| **Cache-First** | Server (cached) | ⚠️ Mostly | Limited offline (40MB cache) |
| **Offline-First** | Local Database | ❌ No | Works everywhere |

**Example:**

```typescript
// ❌ Online-First (Firebase style)
await fetch('/api/todos')        // Fails without network
  .then(res => res.json())
  .then(todos => setTodos(todos))

// ✅ Offline-First (SyncKit style)
const todos = sync.document<TodoList>('my-todos')
await todos.init()
todos.subscribe(data => setTodos(data))  // Always works from local storage
```

**Key Insight:** In offline-first apps, network connectivity is an **optimization**, not a requirement.

---

## Why Offline-First Matters

### It's Not Just for Remote Locations

Offline-first benefits **everyone**, not just users in remote areas:

- **Elevators** - 30 seconds of no connectivity
- **Tunnels/Subways** - Minutes of interrupted service
- **Airplanes** - Hours offline (even with WiFi, it's slow)
- **Coffee shops** - Unreliable public WiFi
- **Mobile data** - Spotty 3G/4G in buildings
- **Conferences** - Overloaded WiFi with 1000+ attendees

**Statistics:**
- **63%** of mobile users experience connectivity issues weekly
- **Average mobile user** is offline **30-50% of the time**
- **52%** of users abandon apps that don't work offline

### Performance Benefits for ALL Users

Even with perfect connectivity, offline-first is **faster**:

```
Network Round-Trip:  50-200ms (4G) to 2000ms+ (slow 3G)
IndexedDB Read:      <5ms
Memory Read:         <1ms
```

**Your app feels instant because it IS instant.**

---

## Understanding SyncKit's Offline-First Architecture

### The Mental Model

Think of SyncKit as **Git for application data**:

1. **Local commits** - All changes go to local database first (instant)
2. **Background sync** - Changes sync to server when online (eventual)
3. **Merge** - Conflicts automatically resolved (Last-Write-Wins by default)

```
User Action → Local Write (instant) → Background Sync → Server
                    ↓
              User sees result immediately
```

### Architecture Diagram

```
┌──────────────────────────────────────┐
│         Your Application             │
└──────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────┐
│          SyncKit SDK                 │
│  ┌────────────────────────────────┐ │
│  │   Document API (Tier 1)        │ │
│  │   - document.update()           │ │
│  │   - document.subscribe()        │ │
│  └────────────────────────────────┘ │
└──────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────┐
│         WASM Core (Rust)             │
│  ┌────────────┐   ┌──────────────┐  │
│  │    LWW     │   │ Offline Queue│  │
│  │   Merge    │   │              │  │
│  └────────────┘   └──────────────┘  │
└──────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────┐
│        IndexedDB Storage             │
│   (Your Source of Truth)             │
└──────────────────────────────────────┘
```

### How SyncKit Handles Offline

**When Online:**
```typescript
await todo.update({ completed: true })
// 1. Write to IndexedDB (~2ms)
// 2. Send to server via WebSocket (~50ms) ✅ v0.1.0
// 3. Broadcast to other tabs via BroadcastChannel (~1ms) ✅ v0.1.0
```

**When Offline:**
```typescript
await todo.update({ completed: true })
// 1. Write to IndexedDB (~2ms)
// 2. Queue for sync (automatic) ✅ v0.1.0
// 3. Broadcast to other tabs via BroadcastChannel (~1ms) ✅ v0.1.0
// 4. Retry sync when connection returns (automatic) ✅ v0.1.0
```

**v0.1.0 features:**
- ✅ Local IndexedDB storage with instant writes
- ✅ Network sync with WebSocket when serverUrl configured
- ✅ Offline queue automatically replays operations when reconnected
- ✅ Network status tracking via `getNetworkStatus()` and `onNetworkStatusChange()`
- ✅ Cross-tab sync via BroadcastChannel API

---

## IndexedDB Foundations

### What is IndexedDB?

IndexedDB is a **full NoSQL database** in your browser, not just a key-value store.

**Capabilities:**
- **Storage:** Unlimited (request permission for >1GB)
- **Transactions:** ACID guarantees
- **Indexes:** Fast queries on any field
- **Binary data:** Store files, images, etc.
- **Persistence:** Survives browser restarts

**NOT localStorage:**
```typescript
// ❌ localStorage (5-10MB limit, synchronous, string-only)
localStorage.setItem('todo', JSON.stringify(todo))

// ✅ IndexedDB (unlimited, async, any type)
const doc = sync.document('todo-1')
await doc.init()
await doc.update(todo)
```

### SyncKit's IndexedDB Integration

SyncKit manages IndexedDB automatically—you don't need to use IndexedDB APIs directly:

```typescript
// SyncKit handles all IndexedDB operations
const sync = new SyncKit({
  storage: 'indexeddb'  // Default
})

// Behind the scenes:
// - Creates database: 'synckit'
// - Creates object stores: 'documents', 'metadata', 'queue'
// - Manages transactions automatically
// - Handles errors and retries
```

### Storage Limits

```typescript
// Check available storage
if (navigator.storage && navigator.storage.estimate) {
  const estimate = await navigator.storage.estimate()
  console.log('Usage:', estimate.usage / 1024 / 1024, 'MB')
  console.log('Quota:', estimate.quota / 1024 / 1024, 'MB')
}

// Request persistent storage (prevents eviction)
if (navigator.storage && navigator.storage.persist) {
  const persistent = await navigator.storage.persist()
  console.log('Persistent:', persistent)
}
```

**Typical Quotas:**
- **Desktop Chrome:** 60% of available disk (~100GB+ on most systems)
- **Mobile Chrome:** 50% of available storage
- **Firefox:** 50% of available storage
- **Safari:** ~1GB (can request more)

---

## Core Offline-First Patterns

### Pattern 1: Optimistic Updates

**Principle:** Update UI immediately, sync in background.

```typescript
async function toggleTodo(id: string) {
  const todo = sync.document<Todo>(id)
  await todo.init()
  const current = todo.get()

  // ✅ Three-step optimistic update pattern

  // Step 1: Update UI immediately (optimistic)
  setTodos(prev => prev.map(t =>
    t.id === id ? { ...t, completed: !t.completed } : t
  ))

  try {
    // Step 2: Persist to local database
    await todo.update({ completed: !current.completed })

    // Step 3: Sync to server (automatic, happens in background)
    // SyncKit handles this automatically

  } catch (error) {
    // Step 4: Rollback UI on error
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, completed: current.completed } : t
    ))

    console.error('Failed to update todo:', error)
    showErrorToast('Failed to update todo')
  }
}
```

**When to use:**
- User-initiated actions (clicks, form submissions)
- Actions that rarely fail (CRUD operations)
- When instant feedback is critical for UX

**When NOT to use:**
- Operations with complex validation
- Financial transactions
- Operations that can't be rolled back

### Pattern 2: Offline Queue

**✅ FULLY IMPLEMENTED IN v0.1.0**

SyncKit automatically queues operations when offline and replays them when connection returns.

**How it works:**
```typescript
// Configure with serverUrl to enable network sync + offline queue
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  storage: 'indexeddb',
  name: 'my-app'
})
await sync.init()

// Make changes while offline
await todo.update({ completed: true })
// 1. Writes to IndexedDB immediately
// 2. Queues for sync automatically
// 3. When connection returns, syncs automatically

// Monitor sync state per document
const syncState = sync.getSyncState('todo-1')
console.log('Pending operations:', syncState?.pendingOperations)
```

**Available in v0.1.0:**
- ✅ Automatic offline queue with persistent storage
- ✅ Auto-replay when connection restored
- ✅ Per-document sync state tracking
- ✅ Network status monitoring APIs

### Pattern 3: Sync Strategies *(Coming in Future Version)*

**⚠️ NOT YET IMPLEMENTED IN v0.1.0**

Sync strategies and network features are planned for future release.

**Sync strategies** determine **when** to sync data with the server.

#### Strategy A: Eager Sync (Default) - Planned Feature

**⚠️ NOT YET IMPLEMENTED IN v0.1.0**

Sync immediately when online:

```typescript
// ⚠️ NOT FUNCTIONAL in v0.1.0
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  syncStrategy: 'eager'  // Default
})

// Every change syncs immediately when online
await todo.update({ completed: true })  // Syncs immediately
```

**Use when:**
- Real-time collaboration required
- Multiple users editing same data
- Changes must propagate quickly

#### Strategy B: Lazy Sync - Planned Feature

**⚠️ NOT YET IMPLEMENTED IN v0.1.0**

Sync periodically or on-demand:

```typescript
// ⚠️ NOT FUNCTIONAL in v0.1.0
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  syncStrategy: 'lazy',
  syncInterval: 30000  // Sync every 30 seconds
})

// Changes batch for 30 seconds before syncing
await todo1.update({ completed: true })   // Batched
await todo2.update({ text: 'New text' })  // Batched
// ... 30 seconds later: all changes sync together

// Or trigger sync manually
await sync.syncNow()  // Method doesn't exist in v0.1.0
```

**Use when:**
- Reducing server load
- Batch operations
- Single-user apps

#### Strategy C: Manual Sync - Planned Feature

**⚠️ NOT YET IMPLEMENTED IN v0.1.0**

Full control over when to sync:

```typescript
// ⚠️ NOT FUNCTIONAL in v0.1.0
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  syncStrategy: 'manual'
})

// Make changes (no automatic sync)
await todo1.update({ completed: true })
await todo2.update({ completed: true })

// Sync when ready
await sync.syncNow()  // Method doesn't exist in v0.1.0
```

**Use when:**
- User-triggered sync (pull-to-refresh)
- Precise control needed
- Testing/debugging

### Pattern 4: Connection Status Handling

**✅ FULLY IMPLEMENTED IN v0.1.0**

Show users the network connection state:

```typescript
// ✅ WORKS IN v0.1.0 - Network status APIs available
function ConnectionStatus() {
  const [status, setStatus] = useState<NetworkStatus | null>(null)

  useEffect(() => {
    // Get current network status
    const currentStatus = sync.getNetworkStatus()
    setStatus(currentStatus)

    // Subscribe to status changes
    const unsubscribe = sync.onNetworkStatusChange?.((newStatus) => {
      setStatus(newStatus)
    })

    return () => unsubscribe?.()
  }, [])

  if (!status) return null

  return (
    <div className={`status status-${status.connectionState}`}>
      {status.connectionState === 'connected' && '🟢 Online'}
      {status.connectionState === 'connecting' && '🟡 Connecting...'}
      {status.connectionState === 'disconnected' && '🔴 Offline'}
      {status.pendingOperations > 0 && ` (${status.pendingOperations} pending)`}
    </div>
  )
}
```

**Alternative:** Use browser's online/offline events for basic detection:
```typescript
function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className={`status ${isOnline ? 'online' : 'offline'}`}>
      {isOnline ? '🟢 Online' : '🔴 Offline'}
    </div>
  )
}
```

---

## Service Workers & Background Sync

### Background Sync API

Use **Background Sync API** to retry failed syncs even after the user closes the tab:

```typescript
// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}

// In your service worker (sw.js)
self.addEventListener('sync', (event) => {
  if (event.tag === 'synckit-sync') {
    event.waitUntil(
      // SyncKit will provide a sync method
      syncPendingChanges()
    )
  }
})
```

**SyncKit integration (coming in v0.2.0):**

```typescript
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  backgroundSync: true  // Enables Background Sync API
})
```

### Periodic Background Sync

Sync data periodically, even when app is closed:

```typescript
// Request periodic sync permission
const status = await navigator.permissions.query({
  name: 'periodic-background-sync'
})

if (status.state === 'granted') {
  // Register periodic sync (every 12 hours)
  const registration = await navigator.serviceWorker.ready
  await registration.periodicSync.register('synckit-periodic', {
    minInterval: 12 * 60 * 60 * 1000  // 12 hours
  })
}
```

---

## Advanced Patterns

### Pattern 5: Multi-User Collaboration

Handle multiple users editing the same document:

```typescript
interface Task {
  id: string
  title: string
  assignee: string
  lastEditedBy: string
  lastEditedAt: number
}

const task = sync.document<Task>('task-123')
await task.init()

// Track who edited last
await task.update({
  title: 'New title',
  lastEditedBy: currentUser.id,
  lastEditedAt: Date.now()
})

// Show who's editing in real-time
task.subscribe((data) => {
  if (data.lastEditedBy !== currentUser.id) {
    showToast(`${data.lastEditedBy} just edited this task`)
  }
})
```

### Pattern 6: Schema Migrations

Evolve your data structure over time:

```typescript
interface TodoV1 {
  id: string
  text: string
  done: boolean  // Old field name
}

interface TodoV2 {
  id: string
  text: string
  completed: boolean  // New field name
  version: 2
}

// Migration helper
async function migrateTodo(id: string) {
  const todo = sync.document<TodoV1>(id)
  await todo.init()
  const data = todo.get()

  // Check if migration needed
  if (!('version' in data) || data.version < 2) {
    await todo.update({
      completed: (data as any).done,  // Rename field
      version: 2
    })
  }
}
```

### Pattern 7: Storage Management

**⚠️ Query API NOT YET IMPLEMENTED IN v0.1.0**

Manage storage proactively (planned for future version):

```typescript
// ⚠️ NOT FUNCTIONAL in v0.1.0 - Query API doesn't exist
async function cleanupOldDocs() {
  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000)  // 30 days

  // Query old todos (using future query API - NOT IN v0.1.0)
  const oldTodos = await sync.query<Todo>()
    .where('createdAt', '<', cutoff)
    .where('completed', '==', true)
    .get()

  // Delete in batch
  await Promise.all(
    oldTodos.map(todo => sync.deleteDocument(todo.id))  // Correct delete API
  )

  console.log(`Deleted ${oldTodos.length} old todos`)
}
```

**Current v0.1.0 workaround:** Track document IDs manually and delete by ID:
```typescript
async function cleanupOldDocs(todoIds: string[]) {
  // Delete documents by ID
  await Promise.all(
    todoIds.map(id => sync.deleteDocument(id))
  )

  console.log(`Deleted ${todoIds.length} todos`)
}

// Or clear all documents
await sync.clearAll()
```

---

## Common Pitfalls

### Pitfall 1: Caching ≠ Offline-First

```typescript
// ❌ This is NOT offline-first
fetch('/api/todos', { cache: 'force-cache' })

// The cache:
// - Has size limits (40-50MB in most browsers)
// - Evicted unpredictably
// - Doesn't support writes offline
// - No conflict resolution
```

**Solution:** Use true offline-first storage (IndexedDB via SyncKit).

### Pitfall 2: Assuming Network = Fast

```typescript
// ❌ Showing loader until network responds
setLoading(true)
const data = await fetch('/api/todos')
setLoading(false)

// ✅ Show data immediately from local database
const todos = sync.document<TodoList>('my-todos')
await todos.init()
todos.subscribe(data => {
  setTodos(data)
  setLoading(false)
})
```

### Pitfall 3: Not Handling Quota Exceeded

```typescript
try {
  await todo.init()
  await todo.update(largeDocument)
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    // Handle gracefully
    await cleanupOldData()
    await todo.update(largeDocument)  // Retry
  }
}
```

### Pitfall 4: Forgetting Unsubscribe

```typescript
// ❌ Memory leak
useEffect(() => {
  todo.subscribe(data => setTodoData(data))
}, [])

// ✅ Proper cleanup
useEffect(() => {
  const unsubscribe = todo.subscribe(data => setTodoData(data))
  return unsubscribe  // Cleanup on unmount
}, [])
```

---

## Troubleshooting

### Issue: "Data not persisting after refresh"

**Cause:** Browser in private/incognito mode, or IndexedDB disabled

**Solution:**
```typescript
// Check if IndexedDB is available
if (!window.indexedDB) {
  console.error('IndexedDB not supported')
  // Fall back to memory storage
  const sync = new SyncKit({ storage: 'memory' })
}
```

### Issue: "Changes not syncing to server"

**Cause:** Network blocked, wrong serverUrl, or authentication failed

**Debug:**
```typescript
// ✅ WORKS IN v0.1.0 - Network status APIs available
// Check connection status
const networkStatus = sync.getNetworkStatus()
console.log('Connection state:', networkStatus?.connectionState)
console.log('Pending operations:', networkStatus?.pendingOperations)

// Check per-document sync state
const syncState = sync.getSyncState('doc-id')
console.log('Document sync state:', syncState?.state)
console.log('Document pending ops:', syncState?.pendingOperations)
console.log('Last error:', syncState?.error)

// Monitor network status changes
const unsubscribe = sync.onNetworkStatusChange?.((status) => {
  console.log('Network status changed:', status)
})
```

**Solutions:**
- Verify serverUrl is correct and server is running
- Check browser console for WebSocket errors
- Verify network connectivity
- Check that offline queue has capacity (default: 1000 operations)

### Issue: "App feels slow offline"

**Cause:** Waiting for network timeouts

**Solution (v0.1.0):** Use offline-first operations (always instant):
```typescript
// ✅ v0.1.0: All operations are local and instant
await todo.update({ completed: true })  // Instant IndexedDB write
```

**Future version solution:** Check connection status before operations:
```typescript
// ⚠️ NOT FUNCTIONAL in v0.1.0
if (sync.status === 'connected') {  // Property doesn't exist
  // Only do network operations when connected
}

// Or use offline-first operations (always instant)
await todo.update({ completed: true })  // Instant, syncs in background
```

---

## Summary

**Key Takeaways:**

1. **Offline-first is about speed and reliability** - Benefits ALL users, not just remote users
2. **Local database is your source of truth** - Server is for sync, not primary storage
3. **SyncKit provides true offline-first** - Not cache-based, unlimited storage
4. **IndexedDB is powerful** - Full NoSQL database, not just key-value store
5. **Optimistic updates require care** - Three-step pattern: UI → local → sync
6. **Connection status matters** - Show users when offline
7. **Background sync is powerful** - Service Workers enable sync even when app is closed

**Next Steps:**

- Learn how [Conflict Resolution](./conflict-resolution.md) works
- Optimize [Performance](./performance.md) for production
- Explore [Testing](./testing.md) offline scenarios

---

**Welcome to the offline-first revolution!** 🚀
