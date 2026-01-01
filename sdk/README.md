# @synckit-js/sdk

TypeScript SDK for SyncKit - Production-grade local-first sync with real-time collaboration.

**Bundle Size:** 154KB gzipped (full) or 46KB gzipped (lite) - Includes text CRDTs, rich text, undo/redo, cursors, and framework adapters out of the box.

## 🚀 Quick Start

### Offline-Only Mode

```typescript
import { SyncKit } from '@synckit-js/sdk'

// Initialize (offline-only)
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app'
})

await sync.init()

// Create a typed document
interface Todo {
  title: string
  completed: boolean
}

const doc = sync.document<Todo>('todo-1')

// Initialize document
await doc.init()

// Update document
await doc.update({ title: 'Buy milk', completed: false })

// Or set individual fields
// await doc.set('title', 'Buy milk')
// await doc.set('completed', false)

// Subscribe to changes
doc.subscribe((todo) => {
  console.log('Updated:', todo)
})

// Get current state
const todo = doc.get()
```

### With Network Sync

```typescript
import { SyncKit } from '@synckit-js/sdk'

// Initialize with server sync
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app',
  serverUrl: 'ws://localhost:8080',  // Enable network sync
  clientId: 'user-123',
  network: {
    reconnect: {
      enabled: true,
      initialDelay: 1000,
      maxDelay: 30000
    }
  }
})

await sync.init()

// Monitor network status
sync.onNetworkStatusChange((status) => {
  console.log('Connection:', status.connectionState)
  console.log('Queue size:', status.queueSize)
})

// Create and sync document
const doc = sync.document<Todo>('todo-1')
await doc.init()  // Automatically subscribes to real-time server updates!
await doc.update({ title: 'Buy milk', completed: false })

// Changes sync instantly to server and other clients
```

## 📦 Installation

```bash
npm install @synckit-js/sdk
# or
yarn add @synckit-js/sdk
# or
pnpm add @synckit-js/sdk
```

## 🎯 Features

### Core Features
- ✅ **Type-safe**: Full TypeScript support with generics
- ✅ **Reactive**: Observable pattern for real-time updates
- ✅ **Persistent**: IndexedDB storage with unlimited capacity
- ✅ **Offline-first**: Works completely without network
- ✅ **Zero-config**: Sensible defaults, no setup required

### Network Features
- ✅ **Real-time sync**: WebSocket-based server synchronization
- ✅ **Conflict resolution**: Automatic LWW with vector clocks
- ✅ **Offline queue**: Persistent operation queue with retry logic
- ✅ **Auto-reconnection**: Exponential backoff with jitter
- ✅ **Network monitoring**: Connection state tracking
- ✅ **Sync state tracking**: Per-document sync status

### Collaborative Text Editing (v0.2.0)
- ✅ **Text CRDT (Fugue)**: Collaborative editing with conflict-free convergence
- ✅ **Rich Text (Peritext)**: Bold, italic, links, colors with formatting conflict resolution
- ✅ **Quill Integration**: QuillBinding for Quill editor
- ✅ **Delta Utilities**: Interoperability with Quill's delta format

### Additional CRDTs (v0.2.0)
- ✅ **Counters (PN-Counter)**: Distributed increment/decrement operations
- ✅ **Sets (OR-Set)**: Conflict-free add/remove operations
- ✅ **Framework hooks**: useCounter, useSet for React/Vue/Svelte

### Undo/Redo (v0.2.0)
- ✅ **Intelligent merging**: Automatically merges consecutive operations
- ✅ **Cross-tab sync**: Undo/redo state syncs across browser tabs
- ✅ **Persistent history**: Survives page refreshes via IndexedDB
- ✅ **Framework adapters**: useUndo hook for React/Vue/Svelte
- ✅ **Customizable**: Configure merge strategies and stack size

