# Migrating from v0.1.0 to v0.2.0

**Upgrading to production-ready collaborative features**

SyncKit v0.2.0 is a major release that adds text editing, rich formatting, undo/redo, presence, cursors, and framework adapters. This guide walks you through upgrading from v0.1.0.

---

## Table of Contents

1. [What's New in v0.2.0](#whats-new-in-v020)
2. [Breaking Changes](#breaking-changes)
3. [Bundle Size Changes](#bundle-size-changes)
4. [Migration Steps](#migration-steps)
5. [New Features You Can Use](#new-features-you-can-use)
6. [Code Examples](#code-examples)
7. [Troubleshooting](#troubleshooting)

---

## What's New in v0.2.0

### New Features

**Collaborative Text Editing:**
- ✅ `SyncText` - Plain text collaboration with Fugue CRDT
- ✅ `RichText` - Rich text with Peritext formatting
- ✅ `QuillBinding` - Production-ready Quill editor integration

**Undo/Redo:**
- ✅ `UndoManager` - Cross-tab undo/redo that persists across sessions
- ✅ Works with documents, text, and rich text

**Presence & Awareness:**
- ✅ `Awareness` - Real-time user presence tracking
- ✅ Cursor and selection sharing
- ✅ XPath-based cursor serialization

**Additional CRDTs:**
- ✅ `SyncCounter` - Distributed counter (PN-Counter)
- ✅ `SyncSet` - Conflict-free set (OR-Set)

**Framework Adapters:**
- ✅ React hooks: `useSyncText`, `useSyncRichText`, `useCounter`, `useSet`, `useUndoRedo`, `usePresence`, `useCursor`
- ✅ Vue 3 composables: Complete Composition API support
- ✅ Svelte 5 stores: Full runes integration

### What Stayed the Same

**Core features from v0.1.0 are unchanged:**
- ✅ `SyncDocument` API - Same methods, same behavior
- ✅ `useSyncDocument` hook - Works exactly the same
- ✅ IndexedDB & Memory storage - Same configuration
- ✅ Network sync - Same WebSocket protocol
- ✅ Offline queue - Same persistence

**Your v0.1.0 code will continue to work.**

---

## Breaking Changes

### 1. Bundle Size Increase

**v0.1.0:** 59KB (basic sync only)
**v0.2.0:** 154KB (complete collaboration platform)

**Why:** v0.2.0 includes text CRDTs, rich text formatting, undo/redo, presence, and framework adapters. These features required adding ~95KB.

**Migration:** If you need v0.1.0 size, use the Lite variant:

```typescript
// v0.2.0 Lite - Same 46KB as v0.1.0
import { SyncKit } from '@synckit-js/sdk/lite'
```

The Lite variant includes only document sync (same as v0.1.0) with a tiny size increase (45KB → 46KB).

### 2. Package Exports Structure

**v0.1.0:**
```typescript
import { SyncKit, SyncDocument } from '@synckit-js/sdk'
import { useSyncDocument } from '@synckit-js/sdk/react'
```

**v0.2.0:**
```typescript
// Core (unchanged)
import { SyncKit, SyncDocument } from '@synckit-js/sdk'

// New exports (won't break existing imports)
import { SyncText, RichText, SyncCounter, SyncSet } from '@synckit-js/sdk'
import { UndoManager, Awareness } from '@synckit-js/sdk'
import { QuillBinding } from '@synckit-js/sdk/integrations/quill'

// React (unchanged, but new hooks available)
import { useSyncDocument } from '@synckit-js/sdk/react'
import { useSyncText, useCounter, useSet } from '@synckit-js/sdk/react'

// Vue (new in v0.2.0)
import { useDocument, useText, useCounter } from '@synckit-js/sdk/vue'

// Svelte (new in v0.2.0)
import { documentStore, textStore, counterStore } from '@synckit-js/sdk/svelte'
```

**Migration:** No changes needed. New exports are additive.

### 3. Configuration Options

**v0.1.0:**
```typescript
const sync = new SyncKit({
  storage: 'indexeddb',  // ✅ Still works
  name: 'my-app',        // ✅ Still works
  serverUrl: '...',      // ✅ Still works
  clientId: '...'        // ✅ Still works
})
```

**v0.2.0:**
```typescript
const sync = new SyncKit({
  storage: 'indexeddb',  // ✅ Same
  name: 'my-app',        // ✅ Same
  serverUrl: '...',      // ✅ Same
  clientId: '...',       // ✅ Same
  network: {             // ✅ New (optional)
    reconnect: { /* ... */ },
    heartbeat: { /* ... */ },
    queue: { /* ... */ }
  }
})
```

**Migration:** No changes needed. The `network` config is optional.

### 4. TypeScript Types

**v0.1.0:**
```typescript
import type { SyncKitConfig, DocumentData } from '@synckit-js/sdk'
```

**v0.2.0:**
```typescript
// Old types (still available)
import type { SyncKitConfig, DocumentData } from '@synckit-js/sdk'

// New types (additive)
import type {
  FormatAttributes,
  FormatRange,
  NetworkConfig
} from '@synckit-js/sdk'
```

**Migration:** No changes needed. All v0.1.0 types still exist.

---

## Bundle Size Changes

### Understanding the Increase

**v0.1.0 (59KB):**
- Core SDK: 13KB
- WASM (LWW CRDT): 46KB

**v0.2.0 Default (154KB):**
- Core SDK: 13KB
- WASM Base (LWW): 46KB
- Text CRDT (Fugue): 50-70KB
- Rich Text (Peritext): 30KB
- Undo/Redo: 15KB
- Awareness + Cursors: 20KB

**The 95KB difference gives you:**
- Collaborative text editing that handles conflicts correctly
- Rich text formatting (bold, italic, links, colors)
- Cross-tab undo/redo
- Real-time presence and cursor sharing
- Counter and Set CRDTs
- Framework adapters for React, Vue, Svelte

### Size Optimization Options

**Option 1: Use Lite Variant (46KB)**

Same size as v0.1.0, same features:

```typescript
import { SyncKit } from '@synckit-js/sdk/lite'

// Works exactly like v0.1.0
const sync = new SyncKit({ storage: 'indexeddb' })
await sync.init()

const todo = sync.document<Todo>('todo-1')
await todo.update({ completed: true })
```

**Option 2: Dynamic Import (Code Splitting)**

Load features only when needed:

```typescript
// Main app - Core only (46KB)
import { SyncKit, SyncDocument } from '@synckit-js/sdk'

// Editor page - Load text features on demand
const loadEditor = async () => {
  const { SyncText, RichText } = await import('@synckit-js/sdk')
  const { QuillBinding } = await import('@synckit-js/sdk/integrations/quill')
  return { SyncText, RichText, QuillBinding }
}
```

**Option 3: Tree-Shaking**

Import only what you use:

```typescript
// ❌ Imports everything (154KB)
import * as SyncKit from '@synckit-js/sdk'

// ✅ Import specific features (tree-shakes unused code)
import { SyncKit, SyncDocument, SyncText } from '@synckit-js/sdk'
```

---

## Migration Steps

### Step 1: Update Package

```bash
npm install @synckit-js/sdk@^0.2.0
```

### Step 2: Test Existing Code

Your v0.1.0 code should work without changes:

```typescript
// v0.1.0 code - Still works in v0.2.0
const sync = new SyncKit({ storage: 'indexeddb' })
await sync.init()

const todo = sync.document<Todo>('todo-1')
todo.subscribe((data) => console.log(data))
await todo.update({ completed: true })
```

Run your tests to verify everything works.

### Step 3: Choose Bundle Strategy

**If bundle size is critical:**
```typescript
// Use Lite variant (46KB)
import { SyncKit } from '@synckit-js/sdk/lite'
```

**If you want new features:**
```typescript
// Use Default variant (154KB)
import { SyncKit } from '@synckit-js/sdk'
```

### Step 4: Add New Features (Optional)

Now you can use v0.2.0 features if needed.

---

## New Features You Can Use

### 1. Add Text Editing

**Before (v0.1.0) - Document-level sync:**
```typescript
const note = sync.document<Note>('note-1')
await note.update({ content: 'Hello World' })
```

**After (v0.2.0) - Character-level sync:**
```typescript
const text = sync.text('note-1')

// Collaborative editing at character level
await text.insert(0, 'Hello ')
await text.insert(6, 'World')

// Subscribe to changes
text.subscribe((content) => {
  editor.setValue(content)
})
```

**Why upgrade:** Multiple users can edit the same text simultaneously without conflicts.

---

### 2. Add Rich Text

**Before (v0.1.0) - No formatting:**
```typescript
const doc = sync.document<{ html: string }>('doc-1')
await doc.update({ html: '<b>Hello</b>' })
```

**After (v0.2.0) - Proper rich text:**
```typescript
import { QuillBinding } from '@synckit-js/sdk/integrations/quill'

const richText = sync.richText('doc-1')

// Bind to Quill editor
const quill = new Quill('#editor')
const binding = new QuillBinding(richText, quill)

// Formatting handled automatically
await richText.format(0, 5, { bold: true })
```

**Why upgrade:** Formatting conflicts are resolved correctly (Peritext algorithm).

---

### 3. Add Undo/Redo

**Before (v0.1.0) - Manual undo stack:**
```typescript
const history: Todo[] = []

function updateTodo(updates: Partial<Todo>) {
  history.push(todo.get())
  todo.update(updates)
}

function undo() {
  if (history.length > 0) {
    const previous = history.pop()
    todo.update(previous)
  }
}
```

**After (v0.2.0) - Built-in undo:**
```typescript
import { UndoManager } from '@synckit-js/sdk'

const undoManager = new UndoManager(sync, 'todo-1')

// Make changes
await todo.update({ completed: true })
await todo.update({ text: 'New text' })

// Undo/redo
await undoManager.undo()  // Reverts "New text"
await undoManager.redo()  // Re-applies "New text"
```

**Why upgrade:** Undo/redo syncs across tabs and persists across sessions.

---

### 4. Add Presence

**Before (v0.1.0) - Manual presence tracking:**
```typescript
const presence = sync.document<Presence>('presence')
setInterval(() => {
  presence.update({
    users: {
      ...presence.get().users,
      [userId]: { name: 'Alice', lastSeen: Date.now() }
    }
  })
}, 5000)
```

**After (v0.2.0) - Built-in awareness:**
```typescript
import { Awareness } from '@synckit-js/sdk'

const awareness = new Awareness(sync)

// Update your presence
awareness.setLocalState({
  user: { name: 'Alice', color: '#ff0000' }
})

// Subscribe to others
awareness.on('change', ({ added, updated, removed }) => {
  console.log('Users online:', awareness.getStates())
})
```

**Why upgrade:** Automatic cleanup, efficient updates, and presence protocol built-in.

---

### 5. Add Counters

**Before (v0.1.0) - Document field:**
```typescript
const post = sync.document<{ likes: number }>('post-1')

// Problem: Concurrent increments conflict
await post.update({ likes: (post.get().likes || 0) + 1 })
```

**After (v0.2.0) - Counter CRDT:**
```typescript
const likes = sync.counter('likes-post-1')

// No conflicts, even with concurrent increments
await likes.increment()

likes.subscribe((count) => {
  console.log('Likes:', count)
})
```

**Why upgrade:** Counters handle concurrent increments without conflicts.

---

### 6. Add Sets

**Before (v0.1.0) - Array in document:**
```typescript
const doc = sync.document<{ tags: string[] }>('post-1')

// Problem: Concurrent adds/removes conflict
const tags = doc.get().tags || []
await doc.update({ tags: [...tags, 'new-tag'] })
```

**After (v0.2.0) - Set CRDT:**
```typescript
const tags = sync.set<string>('tags-post-1')

// No conflicts, even with concurrent add/remove
await tags.add('important')
await tags.remove('old-tag')

tags.subscribe((items) => {
  console.log('Tags:', Array.from(items))
})
```

**Why upgrade:** Sets handle concurrent operations without conflicts.

---

### 7. Add Framework Adapters

**Before (v0.1.0) - Manual React integration:**
```typescript
function TodoComponent({ id }: { id: string }) {
  const [todo, setTodo] = useState<Todo | null>(null)

  useEffect(() => {
    const doc = sync.document<Todo>(id)
    const unsubscribe = doc.subscribe((data) => setTodo(data))
    return unsubscribe
  }, [id])

  const update = (updates: Partial<Todo>) => {
    sync.document<Todo>(id).update(updates)
  }

  return <div>{todo?.text}</div>
}
```

**After (v0.2.0) - Hook:**
```typescript
import { useSyncDocument } from '@synckit-js/sdk/react'

function TodoComponent({ id }: { id: string }) {
  const [todo, { update }] = useSyncDocument<Todo>(id)

  return <div>{todo.text}</div>
}
```

**Vue (new in v0.2.0):**
```vue
<script setup lang="ts">
import { useDocument } from '@synckit-js/sdk/vue'

const { data: todo, update } = useDocument<Todo>('todo-1')
</script>

<template>
  <div>{{ todo.text }}</div>
</template>
```

**Svelte (new in v0.2.0):**
```svelte
<script lang="ts">
  import { documentStore } from '@synckit-js/sdk/svelte'

  const todo = documentStore<Todo>('todo-1')
</script>

<div>{$todo.text}</div>
```

**Why upgrade:** Less boilerplate, automatic cleanup, better TypeScript support.

---

## Code Examples

### Example 1: Gradual Migration

Keep using v0.1.0 features, add v0.2.0 features incrementally:

```typescript
// Keep existing document sync (v0.1.0)
const todo = sync.document<Todo>('todo-1')
await todo.update({ completed: true })

// Add new text editing (v0.2.0) to a different feature
const noteText = sync.text('note-1')
await noteText.insert(0, 'New feature with text sync')

// Add undo only where needed (v0.2.0)
const undoManager = new UndoManager(sync, 'todo-1')
```

No need to migrate everything at once.

---

### Example 2: Using Lite Variant

If you don't need new features:

```typescript
// Switch to Lite - Same behavior as v0.1.0
import { SyncKit } from '@synckit-js/sdk/lite'

const sync = new SyncKit({ storage: 'indexeddb' })
await sync.init()

// All your v0.1.0 code works exactly the same
const todo = sync.document<Todo>('todo-1')
await todo.update({ completed: true })
```

Bundle size: 46KB (only 1KB larger than v0.1.0's 45KB).

---

### Example 3: Code Splitting

Load features on demand:

```typescript
// main.ts - Core app (46KB)
import { SyncKit, SyncDocument } from '@synckit-js/sdk'

const sync = new SyncKit({ storage: 'indexeddb' })
await sync.init()

// Regular document sync
const settings = sync.document<Settings>('settings')

// routes.ts - Load rich text editor lazily
export const routes = [
  {
    path: '/edit',
    component: () => import('./EditorPage.vue')  // Loads rich text features
  }
]

// EditorPage.vue - Loaded on demand (~80KB additional)
import { RichText } from '@synckit-js/sdk'
import { QuillBinding } from '@synckit-js/sdk/integrations/quill'

const richText = sync.richText('document')
const quill = new Quill('#editor')
const binding = new QuillBinding(richText, quill)
```

Main bundle: 46KB. Editor page: +80KB (loaded when needed).

---

## Troubleshooting

### Issue 1: Bundle Size Too Large

**Problem:** v0.2.0 bundle is 154KB, too large for my app.

**Solution 1:** Use Lite variant (46KB)
```typescript
import { SyncKit } from '@synckit-js/sdk/lite'
```

**Solution 2:** Dynamic imports
```typescript
const { SyncText } = await import('@synckit-js/sdk')
```

**Solution 3:** Use v0.1.0 until you need v0.2.0 features
```bash
npm install @synckit-js/sdk@^0.1.0
```

---

### Issue 2: TypeScript Errors After Upgrade

**Problem:** TypeScript complains about missing types.

**Solution:** Update TypeScript imports:
```typescript
// Add new types
import type {
  SyncKitConfig,
  DocumentData,
  FormatAttributes,  // New in v0.2.0
  NetworkConfig      // New in v0.2.0
} from '@synckit-js/sdk'
```

---

### Issue 3: Existing Code Breaks

**Problem:** v0.1.0 code doesn't work after upgrading.

**Solution:** Check that you're importing from the right package:

```typescript
// ✅ Correct - Default export
import { SyncKit } from '@synckit-js/sdk'

// ❌ Wrong - Lite export in default import
import { SyncKit } from '@synckit-js/sdk/lite'
```

If you used Lite accidentally, switch to default or keep using Lite (same API).

---

### Issue 4: Performance Regression

**Problem:** App feels slower after upgrading to v0.2.0.

**Diagnosis:**
1. Check bundle size - did it increase significantly?
2. Check if tree-shaking is working
3. Check if you're using dynamic imports

**Solution:** Ensure proper tree-shaking:

```typescript
// ❌ Imports everything
import * as SyncKit from '@synckit-js/sdk'

// ✅ Import specific exports
import { SyncKit, SyncDocument } from '@synckit-js/sdk'
```

---

### Issue 5: New Features Don't Work

**Problem:** Trying to use `SyncText` but it's undefined.

**Solution:** Check package version:
```bash
npm list @synckit-js/sdk
# Should show: @synckit-js/sdk@0.2.0 or higher
```

If showing v0.1.0, update:
```bash
npm install @synckit-js/sdk@^0.2.0
```

---

## Summary

**What Changed:**
- ✅ Bundle size: 59KB → 154KB (or use Lite: 46KB)
- ✅ New features: Text, Rich Text, Undo/Redo, Presence, Cursors, Counter, Set
- ✅ New framework adapters: Vue 3, Svelte 5

**What Stayed the Same:**
- ✅ `SyncDocument` API - No breaking changes
- ✅ Configuration - All v0.1.0 options still work
- ✅ Storage & sync - Same behavior
- ✅ TypeScript types - All v0.1.0 types still available

**Migration Strategies:**
1. **Keep v0.1.0:** Use Lite variant (46KB), same features
2. **Gradual migration:** Use v0.2.0, add features incrementally
3. **Full upgrade:** Use all v0.2.0 features immediately

**Typical Timeline:**
- Small app: 1-2 hours (just update package)
- Medium app: 1 day (test + add some new features)
- Large app: 1 week (gradual migration + testing)

**Next Steps:**
- [SDK API Documentation](../api/SDK_API.md) - Complete v0.2.0 API reference
- [Rich Text Guide](./rich-text-editing.md) - Learn Peritext formatting
- [Undo/Redo Guide](./undo-redo.md) - Cross-tab undo implementation
- [Bundle Size Optimization](./bundle-size-optimization.md) - Reduce bundle size

---

**Questions? Issues?** Check our [GitHub Issues](https://github.com/synckit-js/synckit/issues) or [Documentation](../README.md).
