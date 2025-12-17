# Undo/Redo with SyncKit

**Build apps where undo syncs across tabs and survives browser restarts.**

SyncKit's undo system is unique: press Ctrl+Z in one tab, see the change in another. Close the browser, reopen, and your undo history is still there. It works with any CRDT operation - text edits, rich text formatting, counter increments, everything.

---

## What Makes This Different

Most undo implementations are local-only and memory-based. SyncKit's undo is:

**Cross-tab synchronized** - Undo in tab A, see it in tab B
**Persistent** - History survives browser restarts (stored in IndexedDB)
**CRDT-aware** - Works with text operations, format operations, counters, etc.
**Operation merging** - Typing "hello" creates one undo step, not five

This is what makes collaborative editing feel natural. Users expect undo to work everywhere, and it does.

---

## Quick Start

### React

```typescript
import { useSyncKit, useUndo } from '@synckit-js/sdk/react'

function EditorWithUndo() {
  const { text } = useSyncKit()
  const [content, textActions] = text('doc-123')
  const { canUndo, canRedo, undo, redo, add } = useUndo('doc-123')

  // Track text operations
  const handleInsert = async (pos: number, text: string) => {
    await textActions.insert(pos, text)
    add({ type: 'text-insert', data: { pos, text } })
  }

  return (
    <div>
      <div>
        <button onClick={undo} disabled={!canUndo}>
          Undo (Ctrl+Z)
        </button>
        <button onClick={redo} disabled={!canRedo}>
          Redo (Ctrl+Y)
        </button>
      </div>

      {/* Note: Simplified append-only example for demo.
          For production cursor-based editing, see the Collaborative Editor example. */}
      <textarea value={content} onChange={(e) => {
        handleInsert(content.length, e.target.value.slice(content.length))
      }} />
    </div>
  )
}
```

### Vue 3

```vue
<script setup lang="ts">
import { useSyncKit, useUndo } from '@synckit-js/sdk/vue'
import { ref, onMounted, onUnmounted } from 'vue'

// Note: Vue adapter does not include useText - use vanilla SDK
const synckit = useSyncKit()
const text = ref('')

let textInstance: SyncText
let unsubscribe: (() => void) | null = null

onMounted(() => {
  textInstance = synckit.text('doc-123')
  unsubscribe = textInstance.subscribe((value) => {
    text.value = value
  })
})

onUnmounted(() => {
  unsubscribe?.()
})

const insert = (pos: number, content: string) => textInstance.insert(pos, content)
const deleteText = (start: number, length: number) => textInstance.delete(start, length)

const { canUndo, canRedo, undo, redo, add } = useUndo('doc-123')

async function handleInput(value: string) {
  const diff = value.length - text.value.length
  if (diff > 0) {
    const newText = value.slice(-diff)
    await insert(text.value.length, newText)
    add({ type: 'text-insert', data: { pos: text.value.length, text: newText } })
  }
}

// Keyboard shortcuts
function onKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault()
    if (e.shiftKey) {
      redo()
    } else {
      undo()
    }
  }
}
</script>

<template>
  <div>
    <div class="toolbar">
      <button @click="undo" :disabled="!canUndo">
        Undo
      </button>
      <button @click="redo" :disabled="!canRedo">
        Redo
      </button>
    </div>

    <textarea
      :value="text"
      @input="handleInput($event.target.value)"
      @keydown="onKeyDown"
    />
  </div>
</template>
```

### Svelte 5

```svelte
<script lang="ts">
import { text, undo } from '@synckit-js/sdk/svelte'

const doc = text('doc-123')
const undoManager = undo('doc-123')

const { text: content, insert } = doc
const { canUndo, canRedo, undo: doUndo, redo: doRedo, add } = undoManager

async function handleInsert(pos: number, text: string) {
  await insert(pos, text)
  add({ type: 'text-insert', data: { pos, text } })
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault()
    e.shiftKey ? doRedo() : doUndo()
  }
}
</script>

<div>
  <div class="toolbar">
    <button onclick={doUndo} disabled={!$canUndo}>
      Undo
    </button>
    <button onclick={doRedo} disabled={!$canRedo}>
      Redo
    </button>
  </div>

  <textarea
    value={$content}
    onkeydown={onKeyDown}
  />
</div>
```

