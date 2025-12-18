# Rich Text Editing with SyncKit

**Build collaborative rich text editors that handle formatting conflicts correctly.**

SyncKit's RichText CRDT combines Fugue text editing with Peritext formatting to give you Google Docs-style collaboration with deterministic conflict resolution. Format conflicts resolve correctly even when users bold the same text simultaneously.

---

## What You Can Build

- **Collaborative document editors** - Google Docs, Notion, or Confluence-style apps
- **Comment systems** - Rich comments with @mentions and formatting
- **Note-taking apps** - Evernote or Bear-style rich notes that sync across devices
- **Content management** - Blog post editors with real-time preview
- **Educational platforms** - Collaborative writing tools for students

---

## Quick Start

### React

```typescript
import { useRichText } from '@synckit-js/sdk/react'

function RichTextEditor() {
  const { text, ranges, format, insert, delete: deleteText } = useRichText('doc-123')

  return (
    <div>
      {/* Render formatted content */}
      {ranges.map((range, i) => (
        <span key={i} style={{
          fontWeight: range.attributes.bold ? 'bold' : 'normal',
          fontStyle: range.attributes.italic ? 'italic' : 'normal',
          color: range.attributes.color || 'inherit'
        }}>
          {range.text}
        </span>
      ))}

      {/* Format toolbar */}
      <button onClick={() => format(0, 5, { bold: true })}>
        Bold
      </button>
      <button onClick={() => format(0, 5, { italic: true })}>
        Italic
      </button>
    </div>
  )
}
```

### Vue 3

```vue
<script setup lang="ts">
import { useRichText } from '@synckit-js/sdk/vue'

const {
  ranges,
  text,
  format,
  insert,
  deleteText
} = useRichText('doc-123')

function toggleBold(start: number, end: number) {
  format(start, end, { bold: true })
}
</script>

<template>
  <div class="editor">
    <!-- Render formatted ranges -->
    <span
      v-for="(range, i) in ranges"
      :key="i"
      :style="{
        fontWeight: range.attributes.bold ? 'bold' : 'normal',
        fontStyle: range.attributes.italic ? 'italic' : 'normal',
        color: range.attributes.color || 'inherit'
      }"
    >
      {{ range.text }}
    </span>

    <!-- Format controls -->
    <button @click="toggleBold(0, text.length)">
      Bold All
    </button>
  </div>
</template>
```

### Svelte 5

```svelte
<script lang="ts">
import { richText } from '@synckit-js/sdk/svelte'
import { getContext } from 'svelte'
import type { SyncKit } from '@synckit-js/sdk'

const synckit = getContext<SyncKit>('synckit')
const editor = richText(synckit, 'doc-123', 'content')
const { ranges, text, format, insert } = editor

function applyBold(start: number, end: number) {
  format(start, end, { bold: true })
}
</script>

<div class="editor">
  {#each $ranges as range, i}
    <span style:font-weight={range.attributes.bold ? 'bold' : 'normal'}
          style:font-style={range.attributes.italic ? 'italic' : 'normal'}
          style:color={range.attributes.color || 'inherit'}>
      {range.text}
    </span>
  {/each}

  <button onclick={() => applyBold(0, $text.length)}>
    Bold All
  </button>
</div>
```

---

## Core Concepts

### Peritext: Formatting That Converges

SyncKit uses the Peritext algorithm for rich text formatting. When two users format the same text simultaneously, Peritext ensures both clients converge to the same result.

**Example conflict:**
- User A: Bolds characters 0-5 at timestamp T1
- User B: Italicizes characters 3-8 at timestamp T2

**Result (deterministic):**
- Characters 0-2: Bold only
- Characters 3-5: Bold + Italic (overlap resolved correctly)
- Characters 6-8: Italic only

This is the key difference from naive approaches that might apply formats inconsistently.

### Format Attributes

Supported formatting attributes:

```typescript
interface FormatAttributes {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  color?: string          // Hex color (e.g., '#FF0000')
  backgroundColor?: string
  link?: string           // URL for links
  code?: boolean          // Inline code formatting
  [key: string]: any      // Custom attributes
}
```

### Format Ranges

RichText provides formatted content as ranges - segments of text with consistent formatting:

```typescript
interface FormatRange {
  text: string
  attributes: FormatAttributes
}

// Example output:
[
  { text: 'Hello ', attributes: { bold: true } },
  { text: 'World', attributes: { bold: true, italic: true } },
  { text: '!', attributes: {} }
]
```

Ranges make rendering simple - map each range to a `<span>` with the appropriate styles.

---

## API Reference

### Core Methods

#### `format(start, end, attributes)`

Apply formatting to a text range.