### Presence & Awareness (v0.2.0)
- ✅ **Real-time presence**: Track who's online and active
- ✅ **Cursor sharing**: Live cursor positions with XPath serialization
- ✅ **Selection tracking**: Share text selections across clients
- ✅ **Framework hooks**: usePresence, useOthers for React/Vue/Svelte

### Framework Integration
- ✅ **React hooks**: useSyncDocument, useSyncText, useRichText, useUndo, usePresence, useCounter, useSet
- ✅ **Vue composables**: Full Vue 3 Composition API support for all features
- ✅ **Svelte stores**: Svelte 5 stores with runes support for all features
- ✅ **Network-aware hooks**: Monitor connection and sync state
- ✅ **TypeScript support**: Full type inference throughout

## 🔌 React Integration

### Basic Usage

```tsx
import { SyncProvider, useSyncDocument } from '@synckit-js/sdk/react'

// 1. Wrap your app
function App() {
  return (
    <SyncProvider synckit={sync}>
      <TodoList />
    </SyncProvider>
  )
}

// 2. Use in components
function TodoItem({ id }: { id: string }) {
  const [todo, { set, update, delete: deleteFn }, doc] = useSyncDocument<Todo>(id)

  return (
    <div>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={(e) => set('completed', e.target.checked)}
      />
      <span>{todo.title}</span>
      <button onClick={() => update({ completed: !todo.completed })}>
        Toggle
      </button>
    </div>
  )
}
```

### Network-Aware Components (v0.1.0)

```tsx
import { useNetworkStatus, useSyncState } from '@synckit-js/sdk/react'

function NetworkIndicator() {
  const status = useNetworkStatus()

  if (!status) return null // Offline-only mode

  return (
    <div>
      <span>Status: {status.connectionState}</span>
      <span>Queue: {status.queueSize} operations</span>
      <span>{status.isOnline ? '🟢 Online' : '🔴 Offline'}</span>
    </div>
  )
}

function DocumentSyncStatus({ docId }: { docId: string }) {
  const syncState = useSyncState(docId)

  if (!syncState) return null

  return (
    <div>
      {syncState.isSynced ? '✅ Synced' : '⏳ Syncing...'}
      <span>Last sync: {new Date(syncState.lastSyncedAt).toLocaleString()}</span>
    </div>
  )
}
```

## ↩️ Undo/Redo

SyncKit includes a powerful undo/redo system with cross-tab synchronization and intelligent operation merging.

### React

```tsx
import { useUndo } from '@synckit-js/sdk/react'

function TextEditor() {
  const [text, setText] = useState('')
  const { canUndo, canRedo, undo, redo, add } = useUndo('doc-123')

  const handleChange = (newText: string) => {
    const oldText = text
    setText(newText)

    add({
      type: 'text-change',
      data: { from: oldText, to: newText }
    })
  }

  const handleUndo = () => {
    const op = undo()
    if (op?.data) setText(op.data.from)
  }

  const handleRedo = () => {
    const op = redo()
    if (op?.data) setText(op.data.to)
  }

  return (
    <div>
      <button onClick={handleUndo} disabled={!canUndo}>Undo</button>
      <button onClick={handleRedo} disabled={!canRedo}>Redo</button>
      <textarea value={text} onChange={e => handleChange(e.target.value)} />
    </div>
  )
}
```

### Vue

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useUndo } from '@synckit-js/sdk/vue'

const text = ref('')
const { canUndo, canRedo, undo, redo, add } = useUndo('doc-123')

const handleChange = (newText: string) => {
  const oldText = text.value
  text.value = newText

  add({
    type: 'text-change',
    data: { from: oldText, to: newText }
  })
}

const handleUndo = () => {
  const op = undo()
  if (op?.data) text.value = op.data.from
}

const handleRedo = () => {
  const op = redo()
  if (op?.data) text.value = op.data.to
}
</script>

