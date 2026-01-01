# Vue 3 Integration Guide

**Complete guide to SyncKit's Vue 3 Composition API integration**

Build reactive local-first apps with Vue 3 composables that handle subscriptions, lifecycle, and state management automatically.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Composables](#core-composables)
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
npm install @synckit-js/sdk vue@^3.3.0
```

### Basic Setup

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { ref } from 'vue'

interface Todo extends Record<string, unknown> {
  title: string
  completed: boolean
}

const { data, set, loading, error } = useSyncDocument<Todo>('todo-1', {
  storage: 'indexeddb',
  name: 'my-app'
})
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else>
    <input
      :value="data?.title"
      @input="set('title', ($event.target as HTMLInputElement).value)"
      placeholder="What needs to be done?"
    />
    <label>
      <input
        type="checkbox"
        :checked="data?.completed"
        @change="set('completed', ($event.target as HTMLInputElement).checked)"
      />
      Completed
    </label>
  </div>
</template>
```

**What happens:**
- Document initializes automatically on mount
- Updates sync to storage in real-time
- Cleanup handled on unmount
- TypeScript types flow through `data`

---

## Core Composables

### `useSyncKit()`

Root composable for accessing SyncKit instance.

```vue
<script setup lang="ts">
import { useSyncKit } from '@synckit-js/sdk/vue'

const syncKit = useSyncKit({
  storage: 'indexeddb',
  name: 'my-app',
  server: 'https://sync.example.com'
})

// Access instance directly
console.log(syncKit.value.isOnline())
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
Ref<SyncKit>
```

---

## Document Sync

### `useSyncDocument()`

Reactive document synchronization with automatic lifecycle management.

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { computed } from 'vue'

interface UserProfile extends Record<string, unknown> {
  name: string
  email: string
  avatar: string
  bio: string
}

const { data, set, update, loading, error, syncState } = useSyncDocument<UserProfile>(
  'user-profile-alice',
  {
    storage: 'indexeddb',
    name: 'profiles-db'
  }
)

// Computed properties work seamlessly
const displayName = computed(() => data.value?.name || 'Anonymous')
const isComplete = computed(() =>
  data.value?.name && data.value?.email && data.value?.bio
)
</script>

<template>
  <div class="profile-editor">
    <div v-if="loading" class="spinner">Loading profile...</div>

    <div v-else-if="error" class="error">
      Failed to load profile: {{ error.message }}
    </div>

    <form v-else @submit.prevent>
      <div class="field">
        <label>Name</label>
        <input
          :value="data?.name"
          @input="set('name', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="field">
        <label>Email</label>
        <input
          type="email"
          :value="data?.email"
          @input="set('email', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="field">
        <label>Avatar URL</label>
        <input
          :value="data?.avatar"
          @input="set('avatar', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="field">
        <label>Bio</label>
        <textarea
          :value="data?.bio"
          @input="set('bio', ($event.target as HTMLInputElement).value)"
          rows="4"
        />
      </div>

      <div class="status">
        <span v-if="syncState === 'synced'" class="badge success">
          ✓ Saved
        </span>
        <span v-else-if="syncState === 'syncing'" class="badge pending">
          ↻ Syncing...
        </span>
        <span v-else-if="syncState === 'error'" class="badge error">
          ✗ Sync failed
        </span>
      </div>

      <div v-if="!isComplete" class="warning">
        Please complete all required fields
      </div>
    </form>
  </div>
</template>
```

**API Reference:**

```typescript
function useSyncDocument<T extends DocumentData>(
  docId: string,
  config?: SyncKitConfig
): {
  data: Ref<T | null>
  set: <K extends keyof T>(field: K, value: T[K]) => Promise<void>
  update: (partial: Partial<T>) => Promise<void>
  loading: Ref<boolean>
  error: Ref<Error | null>
  syncState: Ref<'synced' | 'syncing' | 'error' | 'offline'>
}
```

**Features:**
- ✅ Automatic subscription lifecycle
- ✅ Type-safe field updates
- ✅ Loading and error states
- ✅ Sync status tracking
- ✅ Cleanup on unmount

---

## Text Editing

### `useSyncText()`

Collaborative plain text editing with CRDT conflict resolution.

```vue
<script setup lang="ts">
import { useSyncText } from '@synckit-js/sdk/vue'
import { ref, watch } from 'vue'

const { text, insert, delete: deleteText, loading } = useSyncText(
  'doc-123',
  {
    storage: 'indexeddb',
    name: 'editor-db'
  }
)

const textarea = ref<HTMLTextAreaElement>()

// Handle local edits
function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  const newValue = target.value
  const oldValue = text.value

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
}