```typescript
// Make "Hello" bold
await richText.format(0, 5, { bold: true })

// Make "World" red and italic
await richText.format(6, 11, { italic: true, color: '#FF0000' })

// Add link
await richText.format(0, 5, { link: 'https://example.com' })
```

**Parameters:**
- `start` (number): Start position (inclusive)
- `end` (number): End position (exclusive)
- `attributes` (FormatAttributes): Formatting to apply

**Returns:** `Promise<void>`

**Conflict resolution:** Peritext ensures deterministic merge when multiple users format simultaneously.

#### `unformat(start, end, attributes)`

Remove specific formatting from a range.

```typescript
// Remove bold from "Hello"
await richText.unformat(0, 5, { bold: true })

// Remove italic and keep color
await richText.unformat(6, 11, { italic: true })
```

**Note:** Only removes specified attributes. Other formatting remains intact.

#### `clearFormats(start, end)`

Remove ALL formatting from a range (back to plain text).

```typescript
// Strip all formatting from entire document
await richText.clearFormats(0, richText.length())
```

#### `getFormats(position)`

Get formatting attributes at a specific position.

```typescript
const formats = richText.getFormats(3)
// Returns: { bold: true, italic: false, ... }
```

Useful for updating toolbar state based on cursor position.

#### `getRanges()`

Get all formatted ranges for rendering.

```typescript
const ranges = richText.getRanges()
// Returns: [{ text: 'Hello', attributes: { bold: true } }, ...]
```

Call this after format changes to re-render your editor.

### Text Editing Methods

RichText extends SyncText, so you have all text editing methods:

```typescript
// Insert text
await richText.insert(0, 'Hello ')

// Delete text
await richText.delete(0, 6)  // Delete "Hello "

// Get content
const text = richText.get()  // Returns plain text string

// Get length
const len = richText.length()
```

