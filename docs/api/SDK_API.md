# SyncKit SDK API Reference

**Version:** 0.2.0
**Last Updated:** December 17, 2025

---

## ✅ v0.2.0 - Production Ready

**SyncKit v0.2.0 is production-ready with collaborative editing, rich text, undo/redo, and framework adapters.**

### What's New in v0.2.0

**Collaborative Text Editing:**
- ✅ `SyncText` - Plain text collaboration with Fugue CRDT
- ✅ `RichText` - Rich text with Peritext formatting (bold, italic, links, colors)
- ✅ `QuillBinding` - Production-ready Quill editor integration
- ✅ Delta utilities for Quill interoperability

**Undo/Redo:**
- ✅ `UndoManager` - Cross-tab undo/redo that persists across sessions
- ✅ Works with all CRDT types (documents, text, rich text)

**Presence & Awareness:**
- ✅ `Awareness` - Real-time user presence tracking
- ✅ Cursor and selection sharing
- ✅ XPath-based cursor serialization

**Additional CRDTs:**
- ✅ `SyncCounter` - Distributed counter (PN-Counter)
- ✅ `SyncSet` - Conflict-free set (OR-Set)

**Framework Adapters (v0.2.0):**
- ✅ React hooks for all features
- ✅ Vue 3 composables (Composition API)
- ✅ Svelte 5 stores with runes support

**Core SDK (`@synckit-js/sdk`):**
- ✅ `SyncKit` class: `init()`, `document()`, `text()`, `richText()`, `counter()`, `set()`
- ✅ `SyncDocument<T>` with LWW-CRDT
- ✅ IndexedDB & Memory storage adapters
- ✅ WebSocket sync with auto-reconnection
- ✅ Offline queue with persistent storage
- ✅ Binary message protocol

### Not Yet Implemented

- ⏳ List CRDT (coming in future version)
- ⏳ Auth provider integration
- ⏳ Conflict callbacks

**Current use:** Production-ready collaborative apps with text editing, real-time presence, and undo/redo.

---

## Overview

This document defines the TypeScript SDK API for SyncKit. The design follows these principles:

1. **Simple by default** - Common cases require minimal code
2. **Type-safe** - Full TypeScript support with generics
3. **Framework-agnostic core** - React/Vue/Svelte adapters built on top
4. **Progressive disclosure** - Advanced features available but not required

---

## Table of Contents

