# Getting Started with SyncKit

**Build offline-first apps in 5 minutes.**

SyncKit is a production-ready sync engine that makes building local-first applications trivial. No vendor lock-in, true offline support, and automatic conflict resolution.

> **What you'll build:** A todo app that works offline, persists data locally, and syncs in real-time with a server—in just 5 minutes.
>
> **v0.2.0 includes:** Text editing (Fugue), rich text (Peritext), undo/redo, presence tracking, cursor sharing, counters, sets, and framework adapters for React, Vue 3, and Svelte 5.

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 16+** or **Bun** installed
- Basic knowledge of JavaScript/TypeScript
- **5 minutes** of your time

That's it! No backend setup, no database configuration, no complicated tooling.

---

## Installation

Install SyncKit with your favorite package manager:

```bash
# npm
npm install @synckit-js/sdk

# yarn
yarn add @synckit-js/sdk

# pnpm
pnpm add @synckit-js/sdk

# bun
bun add @synckit-js/sdk
```

**For React projects**, the React hooks are included in the SDK package (no separate install needed).

**For Vue 3 or Svelte 5**, the composables and stores are also included in the SDK:
```typescript
import { useText, useCounter } from '@synckit-js/sdk/vue'       // Vue 3
import { textStore, counterStore } from '@synckit-js/sdk/svelte' // Svelte 5
```

---

## Quick Start: Your First Synced Document

### Step 1: Initialize SyncKit (30 seconds)

Create a SyncKit instance. It works offline-only by default—no server required!

```typescript
import { SyncKit } from '@synckit-js/sdk'

// Initialize SyncKit (works offline-only)
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app'
})

// Must call init() before using
await sync.init()

console.log('SyncKit initialized!')
```

**What just happened?**
- SyncKit initialized with IndexedDB storage
- No server connection needed—it works 100% offline
- Data persists across browser sessions

---

### Step 2: Create Your First Document (1 minute)

Let's create a todo item and sync it:

```typescript
interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: number
}

// Get a document reference
const todo = sync.document<Todo>('todo-1')

// Initialize the document
await todo.init()

// Set the initial data
await todo.update({
  id: 'todo-1',
  text: 'Learn SyncKit',
  completed: false,
  createdAt: Date.now()
})

console.log('Todo created!')

// Read it back
const data = todo.get()
console.log('Todo:', data)
// Output: { id: 'todo-1', text: 'Learn SyncKit', completed: false, createdAt: 1732147200000 }
```

**What just happened?**
- Created a typed document with ID `'todo-1'`
- Data saved to IndexedDB automatically
- Fully type-safe with TypeScript
- Zero latency—instant write!

---

### Step 3: Subscribe to Real-Time Updates (1 minute)

Documents are **reactive**—subscribe to get notified of changes:

```typescript
// Subscribe to changes
const unsubscribe = todo.subscribe((data) => {
  console.log('Todo updated:', data)
})

// Update the todo
await todo.update({ completed: true })
// Output: "Todo updated: { id: 'todo-1', text: 'Learn SyncKit', completed: true, ... }"

// Update multiple fields at once
await todo.update({
  text: 'Master SyncKit',
  completed: false
})
// Output: "Todo updated: { id: 'todo-1', text: 'Master SyncKit', completed: false, ... }"

// Clean up when done
unsubscribe()
```

**What just happened?**
- Subscribed to real-time updates
- Partial updates automatically merge with existing data
- Subscriber fires immediately with current state + on every change

---

### Step 4: Test Offline Persistence (1 minute)

Refresh your browser or close and reopen—your data persists!

```typescript
// This works even after browser refresh
const todo = sync.document<Todo>('todo-1')
await todo.init()

const data = todo.get()
console.log('Todo still here:', data)
// Output: { id: 'todo-1', text: 'Master SyncKit', completed: false, ... }
```

**Test it yourself:**
1. Run the code above in your browser console
2. Refresh the page (Ctrl/Cmd + R)
3. Run `todo.get()` again—data is still there!

---

### Step 5: Multi-Tab Sync ✅

**Cross-tab synchronization works automatically via BroadcastChannel API:**

Open your app in **two browser tabs**. Changes in one tab will appear instantly in the other!