See [SyncText API](../api/SDK_API.md#text-crdt) for full text editing reference.

---

## Editor Integration

### Quill Editor

SyncKit provides a Quill binding for production-ready rich text editing:

```typescript
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { QuillBinding } from '@synckit-js/sdk/integrations/quill'

// Create Quill editor
const quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    toolbar: [
      ['bold', 'italic', 'underline'],
      ['link', 'code'],
      [{ 'color': [] }]
    ]
  }
})

// Create RichText CRDT
const richText = syncKit.richText('doc-123')
await richText.init()

// Bind Quill to RichText
const binding = new QuillBinding(richText, quill)

// Now:
// - Quill edits sync to RichText (and to other clients)
// - Remote changes update Quill automatically
// - Format operations sync correctly

// Clean up when done
binding.destroy()
```

**What the binding does:**
- Converts Quill Delta operations to RichText operations
- Applies remote changes to Quill editor
- Prevents infinite loops (local changes don't trigger re-application)
- Maps Quill attributes to Peritext attributes

### Custom Editor

Building your own editor? Subscribe to format changes:

```typescript
// Subscribe to format changes
richText.subscribeFormats((ranges) => {
  // Re-render your editor with new ranges
  renderEditor(ranges)
})

// Subscribe to text changes
richText.subscribe((text) => {
  console.log('Text changed:', text)
})
```

**Rendering pattern:**

```typescript
function renderEditor(ranges: FormatRange[]) {
  const container = document.getElementById('editor')
  container.innerHTML = ''

  ranges.forEach(range => {
    const span = document.createElement('span')
    span.textContent = range.text

    // Apply formatting
    if (range.attributes.bold) span.style.fontWeight = 'bold'
    if (range.attributes.italic) span.style.fontStyle = 'italic'
    if (range.attributes.color) span.style.color = range.attributes.color
    if (range.attributes.link) {
      const link = document.createElement('a')
      link.href = range.attributes.link
      link.textContent = range.text
      container.appendChild(link)
      return
    }

    container.appendChild(span)
  })
}
```

---

## Advanced Usage

### Selection-Based Formatting

Track user selection and format based on cursor position:

```typescript
let selectionStart = 0
let selectionEnd = 0

// User selects text
function onSelectionChange(start: number, end: number) {
  selectionStart = start
  selectionEnd = end

  // Update toolbar state
  const formats = richText.getFormats(start)
  updateToolbar(formats)
}

// User clicks "Bold" button
async function applyBold() {
  await richText.format(selectionStart, selectionEnd, { bold: true })
}
```

### Custom Attributes

Peritext supports custom attributes for domain-specific formatting:

```typescript
// Add @mention highlighting
await richText.format(5, 15, {
  mention: true,
  mentionUser: '@alice',
  backgroundColor: '#E3F2FD'
})

// Add comment marker
await richText.format(20, 30, {
  commentId: 'comment-123',
  highlighted: true
})
```

Render custom attributes in your editor:

```typescript
function renderRange(range: FormatRange) {
  if (range.attributes.mention) {
    return `<span class="mention" data-user="${range.attributes.mentionUser}">
      ${range.text}
    </span>`
  }

  if (range.attributes.commentId) {
    return `<span class="comment-highlight" data-comment="${range.attributes.commentId}">
      ${range.text}
    </span>`
  }

  return renderStandardFormat(range)
}
```

### Performance: Large Documents

RichText handles large documents efficiently:

```typescript
// Insert 10,000 characters
for (let i = 0; i < 10000; i++) {
  await richText.insert(i, 'A')
}

// Format 1,000 character range
await richText.format(0, 1000, { bold: true })

// Performance characteristics:
// - Insert: O(log n) where n is document length
// - Format: O(log n + k) where k is number of affected spans
// - Render: O(s) where s is number of format spans
```

**Optimization tips:**
- Batch operations when possible (Peritext merges adjacent spans)
- Subscribe to format changes only when needed
- Use efficient rendering (virtual scrolling for very large docs)

### Conflict Resolution Edge Cases

Peritext handles tricky edge cases correctly:

**1. Boundary formatting:**
```typescript
// User A formats [0, 5]
await richText.format(0, 5, { bold: true })

// User B (concurrent) formats [5, 10]
await richText.format(5, 10, { italic: true })

// Result: Clear boundary at position 5
// [0-5]: bold
// [5-10]: italic
```

**2. Overlapping formats:**
```typescript
// User A formats [0, 10] bold
// User B formats [5, 15] italic

// Result (deterministic):
// [0-5]: bold only
// [5-10]: bold + italic (overlap)
// [10-15]: italic only
```

**3. Nested formats:**
```typescript
// Apply color to [0, 20]
await richText.format(0, 20, { color: '#FF0000' })

// Apply bold to [5, 15] (nested)
await richText.format(5, 15, { bold: true })

// Result:
// [0-5]: red only
// [5-15]: red + bold
// [15-20]: red only
```

These all "just work" with Peritext. No manual conflict resolution needed.

---

## Framework Examples

### React: Toolbar + Editor

```typescript
import { useRichText } from '@synckit-js/sdk/react'
import { useState } from 'react'

function CollaborativeEditor() {
  const { text, ranges, format, richText } = useRichText('doc-123')
  const [selection, setSelection] = useState({ start: 0, end: 0 })

  // Get current formats at cursor
  const currentFormats = richText?.getFormats(selection.start) || {}

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar">
        <button
          className={currentFormats.bold ? 'active' : ''}
          onClick={() => format(selection.start, selection.end, { bold: true })}
        >
          Bold
        </button>
        <button
          className={currentFormats.italic ? 'active' : ''}
          onClick={() => format(selection.start, selection.end, { italic: true })}
        >
          Italic
        </button>
        <input
          type="color"
          value={currentFormats.color || '#000000'}
          onChange={(e) =>
            format(selection.start, selection.end, { color: e.target.value })
          }
        />
      </div>

      {/* Editor */}
      <div
        className="editor"
        contentEditable
        onSelect={() => {
          const sel = window.getSelection()
          if (sel) {
            setSelection({
              start: sel.anchorOffset,
              end: sel.focusOffset
            })
          }
        }}
      >
        {ranges.map((range, i) => (
          <span
            key={i}
            style={{
              fontWeight: range.attributes.bold ? 'bold' : 'normal',
              fontStyle: range.attributes.italic ? 'italic' : 'normal',
              color: range.attributes.color || 'inherit'
            }}
          >
            {range.text}
          </span>
        ))}
      </div>
    </div>
  )
}
```

### Vue 3: Comment System

```vue
<script setup lang="ts">
import { useRichText } from '@synckit-js/sdk/vue'
import { ref, computed } from 'vue'

const commentId = ref('comment-123')
const { ranges, text, format, insert } = useRichText(commentId)

const selection = ref({ start: 0, end: 0 })
const currentFormats = computed(() => {
  return ranges.value[0]?.attributes || {}
})

function addMention(username: string) {
  const mention = `@${username}`
  insert(text.value.length, mention)
  format(text.value.length - mention.length, text.value.length, {
    mention: true,
    mentionUser: username,
    color: '#1976D2'
  })
}
</script>

<template>
  <div class="comment-box">
    <div class="editor">
      <span
        v-for="(range, i) in ranges"
        :key="i"
        :class="{ mention: range.attributes.mention }"
        :style="{
          fontWeight: range.attributes.bold ? 'bold' : 'normal',
          fontStyle: range.attributes.italic ? 'italic' : 'normal',
          color: range.attributes.color || 'inherit'
        }"
      >
        {{ range.text }}
      </span>
    </div>

    <div class="toolbar">
      <button @click="format(selection.start, selection.end, { bold: true })">
        <strong>B</strong>
      </button>
      <button @click="format(selection.start, selection.end, { italic: true })">
        <em>I</em>
      </button>
      <button @click="addMention('alice')">
        @mention
      </button>
    </div>
  </div>
</template>

<style scoped>
.mention {
  background-color: #E3F2FD;
  padding: 2px 4px;
  border-radius: 3px;
}
</style>
```

### Svelte 5: Markdown-Style Editor

```svelte
<script lang="ts">
import { richText } from '@synckit-js/sdk/svelte'
import { getContext } from 'svelte'
import type { SyncKit } from '@synckit-js/sdk'

const synckit = getContext<SyncKit>('synckit')
const doc = richText(synckit, 'note-456', 'content')
const { ranges, text, format, insert } = doc

// Auto-format markdown syntax
function handleInput(e: Event) {
  const target = e.target as HTMLDivElement
  const content = target.textContent || ''

  // **bold**
  const boldMatches = content.matchAll(/\*\*(.*?)\*\*/g)
  for (const match of boldMatches) {
    if (match.index !== undefined) {
      format(match.index, match.index + match[1].length, { bold: true })
    }
  }

  // *italic*
  const italicMatches = content.matchAll(/\*(.*?)\*/g)
  for (const match of italicMatches) {
    if (match.index !== undefined) {
      format(match.index, match.index + match[1].length, { italic: true })
    }
  }
}
</script>

<div
  class="markdown-editor"
  contenteditable
  oninput={handleInput}
>
  {#each $ranges as range, i}
    <span
      style:font-weight={range.attributes.bold ? 'bold' : 'normal'}
      style:font-style={range.attributes.italic ? 'italic' : 'normal'}
    >
      {range.text}
    </span>
  {/each}
</div>

<style>
.markdown-editor {
  font-family: 'SF Mono', Monaco, monospace;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  min-height: 200px;
}
</style>
```

---

## Troubleshooting

### Formats Not Syncing

**Problem:** Format changes don't appear on other clients.

**Solution:** Ensure RichText is initialized and connected:

```typescript
const richText = syncKit.richText('doc-123')
await richText.init()  // ← Must call init!

// Check sync status
if (!richText.isSynced()) {
  console.log('Waiting for sync...')
}
```

### Inconsistent Format Rendering

**Problem:** Same document renders differently on different clients.

**Cause:** Usually a rendering bug, not a CRDT issue. Peritext guarantees convergence.

**Debug:**

```typescript
// Compare format spans on both clients
console.log('Ranges:', richText.getRanges())

// Should be identical after sync completes
```

### Performance Issues

**Problem:** Editor becomes slow with many format operations.

**Solution:**

1. **Batch operations:**
```typescript
// ❌ Slow: 100 separate format calls
for (let i = 0; i < 100; i++) {
  await richText.format(i * 10, i * 10 + 5, { bold: true })
}

// ✅ Fast: One format call
await richText.format(0, 500, { bold: true })
```

2. **Debounce format subscriptions:**
```typescript
import { debounce } from 'lodash'

const debouncedRender = debounce((ranges) => {
  renderEditor(ranges)
}, 100)

richText.subscribeFormats(debouncedRender)
```

3. **Use virtual scrolling for large documents:**
```typescript
// Only render visible ranges
const visibleRanges = ranges.slice(startIndex, endIndex)
```

---

## Next Steps

- **[Undo/Redo Guide](./undo-redo.md)** - Cross-tab undo that syncs format operations
- **[Cursor Sharing](./cursor-selection-sharing.md)** - Show teammate cursors in your editor
- **[API Reference](../api/SDK_API.md#richtext-crdt)** - Complete RichText API
- **[Collaborative Editor Example](../../examples/collaborative-editor/)** - Production-ready example with Quill

---

## Summary

**What you learned:**
- Rich text editing with Peritext formatting
- Format conflict resolution (deterministic convergence)
- Framework integrations (React, Vue, Svelte)
- Quill editor binding
- Custom attributes for @mentions, comments, etc.

**Key takeaways:**
- Peritext handles format conflicts correctly (no manual resolution needed)
- Format ranges make rendering simple
- Works with any framework or custom editor
- Production-ready with Quill binding

**Ready to build?** Check out the [Collaborative Editor Example](../../examples/collaborative-editor/) for a complete implementation.
