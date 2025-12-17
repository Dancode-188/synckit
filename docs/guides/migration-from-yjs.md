# Migrating from Yjs/Automerge to SyncKit

Thinking about switching to SyncKit? This guide walks you through what changes, what stays the same, and when it makes sense to migrate.

---

## Table of Contents

1. [When to Choose SyncKit Over Yjs/Automerge](#when-to-choose-synckit-over-yjsautomerge)
2. [What Yjs Does Exceptionally Well](#what-yjs-does-exceptionally-well)
3. [What Automerge Does Exceptionally Well](#what-automerge-does-exceptionally-well)
4. [Design Philosophy: Modular vs Integrated](#design-philosophy-modular-vs-integrated)
5. [Yjs vs SyncKit Comparison](#yjs-vs-synckit-comparison)
6. [Automerge vs SyncKit Comparison](#automerge-vs-synckit-comparison)
7. [Migration Considerations](#migration-considerations)
8. [Core Concepts Mapping](#core-concepts-mapping)
9. [Code Migration Patterns](#code-migration-patterns)
10. [Performance Optimization](#performance-optimization)
11. [Testing & Validation](#testing--validation)

---

## When to Choose SyncKit Over Yjs/Automerge

**Choose SyncKit if you want:**
- Rich text editing with proper conflict resolution (Peritext) built-in
- Cross-tab undo/redo without custom implementation
- Framework adapters (React, Vue, Svelte) maintained and tested for you
- Production features that work together immediately
- A complete solution in one package (154KB)

**Choose Yjs if:**
- Bundle size is your absolute top priority (65KB vs 154KB)
- You need CodeMirror or Monaco editor integration
- You prefer building custom integrations yourself
- Your team has deep CRDT expertise

**Choose Automerge if:**
- You need specific CRDT types (lists, complex nested structures)
- Time-travel debugging is critical for your use case
- You're already invested in the Automerge ecosystem

---

## What Yjs Does Exceptionally Well

Yjs is a brilliantly optimized CRDT library that's been battle-tested in production:

**Strengths:**
- **Minimal bundle size:** At ~65KB (core), it's the smallest production-ready CRDT library
- **Battle-tested:** Used by thousands of apps in production for years
- **Efficient sync:** State vector approach minimizes network overhead
- **Flexible architecture:** Modular design lets you build exactly what you need
- **Editor ecosystem:** Bindings for ProseMirror, Monaco, CodeMirror, Quill, and more
- **WebRTC support:** Peer-to-peer sync without a server
- **Mature community:** Large ecosystem of providers and extensions

**What makes Yjs special:**

Yjs has been refined over years to be incredibly efficient. The core team's focus on minimalism means every byte is optimized. If you only need basic text sync and want maximum control over your integration, Yjs is an excellent choice.

**If these match your priorities, stick with Yjs.**

---

## What Automerge Does Exceptionally Well

Automerge is a powerful CRDT library with unique capabilities:

**Strengths:**
- **Rich CRDT types:** Comprehensive support for lists, maps, text, and nested structures
- **Time-travel debugging:** Built-in operation history lets you inspect every change
- **Conflict visibility:** See exactly how conflicts were resolved
- **Mature core:** Stable, well-tested CRDT implementation
- **Academic foundation:** Built on solid CRDT research
- **Portable format:** WASM implementation works everywhere
- **Complete history:** Maintains full operation graph for auditing

**What makes Automerge special:**

Automerge prioritizes correctness and capability. If you need to inspect every change, debug conflicts, or work with complex nested data structures, Automerge gives you powerful tools.

**If these match your priorities, stick with Automerge.**

---

## Design Philosophy: Modular vs Integrated

Yjs, Automerge, and SyncKit solve similar problems but make different trade-offs.

### Yjs Philosophy: Modular Core

**Approach:** Minimal core (65KB) + community ecosystem

**What this gives you:**
- Maximum flexibility to build exactly what you need
- Smaller bundle if you only need basic features
- Choose your own framework integration approach
- Fine-grained control over sync, persistence, and awareness

**Trade-off:** You assemble the pieces yourself. Setting up sync requires choosing and configuring providers (WebSocket, WebRTC, IndexedDB). Framework integration is your responsibility.

### Automerge Philosophy: Complete History

**Approach:** Full operation history + rich CRDT types

**What this gives you:**
- Time-travel debugging through the entire document history
- Complex data structures (lists, maps, nested objects) with conflict resolution
- Explicit conflict visibility for auditing
- Portable WASM implementation

**Trade-off:** Larger bundle (~300KB+) to maintain complete operation graph. Immutable API requires understanding change functions.

### SyncKit Philosophy: Integrated Solution

**Approach:** Batteries included (154KB) with everything tested together

**What this gives you:**
- Framework adapters (React, Vue, Svelte) built-in and maintained
- Rich text (Peritext), undo/redo, presence work together out of the box
- Quill binding ships in the package
- Zero configuration—sync, persistence, and awareness included

**Trade-off:** Larger bundle than Yjs (154KB vs 65KB) since everything's included. Less flexibility than building your own integration.

---

## Yjs vs SyncKit: Comparison

Both libraries handle collaborative editing. Here's how they differ:

| Feature | Yjs | SyncKit v0.2.0 | Notes |
|---------|-----|---------------|-------|
| **Bundle Size** | ~65KB (core) | **154KB** (46KB lite) | Yjs is smaller. SyncKit includes text, rich text, undo, presence, cursors, framework adapters. |
| **Setup** | Manual (providers, persistence) | Built-in | Yjs: choose providers. SyncKit: works immediately. |
| **Text Editing** | Y.Text (mature, fast) | SyncText + RichText | Both work well. Yjs is more mature. |
| **Rich Text** | Requires bindings (y-prosemirror, y-quill) | Built-in with Quill binding | Yjs: install separately. SyncKit: included with Peritext. |
| **Undo/Redo** | Y.UndoManager | UndoManager (cross-tab) | Both have it. SyncKit's syncs across tabs. |
| **Framework Support** | Community packages | React, Vue 3, Svelte 5 included | Yjs: build your own. SyncKit: maintained adapters. |
| **Editor Bindings** | ProseMirror, Monaco, CodeMirror, Quill | Quill | Yjs has more editor support. |
| **Maturity** | Battle-tested, years in production | Production-ready, growing | Yjs has more production years. |
| **TypeScript** | Community types | Native TypeScript | SyncKit is TypeScript-first. |

### Setting Up React Integration

**Yjs approach:**
```typescript
// You build this yourself
import { useEffect, useState } from 'react'
import * as Y from 'yjs'

function useSyncedState(yText) {
  const [value, setValue] = useState(yText.toString())

  useEffect(() => {
    const observer = () => setValue(yText.toString())
    yText.observe(observer)
    return () => yText.unobserve(observer)
  }, [yText])

  return [value, (newValue) => {
    yText.delete(0, yText.length)
    yText.insert(0, newValue)
  }]
}
```

**SyncKit approach:**
```typescript
// Built-in hook
import { useSyncText } from '@synckit/react'

function MyComponent() {
  const [text, setText] = useSyncText('doc-id')
  return <input value={text} onChange={(e) => setText(e.target.value)} />
}
```

Both work. Yjs gives you control. SyncKit gives you convenience.

---

## Automerge vs SyncKit: Comparison

Both aim for production-ready collaboration. Here's where they differ:

| Feature | Automerge | SyncKit v0.2.0 | Notes |
|---------|-----------|---------------|-------|
| **Bundle Size** | **300KB+** with ecosystem | 154KB (46KB lite) | SyncKit is smaller. |
| **API Style** | Immutable updates, change functions | Mutable document API | Automerge: functional. SyncKit: familiar JavaScript. |
| **CRDT Features** | Lists, maps, text, rich arrays | Text, RichText, Counter, Set | Automerge has more CRDT types. |
| **Rich Text** | Supported | Peritext with Quill binding | Both support rich text. |
| **Undo/Redo** | Available | Built-in, cross-tab | SyncKit makes it simpler. |
| **Framework Support** | Build your own | React, Vue, Svelte included | SyncKit ships adapters. |
| **History** | Complete operation graph | Current state only | Automerge: time-travel. SyncKit: current state. |
| **Production Status** | Stable core, evolving ecosystem | Production-ready | Both are solid. |

### State Updates

**Automerge approach:**
```typescript
import { change, from } from '@automerge/automerge'

let doc = from({ todos: [] })

doc = change(doc, doc => {
  doc.todos.push({ text: 'Buy milk', done: false })
})

// Must understand immutable updates and change functions
```

**SyncKit approach:**
```typescript
const todoList = sync.document<TodoList>('todos')
await todoList.init()

const currentData = todoList.get()
await todoList.update({
  todos: [
    ...(currentData.todos || []),
    { id: 'todo-1', text: 'Buy milk', done: false }
  ]
})

// Mutable API, familiar JavaScript
```

Both handle conflicts. Automerge gives you explicit control. SyncKit handles it automatically.

---

## Migration Considerations

### What You'll Lose

#### Migrating from Yjs

**Trade-offs:**
- Complex CRDTs (Y.Map, Y.Array, Y.Xml) → Use document fields
- Editor integrations (Monaco, CodeMirror) → Quill only (for now)
- Peer-to-peer WebRTC → Server-based sync
- Fine-grained control over providers → Integrated sync

**What you gain:**
- Simpler API (less code to maintain)
- Framework adapters included
- Rich text formatting built-in
- Cross-tab undo/redo

#### Migrating from Automerge

**Trade-offs:**
- Time-travel debugging → Current state only
- Rich CRDT types (lists, maps) → Specialized types (Text, Counter, Set)
- Explicit conflict visibility → Automatic resolution
- Complete operation history → Efficient current state

**What you gain:**
- Smaller bundle (154KB vs 300KB+)
- Simpler API (mutable updates)
- Framework adapters included
- Production-tested features

### What You'll Keep

**Both migrations preserve:**
- ✅ Offline-first architecture
- ✅ Automatic conflict resolution
- ✅ Real-time sync
- ✅ Multi-client support
- ✅ Local persistence

---

## Core Concepts Mapping

### Yjs Y.Doc → SyncKit Document

**Yjs:**
```typescript
import * as Y from 'yjs'

const ydoc = new Y.Doc()
const ymap = ydoc.getMap('todos')

ymap.set('todo-1', {
  text: 'Buy milk',
  completed: false
})
```

**SyncKit:**
```typescript
const todo = sync.document<Todo>('todo-1')
await todo.init()

await todo.update({
  id: 'todo-1',
  text: 'Buy milk',
  completed: false
})
```

### Yjs Y.Map → SyncKit Document Fields

**Yjs:**
```typescript
const ymap = ydoc.getMap('todo-1')

ymap.observe((event) => {
  console.log('Changed keys:', event.keysChanged)
})

ymap.set('completed', true)
```

**SyncKit:**
```typescript
const todo = sync.document<Todo>('todo-1')

todo.subscribe((data) => {
  console.log('Todo updated:', data)
})

await todo.update({ completed: true })
```

### Yjs Y.Text → SyncKit Text CRDT ✅ (Available in v0.2.0)

**Yjs:**
```typescript
const ytext = ydoc.getText('content')

ytext.observe((event) => {
  console.log('Text changed:', ytext.toString())
})

ytext.insert(0, 'Hello ')
ytext.insert(6, 'World')
```

**SyncKit v0.2.0 (Plain Text):**
```typescript
const text = sync.text('content')

text.subscribe((content) => {
  console.log('Text changed:', content)
})

await text.insert(0, 'Hello ')
await text.insert(6, 'World')
```

**SyncKit v0.2.0 (Rich Text with Formatting):**
```typescript
import { QuillBinding } from '@synckit-js/sdk/integrations/quill'

// Rich text with Peritext formatting
const richText = sync.richText('document')

// Bind to Quill editor—formatting handled automatically
const binding = new QuillBinding(richText, quillInstance)

// Or apply formatting programmatically
await richText.format(0, 5, { bold: true })
await richText.format(6, 11, { italic: true, color: '#0066cc' })
```

### Automerge change() → SyncKit update()

**Automerge:**
```typescript
import { change } from '@automerge/automerge'

let doc = { todos: [] }

doc = change(doc, 'Add todo', doc => {
  doc.todos.push({
    text: 'Buy milk',
    completed: false
  })
})
```

**SyncKit:**
```typescript
const todoList = sync.document<TodoList>('todos')
await todoList.init()

const currentData = todoList.get()
await todoList.update({
  todos: [
    ...(currentData.todos || []),
    {
      id: 'todo-1',
      text: 'Buy milk',
      completed: false
    }
  ]
})
```

---

## Code Migration Patterns

### Pattern 1: Document Collaboration (Yjs)

**Before (Yjs):**
```typescript
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'

// Create document
const ydoc = new Y.Doc()

// Set up persistence
const persistence = new IndexeddbPersistence('my-doc', ydoc)

// Set up sync
const provider = new WebsocketProvider(
  'ws://localhost:1234',
  'my-room',
  ydoc
)

// Get map
const ymap = ydoc.getMap('todos')

// Observe changes
ymap.observe((event) => {
  const todos = Object.fromEntries(ymap.entries())
  setTodos(todos)
})

// Update
ymap.set('todo-1', { text: 'Buy milk', completed: false })
```

**After (SyncKit):**
```typescript
// Create and configure (all built-in)
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  storage: 'indexeddb',
  name: 'my-app'
})
await sync.init()

// Get document
const todo = sync.document<Todo>('todo-1')
await todo.init()

// Subscribe
todo.subscribe((data) => {
  setTodo(data)
})

// Update
await todo.update({ completed: true })
```

Less code, same functionality.

### Pattern 2: State Management (Automerge)

**Before (Automerge):**
```typescript
import { from, change } from '@automerge/automerge'

// Initialize
let doc = from({ todos: {} })

// Update (immutable)
doc = change(doc, 'Add todo', doc => {
  doc.todos['todo-1'] = {
    text: 'Buy milk',
    completed: false
  }
})

// Read
console.log(doc.todos['todo-1'].text)

// Merge from remote
doc = merge(doc, remoteDoc)
```

**After (SyncKit):**
```typescript
// Initialize
const todoList = sync.document<TodoList>('todos')
await todoList.init()

// Update (mutable API)
const currentData = todoList.get()
await todoList.update({
  todos: {
    ...(currentData.todos || {}),
    'todo-1': {
      text: 'Buy milk',
      completed: false
    }
  }
})

// Read
const data = todoList.get()
console.log(data.todos['todo-1'].text)

// Merge happens automatically
```

Familiar API, automatic merge.

### Pattern 3: Text Editing ✅ (Available in v0.2.0)

**Before (Yjs):**
```typescript
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'

const ydoc = new Y.Doc()
const ytext = ydoc.getText('content')

// Insert and delete
ytext.insert(0, 'Hello ')
ytext.delete(0, 6)

// Listen to changes
ytext.observe((event) => {
  event.delta.forEach(op => {
    if (op.insert) console.log('Inserted:', op.insert)
    if (op.delete) console.log('Deleted:', op.delete)
  })
})

// Bind to Monaco editor
const binding = new MonacoBinding(
  ytext,
  editor.getModel(),
  new Set([editor]),
  provider.awareness
)
```

**After (SyncKit v0.2.0):**
```typescript
import { QuillBinding } from '@synckit-js/sdk/integrations/quill'
import { UndoManager } from '@synckit-js/sdk'

// Plain text for simple cases
const text = sync.text('content')

await text.insert(0, 'Hello ')
await text.delete(0, 6)

text.subscribe((content) => {
  console.log('Text changed:', content)
})

// Rich text with Quill for production apps
const richText = sync.richText('document')
const binding = new QuillBinding(richText, quillInstance)

// Undo/redo just works (even across tabs!)
const undoManager = new UndoManager(sync, 'document')
await undoManager.undo()
await undoManager.redo()
```

Both handle text editing. Yjs has more editor bindings. SyncKit includes rich text formatting and cross-tab undo.

---

## Performance Optimization

### Design Difference: Client-Side vs Server-Side Merging

**Yjs approach:**

Yjs uses an efficient state vector protocol to minimize network traffic. The client receives operations and merges them locally. This works great for most scenarios.

**Consideration:** With many concurrent users (50+ simultaneous editors), the client's main thread processes every operation. On lower-end devices or after being offline, catching up can be CPU-intensive.

**SyncKit approach:**

SyncKit's Last-Write-Wins architecture lets the server merge operations before sending to clients:
- **Yjs:** Client receives 50 operations → Client computes final state
- **SyncKit:** Server merges 50 operations → Client receives 1 snapshot

**Trade-off:** SyncKit requires a server (can't do peer-to-peer like Yjs WebRTC). Benefit: Less CPU work on the client.

**Performance characteristics:**
- **Local operations:** Both are fast (<1ms)
- **Network sync:** Yjs sends operation history, SyncKit sends snapshots
- **Initial load:** SyncKit is faster when catching up with lots of missed updates

### Automerge Considerations

Automerge maintains a complete operation history for time-travel debugging. This is incredibly powerful but has trade-offs:

**Bundle size:** ~300KB+ vs SyncKit's 154KB
**Memory:** Full history graph vs current state

**When to use what:**
- **Automerge:** You need the history graph for auditing or debugging
- **SyncKit:** You just want the current state to sync efficiently

---

## Testing & Validation

### Parallel Testing During Migration

```typescript
describe('Yjs → SyncKit migration parity', () => {
  test('should produce same final state', async () => {
    // Yjs setup
    const ydoc = new Y.Doc()
    const ymap = ydoc.getMap('todo')

    // SyncKit setup
    const sync = new SyncKit({ storage: 'memory', name: 'test' })
    await sync.init()
    const todo = sync.document<Todo>('todo-1')
    await todo.init()

    // Apply same operations to both
    ymap.set('text', 'Buy milk')
    ymap.set('completed', false)

    await todo.update({
      id: 'todo-1',
      text: 'Buy milk',
      completed: false
    })

    // Compare final state
    const yjsState = Object.fromEntries(ymap.entries())
    const synckitState = todo.get()

    expect(synckitState.text).toBe(yjsState.text)
    expect(synckitState.completed).toBe(yjsState.completed)
  })
})
```

### Conflict Resolution Comparison

```typescript
test('both should handle conflicts gracefully', async () => {
  // Yjs conflict (automatic CRDT resolution)
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  const ymap1 = ydoc1.getMap('todo')
  const ymap2 = ydoc2.getMap('todo')

  ymap1.set('text', 'Version 1')
  ymap2.set('text', 'Version 2')

  // Merge
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))
  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))

  // Both converge (CRDT guarantees)
  expect(ymap1.get('text')).toBe(ymap2.get('text'))

  // SyncKit conflict (LWW resolution)
  const sync1 = new SyncKit({ storage: 'memory', name: 'client1' })
  const sync2 = new SyncKit({ storage: 'memory', name: 'client2' })
  await sync1.init()
  await sync2.init()

  const todo1 = sync1.document<Todo>('todo-1')
  const todo2 = sync2.document<Todo>('todo-1')
  await todo1.init()
  await todo2.init()

  await todo1.update({ text: 'Version 1' })
  await new Promise(r => setTimeout(r, 10))  // Ensure different timestamp
  await todo2.update({ text: 'Version 2' })

  // Manually merge documents
  await todo1.merge(todo2)

  const state1 = todo1.get()
  const state2 = todo2.get()

  // Both converge (LWW guarantees)
  expect(state1.text).toBe(state2.text)
  expect(state1.text).toBe('Version 2')  // Later write wins
})
```

---

## Summary

### What SyncKit v0.2.0 Includes

- **Text editing:** Fugue CRDT for plain text, Peritext for rich formatting
- **Undo/redo:** Works across tabs and sessions
- **Real-time presence:** See who's online, where they're typing
- **Framework adapters:** React, Vue 3, Svelte 5 included
- **Quill integration:** Production-ready rich text editor binding
- **Bundle: 154KB** (or 46KB lite for basic sync)

### When to Choose SyncKit

**Choose SyncKit if you want:**
- Rich text with proper conflict resolution
- Undo/redo that syncs everywhere
- Framework adapters maintained for you
- Production features that just work
- Vue or Svelte support (Yjs doesn't have official adapters)

**Stick with Yjs if:**
- Bundle size is your top priority (65KB vs 154KB)
- You need CodeMirror or Monaco integration
- You prefer building custom integrations yourself
- Peer-to-peer WebRTC sync is important

**Stick with Automerge if:**
- Time-travel debugging is critical
- You need specific CRDT types SyncKit doesn't have yet
- You're deeply invested in the Automerge ecosystem

### Migration Path

1. **Week 1:** Run SyncKit alongside your current setup (dual-write)
2. **Week 2-3:** Migrate one feature at a time
3. **Week 4:** Test thoroughly, fix any edge cases
4. **Week 5:** Remove old library when confident

Most teams finish in 4-6 weeks.

### What's Next

- Read the [Getting Started Guide](./getting-started.md) for a 5-minute quickstart
- Check out the [Rich Text Guide](./rich-text-editing.md) to see formatting in action
- Try the [Undo/Redo Guide](./undo-redo.md) for cross-tab time travel

---

**Ready to ship faster? Let's go. 🚀**