**In Tab 1:**
```typescript
const todo = sync.document<Todo>('todo-1')
await todo.init()
todo.subscribe((data) => {
  console.log('Tab 1 received:', data.text)
})
```

**In Tab 2:**
```typescript
const todo = sync.document<Todo>('todo-1')
await todo.init()
await todo.update({ text: 'Hello from Tab 2!' })
```

**What happens:**
- ✅ Real-time cross-tab synchronization (via BroadcastChannel)
- ✅ No server required—completely client-side
- ✅ Instant updates between tabs
- ✅ Tab 1 immediately sees: "Tab 1 received: Hello from Tab 2!"

**How it works:**
- Documents use BroadcastChannel API for cross-tab communication
- Updates in one tab automatically sync to all other tabs
- Works completely offline—no network required

---

## 🎉 Congratulations!

**You just built offline-first, persistent storage in 5 minutes!**

Here's what your app can do:
- ✅ **Works completely offline** - No server needed
- ✅ **Instant updates** - <1ms local operations
- ✅ **Persists data** - Survives browser restarts
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Conflict-free** - Automatic conflict resolution (LWW)
- ✅ **Network sync** - Real-time sync with WebSocket
- ✅ **Cross-tab sync** - Real-time updates across browser tabs

---

## React Quick Start

Using React? Here's the same example with hooks:

```tsx
import React, { useEffect, useState } from 'react'
import { SyncKit } from '@synckit-js/sdk'
import { SyncProvider, useSyncDocument } from '@synckit-js/sdk/react'

interface Todo {
  id: string
  text: string
  completed: boolean
}

function TodoApp() {
  // useSyncDocument returns [data, { set, update, delete }, doc]
  const [todo, { update }] = useSyncDocument<Todo>('todo-1')

  if (!todo || !todo.text) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={(e) => update({ completed: e.target.checked })}
      />
      <input
        type="text"
        value={todo.text}
        onChange={(e) => update({ text: e.target.value })}
      />
    </div>
  )
}

export default function App() {
  const [synckit, setSynckit] = useState<SyncKit | null>(null)

  useEffect(() => {
    const initSync = async () => {
      const sync = new SyncKit({
        storage: 'indexeddb',
        name: 'my-app'
      })
      await sync.init()
      setSynckit(sync)
    }
    initSync()
  }, [])

  if (!synckit) {
    return <div>Initializing...</div>
  }

  return (
    <SyncProvider synckit={synckit}>
      <TodoApp />
    </SyncProvider>
  )
}
```

**That's it!** The `useSyncDocument` hook handles subscriptions, updates, and cleanup automatically.

---

## Next Steps

Now that you've mastered the basics, here's what to explore next:

### 🔌 Connect to a Backend Server

Network sync works over WebSocket for real-time collaboration:

```typescript
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',  // ✅ Enables real-time sync
  storage: 'indexeddb',
  name: 'my-app'
})
await sync.init()
// ✅ Automatically syncs with server
// ✅ Offline queue with auto-replay when reconnected
// ✅ Automatic conflict resolution via LWW
```

**What you get:**
- ✅ Real-time document synchronization across clients
- ✅ Automatic reconnection with exponential backoff
- ✅ Offline queue that replays operations when back online
- ✅ Network status tracking with `sync.getNetworkStatus()`

See: [Network API Reference](../api/NETWORK_API.md) for complete network sync documentation

### 📱 Add to Your Existing App

Integrate SyncKit into your React, Vue, or Svelte app:

