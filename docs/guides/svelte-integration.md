# Svelte 5 Integration Guide

**Complete guide to SyncKit's Svelte 5 integration with runes**

Build reactive local-first apps with Svelte 5 stores that leverage runes for fine-grained reactivity and automatic subscription management.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Stores](#core-stores)
3. [Document Sync](#document-sync)
4. [Text Editing](#text-editing)
5. [Rich Text Editing](#rich-text-editing)
6. [Undo/Redo](#undoredo)
7. [Presence & Awareness](#presence--awareness)
8. [Live Cursors](#live-cursors)
9. [TypeScript Integration](#typescript-integration)
10. [Performance Optimization](#performance-optimization)
11. [Common Patterns](#common-patterns)
12. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Installation

```bash
npm install @synckit-js/sdk svelte@^5.0.0
```

### Basic Setup

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'

interface Todo extends Record<string, unknown> {
  title: string
  completed: boolean
}

const { data, set, loading, error } = syncDocument<Todo>('todo-1', {
  storage: 'indexeddb',
  name: 'my-app'
})
</script>

{#if $loading}
  <div>Loading...</div>
{:else if $error}
  <div>Error: {$error.message}</div>
{:else}
  <div>
    <input
      value={$data?.title}
      oninput={(e) => set('title', e.currentTarget.value)}
      placeholder="What needs to be done?"
    />
    <label>
      <input
        type="checkbox"
        checked={$data?.completed}
        onchange={(e) => set('completed', e.currentTarget.checked)}
      />
      Completed
    </label>
  </div>
{/if}
```

**What happens:**
- Document initializes automatically
- Updates sync to storage in real-time
- Cleanup handled automatically
- TypeScript types flow through `$data`

---

## Core Stores

### `syncKit()`

Root store for accessing SyncKit instance.

```svelte
<script lang="ts">
import { syncKit } from '@synckit-js/sdk/svelte'

const kit = syncKit({
  storage: 'indexeddb',
  name: 'my-app',
  server: 'https://sync.example.com'
})

// Access instance directly
console.log($kit.isOnline())
</script>
```

**Options:**
```typescript
interface SyncKitConfig {
  storage: 'memory' | 'indexeddb' | StorageAdapter
  name: string
  server?: string
  network?: NetworkConfig
}
```

**Returns:**
```typescript
Readable<SyncKit>
```

---

## Document Sync

### `syncDocument()`

Reactive document synchronization with automatic lifecycle management.

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'

interface UserProfile extends Record<string, unknown> {
  name: string
  email: string
  avatar: string
  bio: string
}

const { data, set, update, loading, error, syncState } = syncDocument<UserProfile>(
  'user-profile-alice',
  {
    storage: 'indexeddb',
    name: 'profiles-db'
  }
)

// Derived state using $derived rune
let displayName = $derived($data?.name || 'Anonymous')
let isComplete = $derived(
  !!($data?.name && $data?.email && $data?.bio)
)
</script>

<div class="profile-editor">
  {#if $loading}
    <div class="spinner">Loading profile...</div>
  {:else if $error}
    <div class="error">
      Failed to load profile: {$error.message}
    </div>
  {:else}
    <form onsubmit={(e) => e.preventDefault()}>
      <div class="field">
        <label>Name</label>
        <input
          value={$data?.name}
          oninput={(e) => set('name', e.currentTarget.value)}
        />
      </div>

      <div class="field">
        <label>Email</label>
        <input
          type="email"
          value={$data?.email}
          oninput={(e) => set('email', e.currentTarget.value)}
        />
      </div>

      <div class="field">
        <label>Avatar URL</label>
        <input
          value={$data?.avatar}
          oninput={(e) => set('avatar', e.currentTarget.value)}
        />
      </div>

      <div class="field">
        <label>Bio</label>
        <textarea
          value={$data?.bio}
          oninput={(e) => set('bio', e.currentTarget.value)}
          rows="4"
        />
      </div>

      <div class="status">
        {#if $syncState === 'synced'}
          <span class="badge success">✓ Saved</span>
        {:else if $syncState === 'syncing'}
          <span class="badge pending">↻ Syncing...</span>
        {:else if $syncState === 'error'}
          <span class="badge error">✗ Sync failed</span>
        {/if}
      </div>

      {#if !isComplete}
        <div class="warning">
          Please complete all required fields
        </div>
      {/if}
    </form>
  {/if}
</div>

<style>
  .profile-editor {
    max-width: 600px;
    margin: 0 auto;
    padding: 24px;
  }

  .field {
    margin-bottom: 16px;
  }

  label {
    display: block;
    margin-bottom: 4px;
    font-weight: 500;
  }

  input,
  textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .status {
    margin: 16px 0;
  }

  .badge {
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .badge.success {
    background: #E8F5E9;
    color: #2E7D32;
  }

  .badge.pending {
    background: #FFF3E0;
    color: #E65100;
  }

  .badge.error {
    background: #FFEBEE;
    color: #C62828;
  }

  .warning {
    padding: 12px;
    background: #FFF9C4;
    border-left: 4px solid #FBC02D;
    border-radius: 4px;
    font-size: 14px;
  }

  .spinner,
  .error {
    padding: 24px;
    text-align: center;
  }

  .error {
    color: #C62828;
  }
</style>
```

**API Reference:**

```typescript
function syncDocument<T extends DocumentData>(
  docId: string,
  config?: SyncKitConfig
): {
  data: Readable<T | null>
  set: <K extends keyof T>(field: K, value: T[K]) => Promise<void>
  update: (partial: Partial<T>) => Promise<void>
  loading: Readable<boolean>
  error: Readable<Error | null>
  syncState: Readable<'synced' | 'syncing' | 'error' | 'offline'>
}
```

**Features:**
- ✅ Automatic subscription lifecycle
- ✅ Type-safe field updates
- ✅ Loading and error states
- ✅ Sync status tracking
- ✅ Cleanup on component unmount

---

## Text Editing

### `syncText()`

Collaborative plain text editing with CRDT conflict resolution.

```svelte
<script lang="ts">
import { syncText } from '@synckit-js/sdk/svelte'
import { onMount } from 'svelte'

const { text, insert, delete: deleteText, loading } = syncText(
  'doc-123',
  {
    storage: 'indexeddb',
    name: 'editor-db'
  }
)

let textarea: HTMLTextAreaElement
let lastValue = ''

onMount(() => {
  lastValue = $text
})

// Handle local edits
function handleInput(event: Event) {
  const target = event.currentTarget as HTMLTextAreaElement
  const newValue = target.value
  const oldValue = lastValue

  // Find the diff
  let i = 0
  while (i < Math.min(oldValue.length, newValue.length) && oldValue[i] === newValue[i]) {
    i++
  }

  if (newValue.length < oldValue.length) {
    // Deletion
    const deleteLength = oldValue.length - newValue.length
    deleteText(i, deleteLength)
  } else if (newValue.length > oldValue.length) {
    // Insertion
    const inserted = newValue.slice(i, i + (newValue.length - oldValue.length))
    insert(i, inserted)
  }

  lastValue = newValue
}

// Preserve cursor position on remote updates
$effect(() => {
  if (textarea && document.activeElement !== textarea) {
    // Only update if not focused (remote change)
    textarea.value = $text
    lastValue = $text
  }
})
</script>

<div class="editor">
  {#if $loading}
    <div>Loading document...</div>
  {:else}
    <textarea
      bind:this={textarea}
      value={$text}
      oninput={handleInput}
      placeholder="Start typing..."
      rows="20"
    />
    <div class="char-count">{$text.length} characters</div>
  {/if}
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  textarea {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 14px;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    resize: vertical;
  }

  .char-count {
    font-size: 12px;
    color: #666;
    text-align: right;
  }
</style>
```

**API Reference:**

```typescript
function syncText(
  docId: string,
  config?: SyncKitConfig
): {
  text: Readable<string>
  insert: (pos: number, text: string) => Promise<void>
  delete: (pos: number, length: number) => Promise<void>
  loading: Readable<boolean>
  error: Readable<Error | null>
}
```

---

## Rich Text Editing

### `syncRichText()`

Rich text editing with Peritext formatting (bold, italic, links, custom attributes).

```svelte
<script lang="ts">
import { syncRichText } from '@synckit-js/sdk/svelte'
import type { FormatRange } from '@synckit-js/sdk'

const { ranges, insert, deleteText, format, loading } = syncRichText(
  'doc-rich-123',
  {
    storage: 'indexeddb',
    name: 'rich-editor'
  }
)

let editor: HTMLDivElement
let selectedRange: { start: number; end: number } | null = null

// Render formatted text
let formattedHTML = $derived.by(() => {
  let html = ''
  for (const range of $ranges) {
    let text = escapeHTML(range.text)

    if (range.attributes.bold) {
      text = `<strong>${text}</strong>`
    }
    if (range.attributes.italic) {
      text = `<em>${text}</em>`
    }
    if (range.attributes.link) {
      text = `<a href="${escapeHTML(range.attributes.link)}">${text}</a>`
    }
    if (range.attributes.mention) {
      text = `<span class="mention" data-user="${escapeHTML(range.attributes.mentionUser)}">${text}</span>`
    }

    html += text
  }
  return html || '<br>' // Empty line placeholder
})

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Get current selection
function getSelection(): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !editor) return null

  const range = sel.getRangeAt(0)
  const preSelectionRange = range.cloneRange()
  preSelectionRange.selectNodeContents(editor)
  preSelectionRange.setEnd(range.startContainer, range.startOffset)

  const start = preSelectionRange.toString().length
  const end = start + range.toString().length

  return { start, end }
}

// Toolbar actions
async function toggleFormat(attribute: 'bold' | 'italic') {
  const sel = getSelection()
  if (!sel || sel.start === sel.end) return

  // Check if range already has format
  let hasFormat = false
  let charCount = 0
  for (const range of $ranges) {
    const rangeEnd = charCount + range.text.length
    if (charCount < sel.end && rangeEnd > sel.start) {
      if (range.attributes[attribute]) {
        hasFormat = true
        break
      }
    }
    charCount = rangeEnd
  }

  // Toggle format
  await format(sel.start, sel.end, {
    [attribute]: !hasFormat
  })
}

async function addLink() {
  const sel = getSelection()
  if (!sel || sel.start === sel.end) return

  const url = prompt('Enter URL:')
  if (!url) return

  await format(sel.start, sel.end, { link: url })
}

async function addMention() {
  const sel = getSelection()
  if (!sel || sel.start === sel.end) return

  const username = prompt('Enter username:')
  if (!username) return

  await format(sel.start, sel.end, {
    mention: true,
    mentionUser: username,
    backgroundColor: '#E3F2FD'
  })
}

// Handle typing (simplified)
function handleInput(event: Event) {
  const target = event.currentTarget as HTMLDivElement
  const newText = target.innerText

  // Simple approach: track text length changes
  const currentLength = $ranges.reduce((sum, r) => sum + r.text.length, 0)
  const diff = newText.length - currentLength

  const sel = getSelection()
  if (!sel) return

  if (diff > 0) {
    // Text inserted
    const insertedText = newText.slice(sel.start - diff, sel.start)
    insert(sel.start - diff, insertedText)
  } else if (diff < 0) {
    // Text deleted
    deleteText(sel.start, -diff)
  }
}
</script>

<div class="rich-editor">
  {#if $loading}
    <div>Loading editor...</div>
  {:else}
    <div class="toolbar">
      <button onclick={() => toggleFormat('bold')} title="Bold">
        <strong>B</strong>
      </button>
      <button onclick={() => toggleFormat('italic')} title="Italic">
        <em>I</em>
      </button>
      <button onclick={addLink} title="Add link">
        🔗
      </button>
      <button onclick={addMention} title="Mention user">
        @
      </button>
    </div>

    <div
      bind:this={editor}
      contenteditable
      class="editor-content"
      oninput={handleInput}
    >
      {@html formattedHTML}
    </div>
  {/if}
</div>

<style>
  .rich-editor {
    border: 1px solid #ddd;
    border-radius: 4px;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    gap: 4px;
    padding: 8px;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
  }

  .toolbar button {
    padding: 6px 12px;
    border: 1px solid #ccc;
    background: white;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
  }

  .toolbar button:hover {
    background: #e9e9e9;
  }

  .editor-content {
    min-height: 200px;
    padding: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    outline: none;
  }

  .editor-content :global(.mention) {
    background-color: #E3F2FD;
    padding: 2px 4px;
    border-radius: 3px;
    font-weight: 500;
  }
</style>
```

**Production Quill Integration:**

```svelte
<script lang="ts">
import { syncRichText } from '@synckit-js/sdk/svelte'
import { onMount, onDestroy } from 'svelte'
import Quill from 'quill'
import { QuillBinding } from '@synckit-js/sdk/integrations/quill'
import 'quill/dist/quill.snow.css'

const { richText, loading } = syncRichText('doc-quill-123', {
  storage: 'indexeddb',
  name: 'quill-editor'
})

let editorContainer: HTMLDivElement
let quill: Quill | null = null
let binding: QuillBinding | null = null

onMount(async () => {
  if (!editorContainer || !$richText) return

  // Initialize Quill
  quill = new Quill(editorContainer, {
    theme: 'snow',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ header: 1 }, { header: 2 }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ color: [] }, { background: [] }],
        ['link', 'image'],
        ['clean']
      ]
    }
  })

  // Bind Quill to SyncKit
  binding = new QuillBinding($richText, quill)
})

onDestroy(() => {
  binding?.destroy()
  quill = null
})
</script>

<div class="quill-container">
  {#if $loading}
    <div>Loading editor...</div>
  {:else}
    <div bind:this={editorContainer} />
  {/if}
</div>

<style>
  .quill-container {
    height: 400px;
  }
</style>
```

**API Reference:**

```typescript
function syncRichText(
  docId: string,
  config?: SyncKitConfig
): {
  ranges: Readable<FormatRange[]>
  richText: Readable<RichText | null>
  insert: (pos: number, text: string) => Promise<void>
  deleteText: (pos: number, length: number) => Promise<void>
  format: (start: number, end: number, attributes: FormatAttributes) => Promise<void>
  loading: Readable<boolean>
  error: Readable<Error | null>
}
```

---

## Undo/Redo

### `syncUndo()`

Cross-tab undo/redo with persistent history.

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'
import { syncUndo } from '@synckit-js/sdk/svelte'

interface Note extends Record<string, unknown> {
  title: string
  content: string
}

const { data, set } = syncDocument<Note>('note-123', {
  storage: 'indexeddb',
  name: 'notes'
})

const { undo, redo, canUndo, canRedo, add } = syncUndo('note-123', {
  storage: 'indexeddb',
  name: 'notes',
  maxSize: 50
})

// Wrap mutations to track for undo
async function updateTitle(newTitle: string) {
  const oldTitle = $data?.title

  add({
    type: 'update-title',
    data: { field: 'title', oldValue: oldTitle, newValue: newTitle },
    apply: async () => {
      await set('title', newTitle)
    },
    inverse: async () => {
      await set('title', oldTitle!)
    }
  })

  await set('title', newTitle)
}

async function updateContent(newContent: string) {
  const oldContent = $data?.content

  add({
    type: 'update-content',
    data: { field: 'content', oldValue: oldContent, newValue: newContent },
    apply: async () => {
      await set('content', newContent)
    },
    inverse: async () => {
      await set('content', oldContent!)
    }
  })

  await set('content', newContent)
}

// Keyboard shortcuts
function handleKeyDown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
    event.preventDefault()
    if (event.shiftKey && $canRedo) {
      redo()
    } else if ($canUndo) {
      undo()
    }
  }
}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="note-editor">
  <div class="toolbar">
    <button
      onclick={undo}
      disabled={!$canUndo}
      title="Undo (⌘Z)"
    >
      ↶ Undo
    </button>
    <button
      onclick={redo}
      disabled={!$canRedo}
      title="Redo (⌘⇧Z)"
    >
      ↷ Redo
    </button>
  </div>

  <input
    value={$data?.title}
    oninput={(e) => updateTitle(e.currentTarget.value)}
    placeholder="Note title"
    class="title-input"
  />

  <textarea
    value={$data?.content}
    oninput={(e) => updateContent(e.currentTarget.value)}
    placeholder="Write your note..."
    rows="20"
    class="content-input"
  />
</div>

<style>
  .note-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
  }

  .toolbar {
    display: flex;
    gap: 8px;
  }

  .toolbar button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .title-input {
    font-size: 24px;
    font-weight: bold;
    border: none;
    border-bottom: 2px solid #eee;
    padding: 8px 0;
    outline: none;
  }

  .content-input {
    flex: 1;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 12px;
    font-size: 16px;
    line-height: 1.6;
    resize: none;
    outline: none;
  }
</style>
```

**API Reference:**

```typescript
function syncUndo(
  docId: string,
  config: SyncKitConfig & {
    maxSize?: number
    mergeInterval?: number
  }
): {
  undo: () => Promise<void>
  redo: () => Promise<void>
  canUndo: Readable<boolean>
  canRedo: Readable<boolean>
  add: (operation: Operation) => void
}
```

---

## Presence & Awareness

### `syncAwareness()`

Track who's online with real-time presence updates.

```svelte
<script lang="ts">
import { syncAwareness } from '@synckit-js/sdk/svelte'
import { onMount } from 'svelte'

interface UserPresence extends Record<string, unknown> {
  id: string
  name: string
  avatar: string
  color: string
  lastSeen: number
}

const { awareness, setLocalState, users, localClientId } = syncAwareness<UserPresence>(
  'room-123',
  {
    storage: 'indexeddb',
    name: 'presence',
    server: 'https://sync.example.com'
  }
)

onMount(() => {
  // Set initial presence
  setLocalState({
    id: 'alice',
    name: 'Alice Johnson',
    avatar: 'https://i.pravatar.cc/150?img=1',
    color: '#FF6B6B',
    lastSeen: Date.now()
  })

  // Update presence periodically
  const interval = setInterval(() => {
    setLocalState((prev) => ({
      ...prev!,
      lastSeen: Date.now()
    }))
  }, 30000) // Every 30 seconds

  return () => clearInterval(interval)
})

// Filter out stale users (inactive > 2 minutes)
let activeUsers = $derived.by(() => {
  const now = Date.now()
  return $users.filter(user =>
    now - user.state.lastSeen < 120000
  )
})

let userCount = $derived(activeUsers.length)
</script>

<div class="presence-panel">
  <h3>Online Now ({userCount})</h3>

  <div class="user-list">
    {#each activeUsers as user (user.clientId)}
      <div
        class="user-item"
        class:is-you={user.clientId === $localClientId}
      >
        <img
          src={user.state.avatar}
          alt={user.state.name}
          class="avatar"
          style="border-color: {user.state.color}"
        />
        <div class="user-info">
          <div class="user-name">
            {user.state.name}
            {#if user.clientId === $localClientId}
              <span class="badge">You</span>
            {/if}
          </div>
          <div class="user-status">Active</div>
        </div>
      </div>
    {/each}
  </div>

  {#if userCount === 0}
    <div class="empty-state">
      No one else is here right now
    </div>
  {/if}
</div>

<style>
  .presence-panel {
    padding: 16px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    min-width: 250px;
  }

  h3 {
    margin: 0 0 16px 0;
    font-size: 14px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .user-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .user-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .user-item:hover {
    background: #f5f5f5;
  }

  .user-item.is-you {
    background: #E3F2FD;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid;
    object-fit: cover;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user-name {
    font-weight: 500;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .badge {
    font-size: 11px;
    background: #4CAF50;
    color: white;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 600;
  }

  .user-status {
    font-size: 12px;
    color: #4CAF50;
  }

  .empty-state {
    padding: 24px;
    text-align: center;
    color: #999;
    font-size: 14px;
  }
</style>
```

### `syncPresence()`

Higher-level store combining awareness with cursor positions.

```svelte
<script lang="ts">
import { syncPresence } from '@synckit-js/sdk/svelte'
import { onMount } from 'svelte'

interface PresenceState extends Record<string, unknown> {
  name: string
  color: string
  cursor: { x: number; y: number } | null
}

const { users, updatePresence, localClientId } = syncPresence<PresenceState>(
  'canvas-123',
  {
    storage: 'indexeddb',
    name: 'presence',
    server: 'https://sync.example.com'
  }
)

let container: HTMLDivElement

onMount(() => {
  updatePresence({
    name: 'Alice',
    color: '#FF6B6B',
    cursor: null
  })
})

// Track mouse movement
function handleMouseMove(event: MouseEvent) {
  if (!container) return

  const rect = container.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  updatePresence((prev) => ({
    ...prev!,
    cursor: { x, y }
  }))
}

function handleMouseLeave() {
  updatePresence((prev) => ({
    ...prev!,
    cursor: null
  }))
}

let remoteCursors = $derived.by(() =>
  $users.filter(u => u.clientId !== $localClientId && u.state.cursor)
)
</script>

<div
  bind:this={container}
  class="canvas"
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  role="application"
>
  <div class="canvas-content">
    Collaborative Canvas
  </div>

  <!-- Remote cursors -->
  {#each remoteCursors as user (user.clientId)}
    <div
      class="remote-cursor"
      style="left: {user.state.cursor!.x}px; top: {user.state.cursor!.y}px; border-color: {user.state.color}"
    >
      <div class="cursor-label" style="background-color: {user.state.color}">
        {user.state.name}
      </div>
    </div>
  {/each}
</div>

<style>
  .canvas {
    position: relative;
    width: 100%;
    height: 600px;
    background: white;
    border: 2px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    cursor: crosshair;
  }

  .canvas-content {
    padding: 24px;
    font-size: 24px;
    font-weight: bold;
    color: #ddd;
  }

  .remote-cursor {
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid;
    border-radius: 50%;
    pointer-events: none;
    transform: translate(-50%, -50%);
    z-index: 1000;
  }

  .cursor-label {
    position: absolute;
    top: 20px;
    left: 20px;
    padding: 4px 8px;
    color: white;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
    white-space: nowrap;
  }
</style>
```

**API Reference:**

```typescript
function syncAwareness<T extends AwarenessState>(
  roomId: string,
  config?: SyncKitConfig
): {
  awareness: Readable<Awareness | null>
  users: Readable<Array<{ clientId: string; state: T }>>
  localClientId: Readable<string | null>
  setLocalState: (state: T | ((prev: T | null) => T)) => void
  loading: Readable<boolean>
  error: Readable<Error | null>
}

function syncPresence<T extends AwarenessState>(
  roomId: string,
  config?: SyncKitConfig
): {
  users: Readable<Array<{ clientId: string; state: T }>>
  localClientId: Readable<string | null>
  updatePresence: (state: T | ((prev: T | null) => T)) => void
}
```

---

## Live Cursors

### Production Cursor Sharing

```svelte
<script lang="ts">
import { syncPresence } from '@synckit-js/sdk/svelte'
import { createSpring, createAdaptiveThrottle } from '@synckit-js/sdk/cursor'
import { onMount, onDestroy } from 'svelte'

interface CursorState extends Record<string, unknown> {
  name: string
  color: string
  x: number
  y: number
}

const { users, updatePresence, localClientId } = syncPresence<CursorState>(
  'editor-123',
  {
    storage: 'indexeddb',
    name: 'cursors',
    server: 'https://sync.example.com'
  }
)

// Spring animations for smooth cursor movement
let cursors = $state<Map<string, {
  springX: ReturnType<typeof createSpring>
  springY: ReturnType<typeof createSpring>
  currentX: number
  currentY: number
}>>(new Map())

// Adaptive throttling (scales with user count)
const throttle = createAdaptiveThrottle({
  minDelay: 16,   // 60 FPS for few users
  maxDelay: 200,  // 5 FPS for many users
  userThresholds: {
    5: 16,
    10: 33,
    20: 50,
    50: 200
  }
})

let container: HTMLDivElement
let animationFrameId: number | null = null

onMount(() => {
  updatePresence({
    name: 'Alice',
    color: '#FF6B6B',
    x: 0,
    y: 0
  })

  startAnimation()
})

onDestroy(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})

// Watch for new users and create springs
$effect(() => {
  for (const user of $users) {
    if (user.clientId === $localClientId) continue

    if (!cursors.has(user.clientId)) {
      cursors.set(user.clientId, {
        springX: createSpring({
          damping: 45,
          stiffness: 400,
          mass: 1,
          initialValue: user.state.x
        }),
        springY: createSpring({
          damping: 45,
          stiffness: 400,
          mass: 1,
          initialValue: user.state.y
        }),
        currentX: user.state.x,
        currentY: user.state.y
      })
    } else {
      // Update spring targets
      const cursor = cursors.get(user.clientId)!
      cursor.springX.setTarget(user.state.x)
      cursor.springY.setTarget(user.state.y)
    }
  }

  // Remove cursors for users who left
  const activeIds = new Set($users.map(u => u.clientId))
  for (const id of cursors.keys()) {
    if (!activeIds.has(id)) {
      cursors.delete(id)
    }
  }
})

// Track local cursor
function handleMouseMove(event: MouseEvent) {
  if (!container) return

  const rect = container.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  throttle.throttle(() => {
    updatePresence((prev) => ({
      ...prev!,
      x,
      y
    }))
  }, $users.length)
}

// Animation loop
let lastTime = performance.now()

function startAnimation() {
  function animate(currentTime: number) {
    const deltaTime = (currentTime - lastTime) / 1000
    lastTime = currentTime

    let needsUpdate = false

    // Update all cursor springs
    for (const [id, cursor] of cursors.entries()) {
      const newX = cursor.springX.update(deltaTime)
      const newY = cursor.springY.update(deltaTime)

      if (newX !== cursor.currentX || newY !== cursor.currentY) {
        cursor.currentX = newX
        cursor.currentY = newY
        needsUpdate = true
      }

      if (!cursor.springX.isAtRest() || !cursor.springY.isAtRest()) {
        needsUpdate = true
      }
    }

    animationFrameId = requestAnimationFrame(animate)
  }

  animationFrameId = requestAnimationFrame(animate)
}

let userForCursor = (id: string) => $users.find(u => u.clientId === id)
</script>

<div
  bind:this={container}
  class="editor-container"
  onmousemove={handleMouseMove}
  role="application"
>
  <div class="editor-content">
    Collaborative Editor
  </div>

  <!-- Animated remote cursors -->
  {#each Array.from(cursors.entries()) as [id, cursor] (id)}
    {@const user = userForCursor(id)}
    {#if user}
      <div
        class="cursor"
        style="left: {cursor.currentX}px; top: {cursor.currentY}px"
      >
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path
            d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
            fill={user.state.color}
            stroke="white"
            stroke-width="1"
          />
        </svg>
        <div
          class="cursor-name"
          style="background-color: {user.state.color}"
        >
          {user.state.name}
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .editor-container {
    position: relative;
    width: 100%;
    height: 600px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }

  .editor-content {
    padding: 24px;
    font-size: 16px;
    line-height: 1.6;
  }

  .cursor {
    position: absolute;
    pointer-events: none;
    z-index: 1000;
    transform: translate(-2px, -2px);
    transition: opacity 0.3s;
  }

  .cursor-name {
    position: absolute;
    top: 24px;
    left: 24px;
    padding: 4px 8px;
    color: white;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
    white-space: nowrap;
  }
</style>
```

---

## TypeScript Integration

### Strict Type Safety

SyncKit Svelte stores are fully typed with TypeScript.

```typescript
import { syncDocument } from '@synckit-js/sdk/svelte'
import type { Readable } from 'svelte/store'

// Define your document schema
interface Task extends Record<string, unknown> {
  id: string
  title: string
  description: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  assignee: string | null
  dueDate: Date | null
  tags: string[]
}

// Type inference works automatically
const { data, set, update } = syncDocument<Task>('task-1')

// ✅ Type-safe field updates
await set('title', 'New title')         // OK
await set('completed', true)            // OK
await set('priority', 'high')           // OK

// ❌ Type errors caught at compile time
await set('title', 123)                 // Error: Type 'number' not assignable to 'string'
await set('priority', 'urgent')         // Error: '"urgent"' not assignable to type
await set('nonexistent', 'value')       // Error: Property 'nonexistent' does not exist

// Type-safe partial updates
await update({
  completed: true,
  priority: 'high'
})

// ❌ Type errors for partial updates
await update({
  title: 123                            // Error: Type 'number' not assignable to 'string'
})

// Type-safe derived state
let isOverdue = $derived.by(() => {
  if (!$data?.dueDate) return false
  return new Date() > $data.dueDate
})

let priorityColor = $derived.by(() => {
  switch ($data?.priority) {
    case 'high': return 'red'
    case 'medium': return 'orange'
    case 'low': return 'green'
    default: return 'gray'
  }
})
```

### Generic Stores

```typescript
// Reusable typed store
function createEntityStore<T extends DocumentData>(id: string) {
  const { data, set, update, loading, error } = syncDocument<T>(id, {
    storage: 'indexeddb',
    name: 'entities'
  })

  return {
    entity: data,
    updateEntity: update,
    setField: set,
    loading,
    error
  }
}

// Usage with type inference
interface User extends Record<string, unknown> {
  name: string
  email: string
}

const { entity, updateEntity } = createEntityStore<User>('user-123')
```

---

## Performance Optimization

### 1. Selective Subscriptions

Only subscribe to fields you need.

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'

interface LargeDocument extends Record<string, unknown> {
  metadata: { title: string; author: string }
  content: string // Very large field
  comments: Array<{/* ... */}> // Another large field
}

const { data } = syncDocument<LargeDocument>('doc-123')

// Only compute what you need
let title = $derived($data?.metadata.title)
let author = $derived($data?.metadata.author)

// Don't access large fields unless necessary
</script>
```

### 2. Debounced Updates

Reduce update frequency for intensive operations.

```svelte
<script lang="ts">
import { syncText } from '@synckit-js/sdk/svelte'

const { insert, delete: deleteText } = syncText('doc-123')

let debounceTimer: number

function debouncedInsert(pos: number, text: string) {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    insert(pos, text)
  }, 300)
}
</script>
```

### 3. Virtual Scrolling for Large Lists

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'
import { VirtualList } from 'svelte-virtual-list'

interface TodoList extends Record<string, unknown> {
  todos: Array<{ id: string; title: string; completed: boolean }>
}

const { data } = syncDocument<TodoList>('todos')

let todos = $derived($data?.todos || [])
</script>

<VirtualList items={todos} itemHeight={50} let:item>
  <div>{item.title}</div>
</VirtualList>
```

### 4. Memoization with $derived

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'

const { data } = syncDocument<{ items: number[] }>('data')

// Expensive computation - memoized automatically with $derived
let sum = $derived.by(() => {
  return $data?.items.reduce((a, b) => a + b, 0) || 0
})

let average = $derived.by(() => {
  const items = $data?.items
  return items && items.length > 0 ? sum / items.length : 0
})
</script>
```

---

## Common Patterns

### 1. Form Handling with bind:value

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'

interface FormData extends Record<string, unknown> {
  name: string
  email: string
  message: string
}

const { data, update } = syncDocument<FormData>('form-123')

let name = $state('')
let email = $state('')
let message = $state('')

// Sync form with document
$effect(() => {
  if ($data) {
    name = $data.name
    email = $data.email
    message = $data.message
  }
})

async function handleSubmit() {
  await update({ name, email, message })
  // Form is now synced
}
</script>

<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
  <input bind:value={name} />
  <input type="email" bind:value={email} />
  <textarea bind:value={message} />
  <button type="submit">Save</button>
</form>
```

### 2. Optimistic Updates

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'

interface Todo extends Record<string, unknown> {
  title: string
  completed: boolean
}

const { data, set } = syncDocument<Todo>('todo-1')

// Optimistic UI update
let localCompleted = $state($data?.completed || false)

async function toggleCompleted() {
  // Update UI immediately
  localCompleted = !localCompleted

  try {
    // Sync to backend
    await set('completed', localCompleted)
  } catch (error) {
    // Revert on error
    localCompleted = !localCompleted
    console.error('Failed to update:', error)
  }
}
</script>

<input
  type="checkbox"
  checked={localCompleted}
  onchange={toggleCompleted}
/>
```

### 3. Multi-Document Sync

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'

interface User extends Record<string, unknown> {
  name: string
  projectIds: string[]
}

interface Project extends Record<string, unknown> {
  title: string
  description: string
}

const { data: user } = syncDocument<User>('user-alice')

// Sync multiple projects
let projects = $derived.by(() => {
  return $user?.projectIds.map(id =>
    syncDocument<Project>(id)
  ) || []
})
</script>
```

---

## Troubleshooting

### Issue: Store not reactive

**Problem:** Updates don't trigger re-renders.

**Solution:** Use `$` prefix to subscribe to stores:

```svelte
<script>
const { data } = syncDocument('doc-1')

// ❌ Wrong - not subscribed
console.log(data.title)

// ✅ Correct - subscribed with $
console.log($data?.title)
</script>
```

### Issue: Memory leaks

**Problem:** Subscriptions not cleaned up.

**Solution:** Stores handle cleanup automatically in Svelte 5. Don't manually unsubscribe:

```svelte
<script>
// ✅ Automatic cleanup on component unmount
const { data } = syncDocument('doc-1')

// ❌ Don't do this - store handles it
onDestroy(() => {
  // Don't manually cleanup
})
</script>
```

### Issue: TypeScript errors with event handlers

**Problem:** Type errors with event handlers.

**Solution:** Cast event target explicitly:

```svelte
<script lang="ts">
import { syncDocument } from '@synckit-js/sdk/svelte'

interface Todo extends Record<string, unknown> {
  title: string
}

const { data, set } = syncDocument<Todo>('todo-1')
</script>

<input
  value={$data?.title}
  oninput={(e) => set('title', e.currentTarget.value)}
/>
```

### Issue: Stale closures with $state

**Problem:** Callbacks capture old state values.

**Solution:** Access store values with `$` prefix directly in callbacks:

```svelte
<script>
import { syncDocument } from '@synckit-js/sdk/svelte'

const { data } = syncDocument('doc-1')

// ❌ Stale closure
let title = $data?.title
setInterval(() => {
  console.log(title) // Always logs initial value
}, 1000)

// ✅ Always current
setInterval(() => {
  console.log($data?.title) // Logs current value
}, 1000)
</script>
```

### Issue: Using runes outside component

**Problem:** `$derived` or `$state` used in `.ts` files.

**Solution:** Runes only work in `.svelte` components. Use regular JavaScript in `.ts` files:

```typescript
// ❌ Wrong - runes don't work in .ts files
let count = $state(0)

// ✅ Correct - use stores or reactive primitives
import { writable } from 'svelte/store'
const count = writable(0)
```

---

## Next Steps

**Explore More Guides:**
- [Rich Text Editing](./rich-text-editing.md) - Peritext formatting and Quill integration
- [Undo/Redo](./undo-redo.md) - Cross-tab undo with persistent history
- [Cursor Sharing](./cursor-selection-sharing.md) - Spring animations and adaptive throttling
- [Bundle Size Optimization](./bundle-size-optimization.md) - Tree-shaking and code-splitting

**API Reference:**
- [SDK API Documentation](../api/SDK_API.md)

**Examples:**
- [Svelte Todo App](../../examples/svelte-todo/)
- [Svelte Rich Text Editor](../../examples/svelte-editor/)
- [Svelte Collaborative Canvas](../../examples/svelte-canvas/)

---

**Questions?** Open an issue on [GitHub](https://github.com/Dancode-188/synckit/issues).
