# Undo/Redo API Documentation

SyncKit provides a powerful undo/redo system with cross-tab synchronization and intelligent operation merging.

## Table of Contents

- [Overview](#overview)
- [Core API](#core-api)
- [Framework Adapters](#framework-adapters)
  - [React](#react)
  - [Vue](#vue)
  - [Svelte](#svelte)
- [Operation Merging](#operation-merging)
- [Cross-Tab Synchronization](#cross-tab-synchronization)
- [Examples](#examples)

## Overview

The undo/redo system consists of three main components:

1. **UndoManager** - Core undo/redo logic with operation tracking
2. **CrossTabSync** - Browser tab synchronization via BroadcastChannel
3. **Framework Adapters** - React, Vue, and Svelte integrations

### Key Features

- **Intelligent Operation Merging** - Consecutive similar operations merge automatically (e.g., typing)
- **Cross-Tab Synchronization** - Undo/redo state syncs across browser tabs
- **Persistent Storage** - History survives page refreshes via IndexedDB
- **Type-Safe** - Full TypeScript support with strict typing
- **Framework Agnostic** - Core API works standalone, with optional framework adapters

## Core API

### UndoManager

The core undo/redo manager.

```typescript
import { UndoManager } from '@synckit-js/sdk/undo'
import { CrossTabSync } from '@synckit-js/sdk/sync'

const crossTabSync = new CrossTabSync('doc-123')
const undoManager = new UndoManager({
  documentId: 'doc-123',
  crossTabSync,
  maxUndoSize: 100,
  mergeWindow: 1000,
  onStateChanged: (state) => {
    console.log('Undo state changed:', state)
  }
})

await undoManager.init()
```

### Constructor Options

```typescript
interface UndoManagerOptions {
  // Required
  documentId: string
  crossTabSync: CrossTabSync

  // Optional
  maxUndoSize?: number              // Max operations in undo stack (default: 100)
  mergeWindow?: number               // Time window for merging in ms (default: 1000)
  canMerge?: CanMergeFn             // Custom merge predicate
  merge?: MergeFn                    // Custom merge function
  onStateChanged?: (state: UndoManagerState) => void
}
```

### Methods

#### `add(operation: Operation): void`

Add an operation to the undo stack.

```typescript
undoManager.add({
  type: 'insert',
  data: 'Hello world',
  timestamp: Date.now(),  // Optional, auto-generated if not provided
  userId: 'user-123',     // Optional, for multi-user scenarios
  mergeWindow: 2000       // Optional, override default merge window
})
```

#### `undo(): Operation | null`

Undo the last operation and move it to the redo stack.

```typescript
const operation = undoManager.undo()
if (operation) {
  // Apply the inverse of the operation
  console.log('Undid:', operation)
}
```

#### `redo(): Operation | null`

Redo the last undone operation.

```typescript
const operation = undoManager.redo()
if (operation) {
  // Reapply the operation
  console.log('Redid:', operation)
}
```

#### `canUndo(): boolean`

Check if undo is possible.

```typescript
if (undoManager.canUndo()) {
  undoManager.undo()
}
```

#### `canRedo(): boolean`

Check if redo is possible.

```typescript
if (undoManager.canRedo()) {
  undoManager.redo()
}
```

#### `clear(): void`

Clear all undo/redo history.

```typescript
undoManager.clear()
```

#### `getState(): UndoManagerState`

Get the current state.

```typescript
const state = undoManager.getState()
console.log({
  undoStack: state.undoStack,
  redoStack: state.redoStack,
  canUndo: state.canUndo,
  canRedo: state.canRedo
})
```

#### `destroy(): void`

Clean up resources.

```typescript
undoManager.destroy()
```

### Operation Interface

```typescript
interface Operation {
  type: string              // Operation type (e.g., 'insert', 'delete')
  data?: any               // Operation data
  timestamp?: number       // Unix timestamp in milliseconds
  userId?: string          // User who performed the operation
  mergeWindow?: number     // Custom merge window for this operation
}
```

## Framework Adapters

### React

```tsx
import { useUndo } from '@synckit-js/sdk/react'

function Editor() {
  const { canUndo, canRedo, undo, redo, add, undoStack, redoStack } = useUndo('doc-123', {
    mergeWindow: 1000,
    maxUndoSize: 100,
    onStateChanged: (state) => {
      console.log('State changed:', state)
    }
  })

  const handleInsert = (text: string) => {
    add({ type: 'insert', data: text })
  }

  return (
    <div>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
      <div>Undo stack: {undoStack.length}</div>
    </div>
  )
}
```

### Vue

```vue
<script setup lang="ts">
import { useUndo } from '@synckit-js/sdk/vue'

const { canUndo, canRedo, undo, redo, add, undoStack, redoStack } = useUndo('doc-123', {
  mergeWindow: 1000,
  maxUndoSize: 100,
  onStateChanged: (state) => {
    console.log('State changed:', state)
  }
})

const handleInsert = (text: string) => {
  add({ type: 'insert', data: text })
}
</script>

<template>
  <div>
    <button @click="undo" :disabled="!canUndo">Undo</button>
    <button @click="redo" :disabled="!canRedo">Redo</button>
    <div>Undo stack: {{ undoStack.length }}</div>
  </div>
</template>
```

### Svelte

```svelte
<script>
  import { undo } from '@synckit-js/sdk/svelte'

  const undoStore = undo('doc-123', {
    mergeWindow: 1000,
    maxUndoSize: 100,
    onStateChanged: (state) => {
      console.log('State changed:', state)
    }
  })

  function handleInsert(text) {
    undoStore.add({ type: 'insert', data: text })
  }
</script>

<!-- Svelte 4 syntax -->
<button on:click={undoStore.undo} disabled={!$undoStore.canUndo}>Undo</button>
<button on:click={undoStore.redo} disabled={!$undoStore.canRedo}>Redo</button>
<div>Undo stack: {$undoStore.undoStack.length}</div>

<!-- Svelte 5 syntax -->
<button onclick={undoStore.undo} disabled={!undoStore.canUndo}>Undo</button>
<button onclick={undoStore.redo} disabled={!undoStore.canRedo}>Redo</button>
<div>Undo stack: {undoStore.undoStack.length}</div>
```

## Operation Merging

Operations are automatically merged when they meet these criteria:

1. **Same Type** - Both operations have the same `type`
2. **Same User** - Both operations have the same `userId` (or both undefined)
3. **Within Time Window** - Time difference ≤ `mergeWindow` milliseconds

### Default Merge Behavior

- **Strings**: Concatenate (`'hello' + ' world' = 'hello world'`)
- **Numbers**: Sum (`5 + 3 = 8`)
- **Arrays**: Concatenate (`['a', 'b'] + ['c'] = ['a', 'b', 'c']`)
- **Objects**: Replace with latest (`{ x: 1 } + { y: 2 } = { y: 2 }`)

### Custom Merge Strategy

```typescript
const undoManager = new UndoManager({
  documentId: 'doc-123',
  crossTabSync,

  // Custom predicate: only merge if both have 'mergeable' flag
  canMerge: (prev, next) => {
    return prev.data?.mergeable === true && next.data?.mergeable === true
  },

  // Custom merge: combine counts
  merge: (prev, next) => ({
    type: prev.type,
    data: {
      count: (prev.data?.count ?? 0) + (next.data?.count ?? 0)
    },
    timestamp: prev.timestamp,
    userId: prev.userId
  })
})
```

### Disabling Merge for Specific Operations

```typescript
// This operation won't merge with others
undoManager.add({
  type: 'insert',
  data: 'important change',
  mergeWindow: 0  // Disable merging
})
```

## Cross-Tab Synchronization

Undo/redo state automatically syncs across browser tabs using BroadcastChannel.

### How It Works

1. **Leader Election** - One tab becomes the leader using heartbeat mechanism
2. **Coordinated Writes** - Only the leader writes to IndexedDB
3. **State Broadcasting** - State changes broadcast to all tabs
4. **Automatic Failover** - If leader closes, another tab takes over

### Disabling Cross-Tab Sync

```typescript
// React
const { ... } = useUndo('doc-123', {
  enableCrossTab: false
})

// Vue
const { ... } = useUndo('doc-123', {
  enableCrossTab: false
})

// Svelte
const undoStore = undo('doc-123', {
  enableCrossTab: false
})
```

### Cross-Tab Caveats

- **Same Origin Only** - BroadcastChannel requires same origin (protocol + domain + port)
- **Browser Support** - Modern browsers only (Chrome 54+, Firefox 38+, Edge 79+)
- **Memory Usage** - Each tab maintains its own state copy for responsiveness

## Examples

### Text Editor with Undo/Redo

```typescript
import { useUndo } from '@synckit-js/sdk/react'

function TextEditor() {
  const [text, setText] = useState('')
  const { undo, redo, add } = useUndo('editor-doc')

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
    if (op?.data) {
      setText(op.data.from)
    }
  }

  const handleRedo = () => {
    const op = redo()
    if (op?.data) {
      setText(op.data.to)
    }
  }

  return (
    <div>
      <button onClick={handleUndo}>Undo</button>
      <button onClick={handleRedo}>Redo</button>
      <textarea value={text} onChange={e => handleChange(e.target.value)} />
    </div>
  )
}
```

### Custom Operation Types

```typescript
type DrawOperation =
  | { type: 'line', data: { from: Point, to: Point } }
  | { type: 'circle', data: { center: Point, radius: number } }
  | { type: 'clear', data: null }

const { undo, redo, add } = useUndo<DrawOperation>('canvas-doc')

// Add operations
add({ type: 'line', data: { from: {x: 0, y: 0}, to: {x: 100, y: 100} } })
add({ type: 'circle', data: { center: {x: 50, y: 50}, radius: 25 } })

// Undo/redo
const operation = undo()
if (operation?.type === 'line') {
  // Remove line from canvas
} else if (operation?.type === 'circle') {
  // Remove circle from canvas
}
```

### Keyboard Shortcuts

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      redo()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [undo, redo])
```

## Best Practices

1. **Operation Granularity** - Use appropriate merge windows for different operation types
   - Typing: 1000ms (default)
   - Drawing: 500ms for smoother strokes
   - Structural changes: 0ms (no merging)

2. **Memory Management** - Set reasonable `maxUndoSize` based on operation size
   - Text operations: 100-500 operations
   - Large data operations: 20-50 operations

3. **User Identification** - Include `userId` for collaborative scenarios
   ```typescript
   add({
     type: 'edit',
     data: changes,
     userId: currentUser.id
   })
   ```

4. **Error Handling** - Always check return values
   ```typescript
   const operation = undo()
   if (!operation) {
     console.warn('Nothing to undo')
     return
   }
   ```

5. **Cleanup** - Destroy manager when component unmounts (framework adapters handle this automatically)
   ```typescript
   useEffect(() => {
     return () => undoManager.destroy()
   }, [])
   ```