- React: See [SDK API Reference](../api/SDK_API.md#react-hooks) for React hooks documentation
- Vue Integration Guide *(coming in v0.2+)*
- Svelte Integration Guide *(coming in v0.2+)*

### 🎓 Learn Core Concepts

Deep-dive into how SyncKit works:

- [Offline-First Patterns](./offline-first.md) - True offline-first architecture
- [Conflict Resolution](./conflict-resolution.md) - How conflicts are handled automatically
- [Performance Optimization](./performance.md) - Get the most out of SyncKit
- [Testing Guide](./testing.md) - Test your offline-first app

### 🚀 Explore Examples

See SyncKit in action with complete example apps:

- [Todo App](../../examples/todo-app/) - Simple CRUD with filters
- [Collaborative Editor](../../examples/collaborative-editor/) - Real-time text editing
- [Project Management App](../../examples/project-management/) - Kanban board with drag-and-drop

### 📚 API Reference

Explore the complete API:

- [SDK API Reference](../api/SDK_API.md) - Complete API documentation (includes React hooks)
- [Network API Reference](../api/NETWORK_API.md) - Network sync and offline queue
- [Architecture Overview](../architecture/ARCHITECTURE.md) - How SyncKit works under the hood

---

## Common Issues

### "Module not found: @synckit-js/sdk"

**Solution:** Make sure you've installed the package:
```bash
npm install @synckit-js/sdk
```

React hooks are included in the main SDK package.

---

### "QuotaExceededError: IndexedDB quota exceeded"

**Solution:** Clear old data or increase quota:
```typescript
// Option 1: Delete specific documents
await sync.deleteDocument('todo-1')  // Delete entire document by ID

// Option 2: Delete a field from a document
const todo = sync.document<Todo>('todo-1')
await todo.init()
await todo.delete('dueDate')  // Deletes the 'dueDate' field

// Option 3: Clear all data
await sync.clearAll()

// Option 4: Request persistent storage (Chrome/Edge)
if (navigator.storage && navigator.storage.persist) {
  await navigator.storage.persist()
}
```

**Note:** `doc.delete(field)` deletes a **field**, not the whole document. Use `sync.deleteDocument(id)` to delete entire documents.

---

### Changes not syncing across tabs

**✅ Cross-tab synchronization works automatically!**

Changes should sync automatically between tabs via BroadcastChannel API. If not working:

**Solution:** Ensure you're using the same document ID in both tabs:

```typescript
// ✅ Correct - Same ID in both tabs
const todo = sync.document<Todo>('todo-1')

// ❌ Wrong - Different IDs won't sync
const todo = sync.document<Todo>('todo-' + Math.random())
```

**Also check:**
- Both tabs are using the same SyncKit instance configuration
- Both tabs have called `await todo.init()`
- Both tabs are subscribing to changes with `todo.subscribe()`
- Browser supports BroadcastChannel API (all modern browsers)

---

### TypeScript errors: "Type 'X' is not assignable to type 'Y'"

**Solution:** Make sure your document interface matches the data structure:

```typescript
// Define your interface
interface Todo {
  id: string
  text: string
  completed: boolean
  // Optional fields must be marked with ?
  dueDate?: Date
}

// Use it with your document
const todo = sync.document<Todo>('todo-1')
```

---

## Get Help

Need assistance?

- 📖 **[Documentation](../README.md)** - Comprehensive guides and API reference
- 💬 **[Discord Community](#)** - Get help from the community *(coming soon)*
- 🐛 **[GitHub Issues](https://github.com/Dancode-188/synckit/issues)** - Report bugs or request features
- 📧 **[Email Support](mailto:danbitengo@gmail.com)** - Direct support for enterprise users

---

## What Makes SyncKit Different?

| Feature | SyncKit | Firebase | Supabase | Yjs | Automerge |
|---------|:-------:|:--------:|:--------:|:---:|:---------:|
| **True Offline-First** | ✅ Native | ⚠️ Cache only | ❌ None | ✅ Full | ✅ Full |
| **Works Without Server** | ✅ Yes | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Bundle Size** | **154KB** (46KB lite) | ~150-200KB | ~45KB | ~65KB (core) | 300KB+ |
| **Text Editing** | ✅ Fugue + Peritext | ❌ None | ❌ None | ✅ Y.Text | ✅ Yes |
| **Framework Adapters** | ✅ React, Vue, Svelte | ❌ None | ❌ None | ⚠️ React only | ❌ None |
| **Self-Hosted** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |

**SyncKit = True offline-first + No vendor lock-in + Production ready**

---

## Summary

In this guide, you learned how to:

- ✅ Install and initialize SyncKit
- ✅ Create and update synced documents
- ✅ Subscribe to real-time changes
- ✅ Test offline persistence
- ✅ Test cross-tab synchronization
- ✅ Use React hooks for easier integration
- ✅ Connect to a backend server with WebSocket

**Time taken:** 5 minutes ⏱️
**Lines of code:** ~20 lines 📝
**Result:** Production-ready offline-first storage 🚀

Ready to build something amazing? Check out the [examples](../../examples/) or dive into [offline-first patterns](./offline-first.md)!

---

**Welcome to the offline-first revolution! 🎉**