<template>
  <div>
    <button @click="handleUndo" :disabled="!canUndo">Undo</button>
    <button @click="handleRedo" :disabled="!canRedo">Redo</button>
    <textarea :value="text" @input="handleChange($event.target.value)" />
  </div>
</template>
```

### Svelte

```svelte
<script>
  import { undo } from '@synckit-js/sdk/svelte'

  let text = ''
  const undoStore = undo('doc-123')

  function handleChange(event) {
    const newText = event.target.value
    const oldText = text
    text = newText

    undoStore.add({
      type: 'text-change',
      data: { from: oldText, to: newText }
    })
  }

  function handleUndo() {
    const op = undoStore.undo()
    if (op?.data) text = op.data.from
  }

  function handleRedo() {
    const op = undoStore.redo()
    if (op?.data) text = op.data.to
  }
</script>

<button on:click={handleUndo} disabled={!$undoStore.canUndo}>Undo</button>
<button on:click={handleRedo} disabled={!$undoStore.canRedo}>Redo</button>
<textarea value={text} on:input={handleChange} />
```

### Key Features

- **Intelligent Merging**: Consecutive operations automatically merge (e.g., typing becomes one undo unit)
- **Cross-Tab Sync**: Undo/redo state syncs across browser tabs in real-time
- **Persistent**: History survives page refreshes via IndexedDB
- **Customizable**: Configure merge windows, stack size, and custom merge strategies
- **Keyboard Shortcuts**: Built-in support for Ctrl+Z and Ctrl+Y

See [UNDO_REDO.md](./docs/UNDO_REDO.md) for complete API documentation.

## 📚 API Reference

### SyncKit

**Constructor:**
```typescript
new SyncKit(config?: SyncKitConfig)