// Preserve cursor position on remote updates
watch(text, () => {
  if (textarea.value && document.activeElement !== textarea.value) {
    // Only update if not focused (remote change)
    textarea.value.value = text.value
  }
})
</script>

<template>
  <div class="editor">
    <div v-if="loading">Loading document...</div>
    <textarea
      v-else
      ref="textarea"
      :value="text"
      @input="handleInput"
      placeholder="Start typing..."
      rows="20"
    />
    <div class="char-count">{{ text.length }} characters</div>
  </div>
</template>

<style scoped>
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
function useSyncText(
  docId: string,
  config?: SyncKitConfig
): {
  text: Ref<string>
  insert: (pos: number, text: string) => Promise<void>
  delete: (pos: number, length: number) => Promise<void>
  loading: Ref<boolean>
  error: Ref<Error | null>
}
```

---

## Rich Text Editing

### `useRichText()`

Rich text editing with Peritext formatting (bold, italic, links, custom attributes).

```vue
<script setup lang="ts">
import { useRichText } from '@synckit-js/sdk/vue'
import { ref, computed } from 'vue'
import type { FormatRange } from '@synckit-js/sdk'

const { ranges, insert, deleteText, format, loading } = useRichText(
  'doc-rich-123',
  {
    storage: 'indexeddb',
    name: 'rich-editor'
  }
)

const editor = ref<HTMLDivElement>()
const selectedRange = ref<{ start: number; end: number } | null>(null)