---

## Core Concepts

### Operations

Undo works by tracking **operations** - discrete actions that can be reversed:

```typescript
interface Operation {
  type: string        // Operation type ('text-insert', 'format', 'increment', etc.)
  data?: any          // Operation-specific data
  timestamp?: number  // When the operation was performed
  userId?: string     // Who performed it (optional)
  mergeWindow?: number // Time window for merging (optional)
}
```

Examples:

```typescript
// Text insertion
add({ type: 'text-insert', data: { pos: 5, text: 'hello' } })

// Rich text formatting
add({ type: 'format', data: { start: 0, end: 5, attrs: { bold: true } } })

// Counter increment
add({ type: 'counter-increment', data: { amount: 1 } })

// Document field update
add({ type: 'field-update', data: { field: 'title', oldValue: 'Draft', newValue: 'Final' } })
```

### Undo/Redo Stacks

UndoManager maintains two stacks:

**Undo stack:** Operations that can be undone (most recent first)
**Redo stack:** Operations that were undone and can be redone

```
User types "hello"
Undo stack: [insert("hello")]
Redo stack: []

User hits Ctrl+Z
Undo stack: []
Redo stack: [insert("hello")]

User hits Ctrl+Y
Undo stack: [insert("hello")]
Redo stack: []
```

### Operation Merging

Consecutive similar operations merge automatically:

```typescript
// User types "h", "e", "l", "l", "o" rapidly
add({ type: 'text-insert', data: { text: 'h' }, timestamp: 1000 })
add({ type: 'text-insert', data: { text: 'e' }, timestamp: 1050 })
add({ type: 'text-insert', data: { text: 'l' }, timestamp: 1100 })
add({ type: 'text-insert', data: { text: 'l' }, timestamp: 1150 })
add({ type: 'text-insert', data: { text: 'o' }, timestamp: 1200 })

// Result: ONE undo step (not five)
// Undo stack: [insert("hello")]
```

**Merge window:** Operations merge if they occur within 1 second (default, configurable).

**Why merging matters:** Without it, undoing "hello" would require five Ctrl+Z presses. With merging, one press deletes the whole word.

---

## API Reference

### `useUndo(documentId, options?)`

Create an undo manager for a document.

**Parameters:**
- `documentId` (string | Ref<string>): Document identifier
- `options` (object, optional):
  - `maxUndoSize` (number): Max undo stack size (default: 100)
  - `mergeWindow` (number): Time window for merging in ms (default: 1000)
  - `canMerge` (function): Custom merge logic
  - `merge` (function): Custom merge implementation
  - `enableCrossTab` (boolean): Enable cross-tab sync (default: true)

**Returns:**
- `undoStack` (Ref<Operation[]>): Current undo stack (read-only)
- `redoStack` (Ref<Operation[]>): Current redo stack (read-only)
- `canUndo` (Ref<boolean>): Whether undo is possible
- `canRedo` (Ref<boolean>): Whether redo is possible
- `undo()` (function): Undo last operation
- `redo()` (function): Redo last undone operation
- `add(operation)` (function): Add operation to undo stack
- `clear()` (function): Clear all undo/redo history

### Methods

#### `add(operation)`

Add an operation to the undo stack.

```typescript
add({
  type: 'text-insert',
  data: { pos: 5, text: 'hello' }
})
```

**When to call:**
- After performing any user action that should be undoable
- BEFORE making the actual change (so you can capture the inverse)

**Automatic merging:**
- If the new operation can merge with the last one, they combine into one undo step
- Merge logic is customizable (see Custom Merge Logic below)

#### `undo()`

Undo the most recent operation.

```typescript
const operation = undo()
// Returns: { type: 'text-insert', data: { pos: 5, text: 'hello' } }
//          or null if nothing to undo
```