interface SyncKitConfig {
  storage?: 'indexeddb' | 'memory' | StorageAdapter
  name?: string
  serverUrl?: string        // Enable network sync
  clientId?: string         // Client identifier
  network?: NetworkConfig   // Network options
}
```

**Core Methods:**
- `init()` - Initialize the SDK
- `document<T>(id)` - Get or create a document (LWW-CRDT)
- `listDocuments()` - List all document IDs
- `deleteDocument(id)` - Delete a document
- `clearAll()` - Clear all documents
- `getClientId()` - Get client identifier
- `isInitialized()` - Check initialization status

**Collaborative Text Methods (v0.2.0):**
- `text(id)` - Get or create a text document (Fugue CRDT)
- `richText(id)` - Get or create a rich text document (Peritext)

**Additional CRDT Methods (v0.2.0):**
- `counter(id)` - Get or create a counter (PN-Counter)
- `set<T>(id)` - Get or create a set (OR-Set)

**Presence Methods (v0.2.0):**
- `awareness()` - Get awareness instance for presence tracking

**Network Methods:**
- `getNetworkStatus()` - Get current network status
- `getSyncState(documentId)` - Get document sync state
- `onNetworkStatusChange(callback)` - Subscribe to network changes
- `onSyncStateChange(documentId, callback)` - Subscribe to sync state
- `syncDocument(documentId)` - Manually trigger sync

### SyncDocument

**Methods:**
- `init()` - Initialize document (required before use)
- `get()` - Get current state (synchronous)
- `getField(field)` - Get a single field
- `set(field, value)` - Set a field (async)
- `update(updates)` - Update multiple fields (async)
- `delete(field)` - Delete a field (async)
- `subscribe(callback)` - Subscribe to changes
- `unsubscribe(callback)` - Unsubscribe from changes
- `toJSON()` - Export as JSON
- `merge(other)` - Merge with another document

**Important:** Always call `await doc.init()` before using a document. When a `serverUrl` is configured, `init()` automatically subscribes the document to real-time server updates, enabling instant synchronization with other clients.

### SyncText (v0.2.0)

Plain text collaboration using Fugue CRDT.

**Methods:**
- `insert(index, text)` - Insert text at position
- `delete(index, length)` - Delete text at position
- `toString()` - Get full text content
- `length()` - Get text length
- `subscribe(callback)` - Subscribe to changes

**Example:**
```typescript
const text = sync.text('doc-1')
await text.insert(0, 'Hello ')
await text.insert(6, 'world')
console.log(text.toString()) // "Hello world"
```

### RichText (v0.2.0)

Rich text with formatting using Peritext CRDT.

**Methods:**
- `insert(index, text, formats?)` - Insert formatted text
- `delete(index, length)` - Delete text at position
- `format(index, length, formats)` - Apply formatting to range
- `toDelta()` - Export as Quill Delta
- `toString()` - Get plain text
- `subscribe(callback)` - Subscribe to changes

**Supported formats:**
- `bold`, `italic`, `underline`, `strike`
- `link: { href: string }`
- `color: string`, `background: string`

**Example:**
```typescript
const richText = sync.richText('doc-1')
await richText.insert(0, 'Hello ', { bold: true })
await richText.insert(6, 'world', { italic: true, color: '#ff0000' })
await richText.format(0, 5, { underline: true })
```

### SyncCounter (v0.2.0)

Distributed counter using PN-Counter CRDT.

**Methods:**
- `increment(amount?)` - Increment counter (default: 1)
- `decrement(amount?)` - Decrement counter (default: 1)
- `value()` - Get current value
- `subscribe(callback)` - Subscribe to changes

**Example:**
```typescript
const counter = sync.counter('likes')
await counter.increment()     // +1
await counter.increment(5)    // +5
await counter.decrement(2)    // -2
console.log(counter.value())  // 4
```

### SyncSet (v0.2.0)

Conflict-free set using OR-Set CRDT.

**Methods:**
- `add(value)` - Add value to set
- `remove(value)` - Remove value from set
- `has(value)` - Check if value exists
- `values()` - Get all values as array
- `size()` - Get set size
- `subscribe(callback)` - Subscribe to changes

**Example:**
```typescript
const tags = sync.set<string>('post-tags')
await tags.add('typescript')
await tags.add('react')
await tags.remove('typescript')
console.log(tags.values())  // ['react']
```

### Awareness (v0.2.0)

Real-time presence and cursor tracking.

**Methods:**
- `setLocalState(state)` - Set current user's presence
- `getLocalState()` - Get current user's presence
- `getStates()` - Get all users' presence
- `subscribe(callback)` - Subscribe to presence changes

**Example:**
```typescript
const awareness = sync.awareness()

// Set your presence
awareness.setLocalState({
  user: { name: 'Alice', color: '#ff0000' },
  cursor: { position: 42, selection: [42, 50] }
})