// Render formatted text
const formattedHTML = computed(() => {
  let html = ''
  for (const range of ranges.value) {
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
  if (!sel || !sel.rangeCount || !editor.value) return null

  const range = sel.getRangeAt(0)
  const preSelectionRange = range.cloneRange()
  preSelectionRange.selectNodeContents(editor.value)
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
  for (const range of ranges.value) {
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

// Handle typing
function handleInput(event: Event) {
  const target = event.target as HTMLDivElement
  const newText = target.innerText

  // Simple approach: track text length changes
  const currentLength = ranges.value.reduce((sum, r) => sum + r.text.length, 0)
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

<template>
  <div class="rich-editor">
    <div v-if="loading">Loading editor...</div>

    <template v-else>
      <div class="toolbar">
        <button @click="toggleFormat('bold')" title="Bold">
          <strong>B</strong>
        </button>
        <button @click="toggleFormat('italic')" title="Italic">
          <em>I</em>
        </button>
        <button @click="addLink" title="Add link">
          🔗
        </button>
        <button @click="addMention" title="Mention user">
          @
        </button>
      </div>

      <div
        ref="editor"
        contenteditable
        class="editor-content"
        v-html="formattedHTML"
        @input="handleInput"
      />
    </template>
  </div>
</template>

<style scoped>
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

.editor-content :deep(.mention) {
  background-color: #E3F2FD;
  padding: 2px 4px;
  border-radius: 3px;
  font-weight: 500;
}
</style>
```

**Production Quill Integration:**

```vue
<script setup lang="ts">
import { useRichText } from '@synckit-js/sdk/vue'
import { ref, onMounted, onUnmounted } from 'vue'
import Quill from 'quill'
import { QuillBinding } from '@synckit-js/sdk/integrations/quill'
import 'quill/dist/quill.snow.css'

const { richText, loading } = useRichText('doc-quill-123', {
  storage: 'indexeddb',
  name: 'quill-editor'
})

const editorContainer = ref<HTMLDivElement>()
let quill: Quill | null = null
let binding: QuillBinding | null = null

onMounted(async () => {
  if (!editorContainer.value || !richText.value) return

  // Initialize Quill
  quill = new Quill(editorContainer.value, {
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
  binding = new QuillBinding(richText.value, quill)
})

onUnmounted(() => {
  binding?.destroy()
  quill = null
})
</script>

<template>
  <div class="quill-container">
    <div v-if="loading">Loading editor...</div>
    <div ref="editorContainer" v-else />
  </div>
</template>

<style scoped>
.quill-container {
  height: 400px;
}
</style>
```

**API Reference:**

```typescript
function useRichText(
  docId: string,
  config?: SyncKitConfig
): {
  ranges: Ref<FormatRange[]>
  richText: Ref<RichText | null>
  insert: (pos: number, text: string) => Promise<void>
  deleteText: (pos: number, length: number) => Promise<void>
  format: (start: number, end: number, attributes: FormatAttributes) => Promise<void>
  loading: Ref<boolean>
  error: Ref<Error | null>
}
```

---

## Undo/Redo

### `useUndo()`

Cross-tab undo/redo with persistent history.

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { useUndo } from '@synckit-js/sdk/vue'
import { ref } from 'vue'

interface Note extends Record<string, unknown> {
  title: string
  content: string
}

const { data, set } = useSyncDocument<Note>('note-123', {
  storage: 'indexeddb',
  name: 'notes'
})

const { undo, redo, canUndo, canRedo, add } = useUndo('note-123', {
  storage: 'indexeddb',
  name: 'notes',
  maxSize: 50
})

// Wrap mutations to track for undo
async function updateTitle(newTitle: string) {
  const oldTitle = data.value?.title

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
  const oldContent = data.value?.content

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
    if (event.shiftKey && canRedo.value) {
      redo()
    } else if (canUndo.value) {
      undo()
    }
  }
}
</script>

<template>
  <div class="note-editor" @keydown="handleKeyDown">
    <div class="toolbar">
      <button
        @click="undo"
        :disabled="!canUndo"
        title="Undo (⌘Z)"
      >
        ↶ Undo
      </button>
      <button
        @click="redo"
        :disabled="!canRedo"
        title="Redo (⌘⇧Z)"
      >
        ↷ Redo
      </button>
    </div>

    <input
      :value="data?.title"
      @input="updateTitle(($event.target as HTMLInputElement).value)"
      placeholder="Note title"
      class="title-input"
    />

    <textarea
      :value="data?.content"
      @input="updateContent(($event.target as HTMLInputElement).value)"
      placeholder="Write your note..."
      rows="20"
      class="content-input"
    />
  </div>
</template>

<style scoped>
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
function useUndo(
  docId: string,
  config: SyncKitConfig & {
    maxSize?: number
    mergeInterval?: number
  }
): {
  undo: () => Promise<void>
  redo: () => Promise<void>
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  add: (operation: Operation) => void
}
```

---

## Presence & Awareness

### `useAwareness()`

Track who's online with real-time presence updates.

```vue
<script setup lang="ts">
import { useAwareness } from '@synckit-js/sdk/vue'
import { computed } from 'vue'

interface UserPresence extends Record<string, unknown> {
  id: string
  name: string
  avatar: string
  color: string
  lastSeen: number
}

const { awareness, setLocalState, users, localClientId } = useAwareness<UserPresence>(
  'room-123',
  {
    storage: 'indexeddb',
    name: 'presence',
    server: 'https://sync.example.com'
  }
)

// Set initial presence
setLocalState({
  id: 'alice',
  name: 'Alice Johnson',
  avatar: 'https://i.pravatar.cc/150?img=1',
  color: '#FF6B6B',
  lastSeen: Date.now()
})

// Update presence periodically
setInterval(() => {
  setLocalState((prev) => ({
    ...prev!,
    lastSeen: Date.now()
  }))
}, 30000) // Every 30 seconds

// Filter out stale users (inactive > 2 minutes)
const activeUsers = computed(() => {
  const now = Date.now()
  return users.value.filter(user =>
    now - user.state.lastSeen < 120000
  )
})

const userCount = computed(() => activeUsers.value.length)
</script>

<template>
  <div class="presence-panel">
    <h3>Online Now ({{ userCount }})</h3>

    <div class="user-list">
      <div
        v-for="user in activeUsers"
        :key="user.clientId"
        class="user-item"
        :class="{ 'is-you': user.clientId === localClientId }"
      >
        <img
          :src="user.state.avatar"
          :alt="user.state.name"
          class="avatar"
          :style="{ borderColor: user.state.color }"
        />
        <div class="user-info">
          <div class="user-name">
            {{ user.state.name }}
            <span v-if="user.clientId === localClientId" class="badge">You</span>
          </div>
          <div class="user-status">Active</div>
        </div>
      </div>
    </div>

    <div v-if="userCount === 0" class="empty-state">
      No one else is here right now
    </div>
  </div>
</template>

<style scoped>
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

### `usePresence()`

Higher-level composable combining awareness with cursor positions.

```vue
<script setup lang="ts">
import { usePresence } from '@synckit-js/sdk/vue'
import { ref, onMounted } from 'vue'

interface PresenceState extends Record<string, unknown> {
  name: string
  color: string
  cursor: { x: number; y: number } | null
}

const container = ref<HTMLDivElement>()

const { users, updatePresence, localClientId } = usePresence<PresenceState>(
  'canvas-123',
  {
    storage: 'indexeddb',
    name: 'presence',
    server: 'https://sync.example.com'
  }
)

onMounted(() => {
  updatePresence({
    name: 'Alice',
    color: '#FF6B6B',
    cursor: null
  })
})

// Track mouse movement
function handleMouseMove(event: MouseEvent) {
  if (!container.value) return

  const rect = container.value.getBoundingClientRect()
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
</script>

<template>
  <div
    ref="container"
    class="canvas"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <div class="canvas-content">
      Collaborative Canvas
    </div>

    <!-- Remote cursors -->
    <div
      v-for="user in users.filter(u => u.clientId !== localClientId && u.state.cursor)"
      :key="user.clientId"
      class="remote-cursor"
      :style="{
        left: `${user.state.cursor!.x}px`,
        top: `${user.state.cursor!.y}px`,
        borderColor: user.state.color
      }"
    >
      <div class="cursor-label" :style="{ backgroundColor: user.state.color }">
        {{ user.state.name }}
      </div>
    </div>
  </div>
</template>

<style scoped>
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
function useAwareness<T extends AwarenessState>(
  roomId: string,
  config?: SyncKitConfig
): {
  awareness: Ref<Awareness | null>
  users: Ref<Array<{ clientId: string; state: T }>>
  localClientId: Ref<string | null>
  setLocalState: (state: T | ((prev: T | null) => T)) => void
  loading: Ref<boolean>
  error: Ref<Error | null>
}

function usePresence<T extends AwarenessState>(
  roomId: string,
  config?: SyncKitConfig
): {
  users: Ref<Array<{ clientId: string; state: T }>>
  localClientId: Ref<string | null>
  updatePresence: (state: T | ((prev: T | null) => T)) => void
}
```

---

## Live Cursors

### Production Cursor Sharing

```vue
<script setup lang="ts">
import { usePresence } from '@synckit-js/sdk/vue'
import { createSpring, createAdaptiveThrottle } from '@synckit-js/sdk/cursor'
import { ref, onMounted, onUnmounted, watch } from 'vue'

interface CursorState extends Record<string, unknown> {
  name: string
  color: string
  x: number
  y: number
}

const { users, updatePresence, localClientId } = usePresence<CursorState>(
  'editor-123',
  {
    storage: 'indexeddb',
    name: 'cursors',
    server: 'https://sync.example.com'
  }
)

// Spring animations for smooth cursor movement
const cursors = ref<Map<string, {
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

const container = ref<HTMLDivElement>()
let animationFrameId: number | null = null

onMounted(() => {
  updatePresence({
    name: 'Alice',
    color: '#FF6B6B',
    x: 0,
    y: 0
  })

  startAnimation()
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})

// Watch for new users and create springs
watch(users, (newUsers) => {
  for (const user of newUsers) {
    if (user.clientId === localClientId.value) continue

    if (!cursors.value.has(user.clientId)) {
      cursors.value.set(user.clientId, {
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
      const cursor = cursors.value.get(user.clientId)!
      cursor.springX.setTarget(user.state.x)
      cursor.springY.setTarget(user.state.y)
    }
  }

  // Remove cursors for users who left
  const activeIds = new Set(newUsers.map(u => u.clientId))
  for (const id of cursors.value.keys()) {
    if (!activeIds.has(id)) {
      cursors.value.delete(id)
    }
  }
}, { deep: true })

// Track local cursor
function handleMouseMove(event: MouseEvent) {
  if (!container.value) return

  const rect = container.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  throttle.throttle(() => {
    updatePresence((prev) => ({
      ...prev!,
      x,
      y
    }))
  }, users.value.length)
}

// Animation loop
let lastTime = performance.now()

function startAnimation() {
  function animate(currentTime: number) {
    const deltaTime = (currentTime - lastTime) / 1000
    lastTime = currentTime

    let needsUpdate = false

    // Update all cursor springs
    for (const [id, cursor] of cursors.value.entries()) {
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
</script>

<template>
  <div
    ref="container"
    class="editor-container"
    @mousemove="handleMouseMove"
  >
    <div class="editor-content">
      Collaborative Editor
    </div>

    <!-- Animated remote cursors -->
    <div
      v-for="[id, cursor] in cursors.entries()"
      :key="id"
      class="cursor"
      :style="{
        left: `${cursor.currentX}px`,
        top: `${cursor.currentY}px`
      }"
    >
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path
          d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
          :fill="users.find(u => u.clientId === id)?.state.color || '#000'"
          stroke="white"
          stroke-width="1"
        />
      </svg>
      <div
        class="cursor-name"
        :style="{ backgroundColor: users.find(u => u.clientId === id)?.state.color || '#000' }"
      >
        {{ users.find(u => u.clientId === id)?.state.name }}
      </div>
    </div>
  </div>
</template>

<style scoped>
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

SyncKit Vue composables are fully typed with TypeScript.

```typescript
import { useSyncDocument } from '@synckit-js/sdk/vue'
import type { Ref } from 'vue'

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
const { data, set, update } = useSyncDocument<Task>('task-1')

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

// Type-safe computed properties
import { computed } from 'vue'

const isOverdue = computed(() => {
  if (!data.value?.dueDate) return false
  return new Date() > data.value.dueDate
})

const priorityColor = computed(() => {
  switch (data.value?.priority) {
    case 'high': return 'red'
    case 'medium': return 'orange'
    case 'low': return 'green'
    default: return 'gray'
  }
})
```

### Generic Composables

```typescript
// Reusable typed composable
function useEntity<T extends DocumentData>(id: string) {
  const { data, set, update, loading, error } = useSyncDocument<T>(id, {
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

const { entity, updateEntity } = useEntity<User>('user-123')
```

---

## Performance Optimization

### 1. Selective Subscriptions

Only subscribe to fields you need.

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { computed } from 'vue'

interface LargeDocument extends Record<string, unknown> {
  metadata: { title: string; author: string }
  content: string // Very large field
  comments: Array<{/* ... */}> // Another large field
}

const { data } = useSyncDocument<LargeDocument>('doc-123')

// Only compute what you need
const title = computed(() => data.value?.metadata.title)
const author = computed(() => data.value?.metadata.author)

// Don't access large fields unless necessary
</script>
```

### 2. Debounced Updates

Reduce update frequency for intensive operations.

```vue
<script setup lang="ts">
import { useSyncText } from '@synckit-js/sdk/vue'
import { useDebounceFn } from '@vueuse/core'

const { insert, delete: deleteText } = useSyncText('doc-123')

// Debounce text updates
const debouncedInsert = useDebounceFn(
  (pos: number, text: string) => insert(pos, text),
  300
)

const debouncedDelete = useDebounceFn(
  (pos: number, length: number) => deleteText(pos, length),
  300
)
</script>
```

### 3. Virtual Scrolling for Large Lists

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { useVirtualList } from '@vueuse/core'
import { computed } from 'vue'

interface TodoList extends Record<string, unknown> {
  todos: Array<{ id: string; title: string; completed: boolean }>
}

const { data } = useSyncDocument<TodoList>('todos')

const todos = computed(() => data.value?.todos || [])

const { list, containerProps, wrapperProps } = useVirtualList(
  todos,
  {
    itemHeight: 50
  }
)
</script>

<template>
  <div v-bind="containerProps" style="height: 400px">
    <div v-bind="wrapperProps">
      <div v-for="{ data: todo, index } in list" :key="todo.id">
        {{ todo.title }}
      </div>
    </div>
  </div>
</template>
```

### 4. Memoization

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { computed } from 'vue'

const { data } = useSyncDocument<{ items: number[] }>('data')

// Expensive computation - memoized automatically
const sum = computed(() => {
  return data.value?.items.reduce((a, b) => a + b, 0) || 0
})

const average = computed(() => {
  const items = data.value?.items
  return items && items.length > 0 ? sum.value / items.length : 0
})
</script>
```

---

## Common Patterns

### 1. Form Handling

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { reactive, watch } from 'vue'

interface FormData extends Record<string, unknown> {
  name: string
  email: string
  message: string
}

const { data, update } = useSyncDocument<FormData>('form-123')

const form = reactive<FormData>({
  name: '',
  email: '',
  message: ''
})

// Sync form with document
watch(data, (newData) => {
  if (newData) {
    Object.assign(form, newData)
  }
}, { immediate: true })

async function handleSubmit() {
  await update(form)
  // Form is now synced
}
</script>
```

### 2. Optimistic Updates

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { ref } from 'vue'

interface Todo extends Record<string, unknown> {
  title: string
  completed: boolean
}

const { data, set } = useSyncDocument<Todo>('todo-1')

// Optimistic UI update
const localCompleted = ref(data.value?.completed || false)

async function toggleCompleted() {
  // Update UI immediately
  localCompleted.value = !localCompleted.value

  try {
    // Sync to backend
    await set('completed', localCompleted.value)
  } catch (error) {
    // Revert on error
    localCompleted.value = !localCompleted.value
    console.error('Failed to update:', error)
  }
}
</script>
```

### 3. Multi-Document Sync

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'

interface User extends Record<string, unknown> {
  name: string
  projectIds: string[]
}

interface Project extends Record<string, unknown> {
  title: string
  description: string
}

const { data: user } = useSyncDocument<User>('user-alice')

// Sync multiple projects
const projects = computed(() => {
  return user.value?.projectIds.map(id =>
    useSyncDocument<Project>(id)
  ) || []
})
</script>
```

---

## Troubleshooting

### Issue: Composable called outside setup()

**Error:**
```
[Vue warn]: onMounted is called when there is no active component instance
```

**Solution:** Always call composables inside `<script setup>` or `setup()`:

```vue
<!-- ❌ Wrong -->
<script>
const { data } = useSyncDocument('doc-1') // Outside setup
</script>

<!-- ✅ Correct -->
<script setup>
const { data } = useSyncDocument('doc-1') // Inside setup
</script>
```

### Issue: Reactive updates not working

**Problem:** Document updates don't trigger re-renders.

**Solution:** Ensure you're using `.value` with refs:

```vue
<script setup>
const { data } = useSyncDocument('doc-1')

// ❌ Wrong - missing .value
console.log(data.title)

// ✅ Correct
console.log(data.value?.title)
</script>
```

### Issue: Memory leaks

**Problem:** Subscriptions not cleaned up.

**Solution:** Composables handle cleanup automatically. Don't manually unsubscribe:

```vue
<script setup>
// ✅ Automatic cleanup on unmount
const { data } = useSyncDocument('doc-1')

// ❌ Don't do this - composable handles it
onUnmounted(() => {
  // Don't manually cleanup
})
</script>
```

### Issue: TypeScript errors with v-model

**Problem:** Type errors when using v-model with document fields.

**Solution:** Use computed with getter/setter:

```vue
<script setup lang="ts">
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { computed } from 'vue'

interface Todo extends Record<string, unknown> {
  title: string
}

const { data, set } = useSyncDocument<Todo>('todo-1')

const title = computed({
  get: () => data.value?.title || '',
  set: (value) => set('title', value)
})
</script>

<template>
  <input v-model="title" />
</template>
```

### Issue: Stale closures

**Problem:** Callbacks capture old state.

**Solution:** Use `toRef` or access ref.value directly:

```vue
<script setup>
import { useSyncDocument } from '@synckit-js/sdk/vue'
import { toRef } from 'vue'

const { data } = useSyncDocument('doc-1')

// ❌ Stale closure
setInterval(() => {
  console.log(data) // Always logs initial value
}, 1000)

// ✅ Always current
setInterval(() => {
  console.log(data.value) // Logs current value
}, 1000)
</script>
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
- [Vue Todo App](../../examples/vue-todo/)
- [Vue Rich Text Editor](../../examples/vue-editor/)
- [Vue Collaborative Canvas](../../examples/vue-canvas/)

---

**Questions?** Open an issue on [GitHub](https://github.com/Dancode-188/synckit/issues).