1. [Core API](#core-api)
2. [Tier 1: Document Sync (LWW)](#tier-1-document-sync-lww)
3. [Tier 2: Text Sync (CRDT)](#tier-2-text-sync-crdt)
4. [Tier 3: Additional CRDTs](#tier-3-additional-crdts)
5. [React Hooks](#react-hooks)
6. [Vue Composables](#vue-composables)
7. [Svelte Stores](#svelte-stores)

---

## Core API

### SyncKit Constructor

```typescript
import { SyncKit } from '@synckit-js/sdk'

// Minimal configuration (offline-only mode)
const sync = new SyncKit()
await sync.init()  // ✅ REQUIRED before using documents!

// With server URL (enables network sync)
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080'  // ✅ Enables WebSocket sync
})
await sync.init()

// Full v0.2.0 configuration with network options
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',  // ✅ Enable network sync
  storage: 'indexeddb',              // ✅ 'indexeddb' | 'memory'
  name: 'my-app',                    // ✅ Storage namespace
  clientId: 'user-123',              // ✅ Auto-generated if omitted
  network: {                         // ✅ Optional network config
    reconnect: {
      initialDelay: 1000,
      maxDelay: 30000,
      multiplier: 1.5
    },
    heartbeat: {
      interval: 30000,
      timeout: 5000
    },
    queue: {
      maxSize: 1000,
      maxRetries: 5
    }
  }
})
await sync.init()
```

### Configuration Options

```typescript
// ✅ v0.2.0 interface
interface SyncKitConfig {
  // Storage adapter (✅ WORKS)
  storage?: 'indexeddb' | 'memory' | StorageAdapter

  // Storage namespace (✅ WORKS)
  name?: string

  // Server URL for network sync (✅ WORKS - enables WebSocket sync)
  serverUrl?: string

  // Client ID (✅ WORKS - auto-generated if omitted)
  clientId?: string

  // Network configuration (✅ WORKS - optional)
  network?: NetworkConfig
}

interface NetworkConfig {
  // Reconnection settings
  reconnect?: {
    initialDelay?: number    // Initial delay before reconnection (ms)
    maxDelay?: number        // Maximum delay between attempts (ms)
    multiplier?: number      // Backoff multiplier
  }

  // Heartbeat/ping settings
  heartbeat?: {
    interval?: number        // Ping interval (ms)
    timeout?: number         // Pong timeout (ms)
  }

  // Offline queue settings
  queue?: {
    maxSize?: number         // Maximum queued operations
    maxRetries?: number      // Retry attempts per operation
    retryDelay?: number      // Initial retry delay (ms)
    retryBackoff?: number    // Retry delay multiplier
  }
}

// ⏳ Future options (planned): auth, syncStrategy, batchInterval, logLevel
```

### SyncKit Methods

```typescript
class SyncKit {
  // ✅ Initialize WASM and storage (REQUIRED before use)
  init(): Promise<void>

  // ✅ Get or create a document (documents are cached)
  document<T extends Record<string, unknown>>(id: string): SyncDocument<T>

  // ✅ Get or create text CRDT (v0.2.0)
  text(id: string): SyncText

  // ✅ Get or create rich text CRDT (v0.2.0)
  richText(id: string): RichText

  // ✅ Get or create counter CRDT (v0.2.0)
  counter(id: string): SyncCounter

  // ✅ Get or create set CRDT (v0.2.0)
  set<T>(id: string): SyncSet<T>

  // ✅ List all document IDs in storage
  listDocuments(): Promise<string[]>

  // ✅ Delete entire document by ID
  deleteDocument(id: string): Promise<void>

  // ✅ Clear all documents from storage
  clearAll(): Promise<void>

  // ✅ Get the client ID
  getClientId(): string

  // ✅ Check if initialized
  isInitialized(): boolean

  // ✅ Network methods (available when serverUrl is configured)

  // Get current network status (null if offline-only mode)
  getNetworkStatus(): NetworkStatus | null

  // Subscribe to network status changes (null if offline-only mode)
  onNetworkStatusChange(callback: (status: NetworkStatus) => void): Unsubscribe | null

  // Get document sync state (null if offline-only mode)
  getSyncState(documentId: string): DocumentSyncState | null

  // Subscribe to document sync state changes (null if offline-only mode)
  onSyncStateChange(documentId: string, callback: (state: DocumentSyncState) => void): Unsubscribe | null

  // Manually trigger document synchronization
  syncDocument(documentId: string): Promise<void>

  // Clean up resources
  dispose(): void
}
```

---

## Tier 1: Document Sync (LWW)

**Use Cases:** Task apps, CRMs, project management, simple note apps (80% of applications)

### Basic Usage

```typescript
interface Todo {
  id: string
  text: string
  completed: boolean
  dueDate?: Date
}

// ✅ REQUIRED: Initialize SyncKit first
const sync = new SyncKit({ storage: 'indexeddb' })
await sync.init()  // MUST call before using documents!

// Get document reference
const todo = sync.document<Todo>('todo-123')

// Subscribe to changes (reactive)
const unsubscribe = todo.subscribe((data) => {
  console.log('Todo updated:', data)
  // { id: 'todo-123', text: '...', completed: false }
})

// Update document (partial)
await todo.update({ completed: true })

// Update multiple fields
await todo.update({
  text: 'Buy groceries',
  dueDate: new Date('2025-12-01')
})

// Get current value (one-time read)
const currentTodo = todo.get()

// Delete a field
await todo.delete('dueDate')

// Unsubscribe when done
unsubscribe()
```

### Document API

```typescript
// ✅ v0.2.0 API
class SyncDocument<T extends Record<string, unknown>> {
  // Initialize document (auto-called by sync.document(), but can call manually)
  init(): Promise<void>

  // Subscribe to document changes
  subscribe(callback: (data: T) => void): () => void

  // Get current value (synchronous)
  get(): T

  // Get a single field value
  getField<K extends keyof T>(field: K): T[K] | undefined

  // Set a single field
  set<K extends keyof T>(field: K, value: T[K]): Promise<void>

  // Update document (partial update)
  update(changes: Partial<T>): Promise<void>

  // Delete a field (NOT the whole document!)
  delete<K extends keyof T>(field: K): Promise<void>

  // Merge another document into this one
  merge(other: SyncDocument<T>): Promise<void>

  // Export to plain object
  toJSON(): T

  // Get document ID
  getId(): string

  // Get number of fields
  getFieldCount(): number

  // Clean up subscriptions
  dispose(): void
}

// To delete entire document, use: sync.deleteDocument(id)
```

---

## Tier 2: Text Sync (CRDT) ✅ v0.2.0

**Use Cases:** Collaborative editors, note apps, documentation tools (15% of applications)

### Plain Text (SyncText)

```typescript
import { SyncText } from '@synckit-js/sdk'

const noteText = sync.text('note-456')

// Subscribe to changes
noteText.subscribe((content) => {
  console.log('Text content:', content)
  editor.setValue(content)
})

// Insert text at position
await noteText.insert(0, 'Hello ')

// Append to end
await noteText.insert(noteText.length(), 'World!')

// Delete range
await noteText.delete(0, 6)  // Delete 'Hello '

// Get current text
const content = noteText.get()
console.log(content)  // "World!"
```

### Rich Text (Peritext)

```typescript
import { RichText, QuillBinding } from '@synckit-js/sdk'

const richText = sync.richText('document')

// Apply formatting to range
await richText.format(0, 5, { bold: true })
await richText.format(6, 11, { italic: true, color: '#0066cc' })

// Get formatted ranges
const ranges = richText.getRanges()
// Returns: [
//   { start: 0, end: 5, attributes: { bold: true } },
//   { start: 6, end: 11, attributes: { italic: true, color: '#0066cc' } }
// ]

// Bind to Quill editor
const quill = new Quill('#editor')
const binding = new QuillBinding(richText, quill)
// Formatting is now automatically synced!
```

### Text API

```typescript
class SyncText {
  // Subscribe to text changes
  subscribe(callback: (content: string) => void): () => void

  // Insert text at position
  insert(position: number, text: string): Promise<void>

  // Delete range
  delete(start: number, length: number): Promise<void>

  // Get current content
  get(): string

  // Get text length
  length(): number

  // Get text ID
  readonly id: string
}

class RichText {
  // Apply formatting to range
  format(start: number, end: number, attributes: FormatAttributes): Promise<void>

  // Insert formatted text
  insert(position: number, text: string, attributes?: FormatAttributes): Promise<void>

  // Delete range
  delete(start: number, length: number): Promise<void>

  // Get formatted ranges
  getRanges(): FormatRange[]

  // Subscribe to changes
  subscribe(callback: (ranges: FormatRange[]) => void): () => void

  readonly id: string
}

type FormatAttributes = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
  link?: string
  color?: string
  backgroundColor?: string
  // Custom attributes supported
  [key: string]: any
}
```

---

## Tier 3: Additional CRDTs ✅ v0.2.0

**Use Cases:** Counters, sets, lists, collaborative state (5% of applications)

### Counter (PN-Counter)

Perfect for likes, votes, inventory—anything that increments or decrements.

```typescript
import { SyncCounter } from '@synckit-js/sdk'

const likesCounter = sync.counter('likes-789')

// Subscribe to changes
likesCounter.subscribe((value) => {
  console.log('Likes count:', value)
  updateUI(value)
})

// Increment
await likesCounter.increment()

// Increment by N
await likesCounter.increment(5)

// Decrement
await likesCounter.decrement()

// Get current value
const currentCount = likesCounter.get()
```

### Counter API

```typescript
// ✅ v0.2.0 - AVAILABLE
class SyncCounter {
  // Subscribe to counter changes
  subscribe(callback: (value: number) => void): () => void

  // Increment counter
  increment(delta?: number): Promise<void>

  // Decrement counter
  decrement(delta?: number): Promise<void>

  // Get current value
  get(): number

  // Reset to zero (not recommended - loses history)
  reset(): Promise<void>

  // Get counter ID
  readonly id: string
}
```

### Set (OR-Set)

Perfect for tags, participants, selections—anything that's a collection of unique items.

```typescript
import { SyncSet } from '@synckit-js/sdk'

const tags = sync.set<string>('tags-101')

// Subscribe to changes
tags.subscribe((items) => {
  console.log('Current tags:', Array.from(items))
})

// Add item
await tags.add('important')

// Add multiple items
await tags.addAll(['urgent', 'review'])

// Remove item
await tags.remove('important')

// Check membership
const hasTag = tags.has('urgent')

// Get all items
const allTags = tags.get()  // Returns Set<string>

// Get size
const count = tags.size()
```

### Set API

```typescript
// ✅ v0.2.0 - AVAILABLE
class SyncSet<T> {
  // Subscribe to set changes
  subscribe(callback: (items: Set<T>) => void): () => void

  // Add item
  add(item: T): Promise<void>

  // Add multiple items
  addAll(items: T[]): Promise<void>

  // Remove item
  remove(item: T): Promise<void>

  // Check membership
  has(item: T): boolean

  // Get all items
  get(): Set<T>

  // Get size
  size(): number

  // Clear set
  clear(): Promise<void>

  // Get set ID
  readonly id: string
}
```

---

## React Hooks

**Package:** `@synckit-js/sdk/react`

### Setup

```typescript
import { useState, useEffect } from 'react'
import { SyncProvider } from '@synckit-js/sdk/react'
import { SyncKit } from '@synckit-js/sdk'

// ✅ Initialize SyncKit and wrap app with provider
function App() {
  const [sync] = useState(() => new SyncKit({ storage: 'indexeddb' }))

  useEffect(() => {
    sync.init()  // Initialize on mount
  }, [sync])

  return (
    <SyncProvider synckit={sync}>
      <TodoItem id="todo-1" />
    </SyncProvider>
  )
}
```

### useSyncDocument ✅ v0.2.0

```typescript
function TodoItem({ id }: { id: string }) {
  // Hook gets SyncKit from context, takes only id parameter
  const [todo, { set, update, delete: deleteField }, doc] = useSyncDocument<Todo>(id)

  return (
    <div>
      <input
        type="checkbox"
        checked={todo.completed || false}
        onChange={(e) => set('completed', e.target.checked)}
      />
      <span>{todo.text || ''}</span>
      <button onClick={() => deleteField('completed')}>Clear</button>
    </div>
  )
}

// API signature
function useSyncDocument<T>(
  id: string,
  options?: { autoInit?: boolean }
): [
  T,  // Current document data
  {
    set: <K extends keyof T>(field: K, value: T[K]) => Promise<void>
    update: (updates: Partial<T>) => Promise<void>
    delete: <K extends keyof T>(field: K) => Promise<void>
  },
  SyncDocument<T>  // Raw document instance
]
```

### useSyncField ✅ v0.2.0

```typescript
// Sync a single field instead of entire document
function CompletedCheckbox({ id }: { id: string }) {
  const [completed, setCompleted] = useSyncField<Todo, 'completed'>(id, 'completed')

  return (
    <input
      type="checkbox"
      checked={completed || false}
      onChange={(e) => setCompleted(e.target.checked)}
    />
  )
}

// API signature
function useSyncField<T, K extends keyof T>(
  id: string,
  field: K
): [T[K] | undefined, (value: T[K]) => Promise<void>]
```

### useSyncText ✅ v0.2.0

```typescript
import { useSyncText } from '@synckit-js/sdk/react'

function NoteEditor({ id }: { id: string }) {
  const [text, { insert, delete: del, append }] = useSyncText(id)

  return (
    <textarea
      value={text}
      onChange={(e) => {
        // Replace all text (for simple cases)
        del(0, text.length)
        insert(0, e.target.value)
      }}
    />
  )
}

// API signature
function useSyncText(id: string): [
  string,  // Current text content
  {
    insert: (position: number, text: string) => Promise<void>
    delete: (start: number, length: number) => Promise<void>
    append: (text: string) => Promise<void>
  }
]
```

### useSyncRichText ✅ v0.2.0

```typescript
import { useSyncRichText } from '@synckit-js/sdk/react'
import { QuillBinding } from '@synckit-js/sdk'

function RichEditor({ id }: { id: string }) {
  const [richText] = useSyncRichText(id)
  const quillRef = useRef()

  useEffect(() => {
    if (quillRef.current && richText) {
      const quill = new Quill(quillRef.current)
      const binding = new QuillBinding(richText, quill)
      return () => binding.dispose()
    }
  }, [richText])

  return <div ref={quillRef} />
}
```

### useSyncCounter ✅ v0.2.0

```typescript
import { useSyncCounter } from '@synckit-js/sdk/react'

function LikeButton({ postId }: { postId: string }) {
  const [likes, { increment, decrement }] = useSyncCounter(`likes-${postId}`)

  return (
    <div>
      <button onClick={() => increment()}>👍 {likes}</button>
      <button onClick={() => decrement()}>👎</button>
    </div>
  )
}

// API signature
function useSyncCounter(id: string): [
  number,  // Current count
  {
    increment: (delta?: number) => Promise<void>
    decrement: (delta?: number) => Promise<void>
  },
  SyncCounter  // Counter instance (for advanced usage like reset())
]
```

### useSyncSet ✅ v0.2.0

```typescript
import { useSyncSet } from '@synckit-js/sdk/react'

function TagList({ docId }: { docId: string }) {
  const [tags, { add, remove }] = useSyncSet<string>(`tags-${docId}`)

  return (
    <div>
      {Array.from(tags).map(tag => (
        <span key={tag}>
          {tag}
          <button onClick={() => remove(tag)}>×</button>
        </span>
      ))}
      <button onClick={() => add('new-tag')}>Add Tag</button>
    </div>
  )
}

// API signature
function useSyncSet<T>(id: string): [
  Set<T>,  // Current set items (use tags.has() to check membership)
  {
    add: (item: T) => Promise<void>
    addAll: (items: T[]) => Promise<void>
    remove: (item: T) => Promise<void>
    clear: () => Promise<void>
  },
  SyncSet<T>  // Set instance (for advanced usage)
]
```

### useUndo ✅ v0.2.0

```typescript
import { useUndo } from '@synckit-js/sdk/react'

function EditorToolbar({ documentId }: { documentId: string }) {
  const { undo, redo, canUndo, canRedo, undoStack, redoStack } = useUndo(documentId)

  return (
    <div>
      <button onClick={undo} disabled={!canUndo}>
        Undo {undoStack.length > 0 && `(${undoStack.length})`}
      </button>
      <button onClick={redo} disabled={!canRedo}>
        Redo {redoStack.length > 0 && `(${redoStack.length})`}
      </button>
    </div>
  )
}

// API signature
function useUndo(
  documentId: string,
  options?: {
    maxHistorySize?: number      // Maximum undo stack size (default: 100)
    captureTimeout?: number       // Debounce timeout for capturing operations (default: 500ms)
  }
): {
  undo: () => Promise<void>
  redo: () => Promise<void>
  canUndo: boolean
  canRedo: boolean
  undoStack: Operation[]          // Current undo stack
  redoStack: Operation[]          // Current redo stack
  add: (operation: Operation) => void      // Manually add operation to history
  clear: () => void                        // Clear all history
}
```

### usePresence ✅ v0.2.0

```typescript
import { usePresence } from '@synckit-js/sdk/react'

function UserList({ roomId }: { roomId: string }) {
  const { users, updatePresence } = usePresence(roomId)

  useEffect(() => {
    updatePresence({ name: 'Alice', color: '#ff0000' })
  }, [])

  return (
    <ul>
      {users.map(user => (
        <li key={user.id} style={{ color: user.color }}>
          {user.name}
        </li>
      ))}
    </ul>
  )
}
```

### useCursor ✅ v0.2.0

```typescript
import { useCursor } from '@synckit-js/sdk/react'

function CursorLayer({ documentId }: { documentId: string }) {
  const { cursors, updateCursor } = useCursor(documentId)

  const handleSelection = (range) => {
    updateCursor({ start: range.start, end: range.end })
  }

  return (
    <div>
      {cursors.map(cursor => (
        <div
          key={cursor.userId}
          style={{
            position: 'absolute',
            left: cursor.x,
            top: cursor.y,
            backgroundColor: cursor.color
          }}
        />
      ))}
    </div>
  )
}
```

---

## Vue Composables ✅ v0.2.0

**Package:** `@synckit-js/sdk/vue`

### Setup

```typescript
import { provide, onMounted } from 'vue'
import { SyncKit } from '@synckit-js/sdk'
import { SYNCKIT_KEY } from '@synckit-js/sdk/vue'

export default {
  setup() {
    const sync = new SyncKit({ storage: 'indexeddb' })

    onMounted(async () => {
      await sync.init()
    })

    provide(SYNCKIT_KEY, sync)

    return { sync }
  }
}
```

### useDocument ✅ v0.2.0

```vue
<script setup lang="ts">
import { useDocument } from '@synckit-js/sdk/vue'

const { data: todo, update, set } = useDocument<Todo>('todo-1')
</script>

<template>
  <div>
    <input
      type="checkbox"
      :checked="todo.completed"
      @change="set('completed', $event.target.checked)"
    />
    <span>{{ todo.text }}</span>
  </div>
</template>
```

### Counter & Set (Use Vanilla SDK) ⚠️

**Note:** Vue adapter does not include `useText`, `useCounter`, or `useSet` composables. For these CRDTs, use the vanilla SDK:

```vue
<script setup lang="ts">
import { useSyncKit } from '@synckit-js/sdk/vue'
import { ref, onMounted, onUnmounted } from 'vue'

const synckit = useSyncKit()
const count = ref(0)

let counter: SyncCounter
let unsubscribe: (() => void) | null = null

onMounted(() => {
  counter = synckit.counter('likes')
  unsubscribe = counter.subscribe((value) => {
    count.value = value
  })
})

onUnmounted(() => {
  unsubscribe?.()
})

const increment = () => counter.increment()
</script>

<template>
  <button @click="increment()">👍 {{ count }}</button>
</template>
```

**Available Vue composables:** `useSyncDocument`, `useSyncField`, `useRichText`, `usePresence`, `useOthers`, `useSelf`, `useUndo`, `useSelection`

---

## Svelte Stores ✅ v0.2.0

**Package:** `@synckit-js/sdk/svelte`

### Setup

```svelte
<script>
  import { setContext, onMount } from 'svelte'
  import { SyncKit } from '@synckit-js/sdk'
  import { SYNCKIT_KEY } from '@synckit-js/sdk/svelte'

  const sync = new SyncKit({ storage: 'indexeddb' })

  onMount(async () => {
    await sync.init()
  })

  setContext(SYNCKIT_KEY, sync)
</script>
```

### documentStore ✅ v0.2.0

```svelte
<script lang="ts">
  import { documentStore } from '@synckit-js/sdk/svelte'

  const todo = documentStore<Todo>('todo-1')
</script>

<input
  type="checkbox"
  checked={$todo.completed}
  on:change={(e) => todo.set('completed', e.target.checked)}
/>
<span>{$todo.text}</span>
```

### textStore ✅ v0.2.0

```svelte
<script>
  import { textStore } from '@synckit-js/sdk/svelte'

  const note = textStore('note-1')
</script>

<textarea bind:value={$note} />
```

### Counter & Set (Use Vanilla SDK) ⚠️

**Note:** Svelte adapter does not include `counterStore` or `setStore`. For these CRDTs, use the vanilla SDK with custom stores:

```svelte
<script lang="ts">
  import { getContext, onMount } from 'svelte'
  import { writable } from 'svelte/stores'
  import type { SyncKit } from '@synckit-js/sdk'

  const synckit = getContext<SyncKit>('synckit')
  const likes = writable(0)

  let counter: SyncCounter
  let unsubscribe: (() => void) | null = null

  onMount(() => {
    counter = synckit.counter('likes')
    unsubscribe = counter.subscribe((value) => {
      likes.set(value)
    })

    return () => {
      unsubscribe?.()
    }
  })

  const increment = () => counter.increment()
</script>

<button onclick={increment}>👍 {$likes}</button>
```

**Available Svelte stores:** `syncDocument`, `syncText`, `richText`, `undo`, `presence`, `others`, `self`, `syncStatus`, `selectionStore`

---

## Error Handling

### Error Types

```typescript
// ✅ v0.2.0 error types
class SyncKitError extends Error {
  constructor(message: string, public code: string) {
    super(message)
  }
}

// Specific error types in v0.2.0
class StorageError extends SyncKitError { /* Storage operations */ }
class WASMError extends SyncKitError { /* WASM initialization */ }
class DocumentError extends SyncKitError { /* Document operations */ }
class NetworkError extends SyncKitError { /* Network operations */ }

// ⏳ Planned: AuthError, PermissionError, ConflictError
```

### Error Handling Patterns

```typescript
// ✅ v0.2.0: Try-catch for async operations
try {
  await sync.init()
  await todo.update({ completed: true })
} catch (error) {
  if (error instanceof StorageError) {
    console.error('Storage failed:', error.message)
  } else if (error instanceof WASMError) {
    console.error('WASM initialization failed:', error.message)
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message)
  } else if (error instanceof SyncKitError) {
    console.error('SyncKit error:', error.code, error.message)
  }
}
```

---

## TypeScript Types

### Full Type Definitions (v0.2.0 Exports)

```typescript
// ✅ Core classes
export { SyncKit } from '@synckit-js/sdk'
export { SyncDocument } from '@synckit-js/sdk'
export { SyncText, RichText } from '@synckit-js/sdk'
export { SyncCounter, SyncSet } from '@synckit-js/sdk'
export { UndoManager } from '@synckit-js/sdk'
export { Awareness } from '@synckit-js/sdk'
export { QuillBinding } from '@synckit-js/sdk/integrations/quill'

// ✅ Storage adapters
export { MemoryStorage, IndexedDBStorage, createStorage } from '@synckit-js/sdk'
export type { StorageAdapter, StoredDocument } from '@synckit-js/sdk'

// ✅ Configuration and types
export type {
  SyncKitConfig,
  NetworkConfig,
  DocumentData,
  FieldPath,
  SubscriptionCallback,
  Unsubscribe,
  QueuedOperation,
  QueueConfig,
  NetworkStatus,
  DocumentSyncState,
  FormatAttributes,
  FormatRange
} from '@synckit-js/sdk'

// ✅ Error classes
export {
  SyncKitError,
  StorageError,
  WASMError,
  DocumentError,
  NetworkError
} from '@synckit-js/sdk'

// ✅ React hooks (requires React)
export {
  SyncProvider,
  useSyncKit,
  useSyncDocument,
  useSyncField,
  useSyncText,
  useSyncRichText,
  useSyncCounter,
  useSyncSet,
  useUndo,
  usePresence,
  useOthers,
  useSelf,
  useCursor,
  useCursorTracking,  // Lower-level cursor tracking utility
  useNetworkStatus,
  useSyncState
} from '@synckit-js/sdk/react'

// ✅ Vue composables (requires Vue 3)
// NOTE: Vue does NOT export useText, useCounter, or useSet - use vanilla SDK for those
export {
  useSyncDocument,
  useSyncField,
  useRichText,
  usePresence,
  useOthers,
  useSelf,
  useUndo,
  useSelection
} from '@synckit-js/sdk/vue'

// ✅ Svelte stores (requires Svelte 5)
// NOTE: Svelte does NOT export counterStore or setStore - use vanilla SDK for those
export {
  syncDocument,
  syncText,
  richText,
  undo,
  presence,
  others,
  self,
  syncStatus,
  selectionStore
} from '@synckit-js/sdk/svelte'
```

---

## Summary

**v0.2.0 API Coverage:**

✅ **Core:**
- Documents (LWW-CRDT)
- Text (Fugue CRDT)
- Rich Text (Peritext)
- Counter (PN-Counter)
- Set (OR-Set)
- Undo/Redo (cross-tab)
- Presence & Awareness
- Cursor sharing

✅ **Framework Adapters:**
- React hooks (complete)
- Vue 3 composables (complete)
- Svelte 5 stores (complete)

✅ **Infrastructure:**
- IndexedDB & Memory storage
- WebSocket sync
- Offline queue
- Binary protocol

**Production Ready:** All features are tested and ready for production use.