// Get others' presence
awareness.subscribe((states) => {
  states.forEach((state, clientId) => {
    console.log(`${state.user.name} cursor at ${state.cursor.position}`)
  })
})
```

### React Hooks

**Core Hooks:**
- `useSyncKit()` - Get SyncKit instance from context
- `useSyncDocument<T>(id)` - Sync a document (returns `[data, actions, document]`)
- `useSyncField<T, K>(id, field)` - Sync a single field
- `useSyncDocumentList()` - List all document IDs

**Network Hooks:**
- `useNetworkStatus()` - Monitor connection status
- `useSyncState(documentId)` - Monitor document sync state
- `useSyncDocumentWithState<T>(id)` - Document + sync state combined

**Collaborative Text Hooks (v0.2.0):**
- `useSyncText(id)` - Plain text collaboration with Fugue CRDT
- `useRichText(id)` - Rich text with Peritext formatting

**Additional CRDT Hooks (v0.2.0):**
- `useCounter(id)` - Distributed counter (PN-Counter)
- `useSet<T>(id)` - Conflict-free set (OR-Set)

**Presence Hooks (v0.2.0):**
- `usePresence()` - Get/set current user's presence
- `useOthers()` - Get other users' presence
- `useCursors()` - Track cursor positions

**Undo/Redo Hooks (v0.2.0):**
- `useUndo(id)` - Undo/redo with cross-tab sync

## 📊 Bundle Size

### Production Bundles (gzipped)

| Build | Total Size | What's Included | Use Case |
|-------|------------|-----------------|----------|
| **Full SDK** | **154KB** | Text CRDTs, rich text, undo/redo, cursors, framework adapters, network sync | Complete collaboration platform |
| **Lite SDK** | **46KB** | Document sync only, no CRDTs or network | Size-critical apps, local-only |

**Size justification:** Every byte is intentional. We chose completeness over minimal size—rich text, undo/redo, cursors, and framework adapters all work together out of the box.

### Comparison

| Library | Size (gzipped) | Text CRDT | Rich Text | Undo/Redo | Cursors | Framework Adapters |
|---------|----------------|-----------|-----------|-----------|---------|-------------------|
| **SyncKit Full** | 154KB | ✅ Fugue | ✅ Peritext | ✅ Cross-tab | ✅ Built-in | ✅ React/Vue/Svelte |
| **SyncKit Lite** | 46KB | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| Yjs | ~65KB | ✅ Y.Text | ⚠️ Limited | ⚠️ Basic | ⚠️ Extension | ⚠️ Community |
| Automerge | ~300KB+ | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| Supabase | ~45KB | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| Firebase | ~150KB | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

**Why SyncKit Full?** You get rich text, undo/redo, cursors, and framework adapters included—no need to piece together separate libraries.

**Why SyncKit Lite?** For size-critical apps that only need basic document sync without collaboration features.

## 🔧 Storage Adapters

### IndexedDB (Browser - Recommended)
```typescript
const sync = new SyncKit({ storage: 'indexeddb' })
```

**Features:**
- Unlimited storage capacity
- Persistent across sessions
- Async operations
- Works in all modern browsers

### Memory (Testing/Development)
```typescript
const sync = new SyncKit({ storage: 'memory' })
```

**Features:**
- Fast in-memory storage
- No persistence
- Great for testing
- No browser APIs needed

### Custom Adapter
```typescript
import type { StorageAdapter } from '@synckit-js/sdk'

class MyStorage implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    // Your implementation
  }

  async set(key: string, value: string): Promise<void> {
    // Your implementation
  }

  async delete(key: string): Promise<void> {
    // Your implementation
  }

  async clear(): Promise<void> {
    // Your implementation
  }

  async keys(): Promise<string[]> {
    // Your implementation
  }
}

const sync = new SyncKit({ storage: new MyStorage() })
```

## 🌐 Network Configuration

### Basic Configuration

```typescript
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  clientId: 'user-123',
  network: {
    reconnect: {
      enabled: true,
      initialDelay: 1000,      // 1 second
      maxDelay: 30000,          // 30 seconds
      backoffMultiplier: 1.5,
      maxAttempts: Infinity
    },
    heartbeat: {
      interval: 30000,          // 30 seconds
      timeout: 5000             // 5 seconds
    },
    queue: {
      maxSize: 1000,            // Max queued operations
      persistentStorage: true   // Survive restarts
    }
  }
})
```

### Network Status

```typescript
const status = sync.getNetworkStatus()

console.log(status.connectionState) // 'connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'failed'
console.log(status.isOnline)        // Network connectivity
console.log(status.queueSize)       // Pending operations
console.log(status.lastConnectedAt) // Last successful connection
console.log(status.reconnectAttempts) // Failed connection attempts
```

### Sync State

```typescript
const state = sync.getSyncState('doc-1')