**What happens:**
1. Pops operation from undo stack
2. Pushes it to redo stack
3. Broadcasts to other tabs via BroadcastChannel
4. Persists updated state to IndexedDB
5. Returns the operation (so you can invert it)

**Cross-tab:**
- All open tabs undo simultaneously
- Undo history stays in sync

#### `redo()`

Redo the most recently undone operation.

```typescript
const operation = redo()
// Returns: { type: 'text-insert', data: { pos: 5, text: 'hello' } }
//          or null if nothing to redo
```

**Redo stack clears when:**
- User makes a new edit after undoing
- This is standard undo/redo behavior (you can't redo after branching history)

#### `clear()`

Clear all undo/redo history.

```typescript
clear()
// Undo stack: []
// Redo stack: []
```

**Use cases:**
- After saving a document (reset undo history)
- When switching to a different document
- On explicit user request

---

## Integration with CRDTs

### Text + Undo

Track text operations:

```typescript
const [text, textActions] = useSyncText('doc-123')
const { undo, redo, add } = useUndo('doc-123')

// Insert text
async function insert(pos: number, content: string) {
  // Capture inverse operation FIRST
  add({
    type: 'text-delete',
    data: { pos, length: content.length }
  })

  // Perform the operation
  await textActions.insert(pos, content)
}

// Delete text
async function deleteText(pos: number, length: number) {
  // Capture inverse operation
  const deleted = text.slice(pos, pos + length)
  add({
    type: 'text-insert',
    data: { pos, text: deleted }
  })

  // Perform the operation
  await textActions.delete(pos, length)
}

// Undo handler
function handleUndo() {
  const operation = undo()
  if (!operation) return

  // Apply inverse operation
  if (operation.type === 'text-insert') {
    textActions.insert(operation.data.pos, operation.data.text)
  } else if (operation.type === 'text-delete') {
    textActions.delete(operation.data.pos, operation.data.length)
  }
}
```

### RichText + Undo

Track both text and format operations:

```typescript
const [ranges, richTextActions] = useRichText('doc-123')
const { undo, redo, add } = useUndo('doc-123')

// Format text
async function format(start: number, end: number, attrs: FormatAttributes) {
  // Capture current formats for undo
  const oldFormats = richTextActions.getFormats(start)

  add({
    type: 'format',
    data: { start, end, oldAttrs: oldFormats, newAttrs: attrs }
  })

  await richTextActions.format(start, end, attrs)
}

// Undo handler
function handleUndo() {
  const operation = undo()
  if (!operation) return

  if (operation.type === 'format') {
    // Restore old formatting
    const { start, end, oldAttrs } = operation.data
    richTextActions.format(start, end, oldAttrs)
  }
  // ... handle other operation types
}
```

### Counter + Undo

Track counter changes:

```typescript
const [count, counterActions] = useSyncCounter('likes-123')
const { undo, redo, add } = useUndo('likes-123')

async function increment(amount = 1) {
  add({
    type: 'counter-change',
    data: { amount: -amount }  // Inverse is decrement
  })

  await counterActions.increment(amount)
}

function handleUndo() {
  const operation = undo()
  if (!operation && operation.type === 'counter-change') {
    // Apply inverse (decrement)
    counterActions.increment(operation.data.amount)
  }
}
```

---

## Advanced Usage

### Custom Merge Logic

Control when operations merge:

```typescript
const { add } = useUndo('doc-123', {
  // Operations can merge if:
  canMerge: (prev, next) => {
    // Same operation type
    if (prev.type !== next.type) return false

    // Same user (if tracking)
    if (prev.userId && next.userId && prev.userId !== next.userId) return false

    // Within 2 second window
    const timeDiff = (next.timestamp || 0) - (prev.timestamp || 0)
    if (timeDiff > 2000) return false

    // Text insertion at consecutive positions
    if (prev.type === 'text-insert') {
      const prevEnd = prev.data.pos + prev.data.text.length
      return next.data.pos === prevEnd
    }

    return true
  },

  // How to merge operations
  merge: (prev, next) => {
    if (prev.type === 'text-insert') {
      return {
        ...prev,
        data: {
          pos: prev.data.pos,
          text: prev.data.text + next.data.text
        },
        timestamp: next.timestamp
      }
    }
    return next
  }
})
```

### Undo Grouping

Group multiple operations into one undo step:

```typescript
const { add } = useUndo('doc-123')

async function applyTemplate(template: string) {
  // Group all template changes into ONE undo step
  const groupId = Date.now()

  // Insert title
  add({ type: 'group-start', data: { groupId } })
  await textActions.insert(0, template.title + '\n')
  add({ type: 'text-insert', data: { pos: 0, text: template.title + '\n' } })

  // Insert body
  await textActions.insert(template.title.length + 1, template.body)
  add({ type: 'text-insert', data: { pos: template.title.length + 1, text: template.body } })
  add({ type: 'group-end', data: { groupId } })

  // Now one Ctrl+Z undoes the entire template insertion
}
```

### Persistent History Limits

Configure history size and persistence:

```typescript
const { add } = useUndo('doc-123', {
  maxUndoSize: 50,  // Keep last 50 operations

  // Custom storage (default is IndexedDB)
  onStateChanged: (state) => {
    // Save to your backend
    api.saveUndoHistory(state)
  }
})
```

### Undo History UI

Show undo history to users:

```typescript
function UndoHistoryPanel() {
  const { undoStack, redoStack, undo } = useUndo('doc-123')

  return (
    <div className="undo-history">
      <h3>Undo History</h3>
      <ul>
        {undoStack.map((op, i) => (
          <li key={i} onClick={() => {
            // Undo to this point
            for (let j = 0; j <= i; j++) undo()
          }}>
            {op.type} - {new Date(op.timestamp || 0).toLocaleTimeString()}
          </li>
        ))}
      </ul>

      {redoStack.length > 0 && (
        <>
          <h3>Redo Stack</h3>
          <ul>
            {redoStack.map((op, i) => (
              <li key={i}>{op.type}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
```

---

## Cross-Tab Behavior

### How It Works

When you call `undo()` or `redo()`:

1. **Local execution:** Operation is undone/redone in the current tab
2. **BroadcastChannel message:** Other tabs receive the undo/redo command
3. **Remote execution:** Each tab undoes/redoes the same operation
4. **Persistence:** All tabs save updated state to IndexedDB

**Result:** Undo in tab A, see the change in tab B instantly.

### Synchronization Guarantees

- **Eventual consistency:** All tabs converge to the same undo state
- **Operation order:** Cross-tab messages preserve operation order
- **No conflicts:** BroadcastChannel delivers messages in order, preventing conflicts

### Testing Cross-Tab

```typescript
// Tab 1
const { add, undo } = useUndo('doc-123')
add({ type: 'insert', data: { text: 'hello' } })

// Tab 2 (open the same document)
const { undoStack } = useUndo('doc-123')
console.log(undoStack.value) // [{ type: 'insert', data: { text: 'hello' } }]

// Tab 1
undo()

// Tab 2 (undo happens automatically!)
console.log(undoStack.value) // []
```

---

## Troubleshooting

### Undo Not Working Across Tabs

**Problem:** Undo in tab A doesn't affect tab B.

**Solutions:**

1. **Check enableCrossTab:**
```typescript
const { undo } = useUndo('doc-123', {
  enableCrossTab: true  // ← Make sure this is true
})
```

2. **Verify same documentId:**
```typescript
// Tab 1
useUndo('doc-123')

// Tab 2
useUndo('doc-456')  // ❌ Different ID, won't sync

// Tab 2 (fixed)
useUndo('doc-123')  // ✅ Same ID, will sync
```

3. **Check BroadcastChannel support:**
```typescript
if (!('BroadcastChannel' in window)) {
  console.error('BroadcastChannel not supported (cross-tab undo unavailable)')
}
```

### Operations Not Merging

**Problem:** Each keystroke creates a separate undo step.

**Solution:** Check merge window:

```typescript
const { add } = useUndo('doc-123', {
  mergeWindow: 1000  // Operations within 1 second merge
})

// Type quickly (within 1 second)
add({ type: 'text-insert', data: { text: 'h' }, timestamp: 1000 })
add({ type: 'text-insert', data: { text: 'e' }, timestamp: 1100 })
// These merge ✅

// Type slowly (more than 1 second apart)
add({ type: 'text-insert', data: { text: 'h' }, timestamp: 1000 })
add({ type: 'text-insert', data: { text: 'e' }, timestamp: 3000 })
// These DON'T merge ❌ (separate undo steps)
```

### Undo History Lost After Refresh

**Problem:** Undo history disappears after browser refresh.

**Cause:** Persistence not initialized or failing.

**Debug:**

```typescript
// Check if history loads after refresh
const { undoStack } = useUndo('doc-123')

onMounted(async () => {
  await new Promise(resolve => setTimeout(resolve, 100))  // Wait for load
  console.log('Loaded undo history:', undoStack.value)

  if (undoStack.value.length === 0) {
    console.error('Undo history did not load from IndexedDB')
  }
})
```

**Solution:** Ensure UndoManager initialization completes:

```typescript
const undoManager = new UndoManager({ documentId: 'doc-123', crossTabSync })
await undoManager.init()  // ← Must call init!
```

---

## Best Practices

### 1. Track Inverse Operations

Always store the inverse operation for proper undo:

```typescript
// ✅ GOOD: Store inverse
async function deleteText(pos: number, length: number) {
  const deleted = text.slice(pos, pos + length)
  add({ type: 'text-insert', data: { pos, text: deleted } })  // Inverse!
  await textActions.delete(pos, length)
}

// ❌ BAD: Store the same operation
async function deleteText(pos: number, length: number) {
  add({ type: 'text-delete', data: { pos, length } })  // Can't undo this!
  await textActions.delete(pos, length)
}
```

### 2. Use Operation Types Consistently

Standardize operation types across your app:

```typescript
// ✅ GOOD: Consistent naming
add({ type: 'text-insert', ... })
add({ type: 'text-delete', ... })
add({ type: 'format-apply', ... })

// ❌ BAD: Inconsistent naming
add({ type: 'insert', ... })
add({ type: 'deleteText', ... })
add({ type: 'applyFormat', ... })
```

### 3. Merge Aggressively

Merge small operations (keystrokes) but not large ones (paste):

```typescript
canMerge: (prev, next) => {
  // Merge keystrokes
  if (prev.data?.text?.length === 1 && next.data?.text?.length === 1) {
    return true
  }

  // Don't merge paste operations
  if (next.data?.text?.length > 10) {
    return false
  }

  return prev.type === next.type
}
```

### 4. Clear History Strategically

Clear undo history after major state changes:

```typescript
// After saving
async function save() {
  await api.saveDocument(doc)
  clear()  // Start fresh undo history
}

// After loading new document
async function load(docId: string) {
  const doc = await api.loadDocument(docId)
  clear()  // Clear old document's history
}
```

---

## Next Steps

- **[Rich Text Editing](./rich-text-editing.md)** - Undo/redo with rich text formatting
- **[Cursor Sharing](./cursor-selection-sharing.md)** - See where teammates undo/redo
- **[API Reference](../api/SDK_API.md#undo-manager)** - Complete UndoManager API

---

## Summary

**What you learned:**
- Cross-tab undo/redo with BroadcastChannel
- Persistent undo history (survives browser restarts)
- Operation merging for natural undo behavior
- Integration with Text, RichText, and other CRDTs
- Custom merge logic and undo grouping

**Key takeaways:**
- SyncKit's undo is unique: cross-tab + persistent
- Always track inverse operations for proper undo
- Operation merging makes undo feel natural
- Works with any CRDT operation type

**Ready to build?** The [Collaborative Editor Example](../../examples/collaborative-editor/) shows undo/redo in action with rich text editing.