console.log(state.isSynced)      // All changes synced?
console.log(state.isSyncing)     // Currently syncing?
console.log(state.hasError)      // Sync error occurred?
console.log(state.lastSyncedAt)  // Last successful sync
console.log(state.pendingOps)    // Operations waiting to sync
```

## 🧪 Development Status

### v0.2.3 - Current Release ✅

**Core Infrastructure:**
- ✅ Document API with TypeScript generics
- ✅ Storage adapters (IndexedDB, Memory)
- ✅ LWW conflict resolution with vector clocks
- ✅ WebSocket client with auto-reconnection
- ✅ Binary message protocol
- ✅ Offline queue with persistent storage

**Collaborative Text Editing (v0.2.0):**
- ✅ Text CRDTs (Fugue) - Collaborative text editing
- ✅ Rich Text (Peritext) - Bold, italic, links with conflict resolution
- ✅ Quill editor integration (QuillBinding)
- ✅ Delta utilities for Quill interoperability

**Additional CRDTs (v0.2.0):**
- ✅ Counters (PN-Counter) - Distributed counting
- ✅ Sets (OR-Set) - Conflict-free unique collections

**Undo/Redo (v0.2.0):**
- ✅ Cross-tab undo/redo with BroadcastChannel
- ✅ Persistent history via IndexedDB
- ✅ Intelligent operation merging
- ✅ Works with all CRDT types

**Presence & Awareness (v0.2.0):**
- ✅ Real-time user presence tracking
- ✅ Cursor and selection sharing
- ✅ XPath-based cursor serialization

**Framework Adapters (v0.2.0):**
- ✅ React hooks (useSyncDocument, useSyncText, useRichText, useUndo, usePresence, etc.)
- ✅ Vue 3 composables (Composition API)
- ✅ Svelte 5 stores with runes support

**Test Coverage:**
- ✅ 1,081+ comprehensive tests
- ✅ 87% code coverage
- ✅ Unit, integration, chaos, and load tests

### v0.3.0 - Planned

**Enhanced Features:**
- 🚧 Multi-language server implementations (Python, Go, Rust)
- 🚧 Advanced storage adapters (OPFS, SQLite)
- 🚧 End-to-end encryption
- 🚧 Compression for large payloads
- 🚧 Conflict UI for visual conflict resolution

## 📝 Examples

Complete working examples available:

- **[Collaborative Editor](../examples/collaborative-editor)** - Markdown/code editor with real-time collaboration
- **[Project Management](../examples/project-management)** - Kanban board with drag-and-drop
- **[Todo App](../examples/todo-app)** - Simple todo list with sync

## 🚀 Performance

### Benchmarks (v0.1.0)

| Operation | Performance | Notes |
|-----------|-------------|-------|
| Single field update | ~371ns | <1ms consistently |
| Document merge | ~74µs | Extremely fast |
| Message encoding | 5.05ms/1000 | 0.005ms per message |
| Message decoding | 19.62ms/1000 | 0.020ms per message |
| Queue operations | 21.21ms/1000 | 47K ops/sec |
| Vector clock merge | 0.30ms/100 | Conflict resolution |

See [PERFORMANCE.md](./PERFORMANCE.md) for detailed benchmarks.

## 🔒 Type Safety

Full TypeScript support with strict type inference:

```typescript
interface User {
  name: string
  email: string
  age: number
}

const doc = sync.document<User>('user-1')
await doc.init()

// ✅ Type-safe field access
await doc.set('name', 'Alice')      // Valid
await doc.set('age', 25)            // Valid

// ❌ TypeScript errors
await doc.set('name', 123)          // Error: Type 'number' not assignable to 'string'
await doc.set('invalid', 'value')   // Error: 'invalid' not in type 'User'

// ✅ Type-safe updates
await doc.update({
  name: 'Bob',
  age: 30
})

// ❌ TypeScript error
await doc.update({
  invalid: 'field'                  // Error: Object literal may only specify known properties
})
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT - see [LICENSE](../../LICENSE) for details.

## 🔗 Links

- [Documentation](../../docs)
- [API Reference](../../docs/api)
- [Examples](../../examples)
- [GitHub Issues](https://github.com/Dancode-188/synckit/issues)
- [Changelog](../../CHANGELOG.md)
