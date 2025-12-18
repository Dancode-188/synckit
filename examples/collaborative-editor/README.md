# Collaborative Rich Text Editor Example (v0.2.0)

**A production-ready Google Docs-style collaborative editor showcasing all SyncKit v0.2.0 features.**

Built with SyncKit v0.2.0, React, and Quill. This example demonstrates rich text collaboration, real-time presence, cursor sharing, and cross-tab undo/redo.

![Bundle Size](https://img.shields.io/badge/bundle-~195KB%20gzipped-success)
![SyncKit](https://img.shields.io/badge/synckit-v0.2.0-brightgreen)
![React](https://img.shields.io/badge/react-18.2-blue)
![TypeScript](https://img.shields.io/badge/typescript-5.0-blue)

## ✨ v0.2.0 Features Showcase

This example demonstrates **ALL** major features added in SyncKit v0.2.0:

### 🎨 Rich Text Editing (Peritext CRDT)
- **Bold, italic, underline, strikethrough** formatting
- **Text colors and background colors**
- **Headers** (H1, H2, H3)
- **Lists** (ordered and bullet)
- **Links** and code blocks
- **Conflict-free formatting** - When two users format the same text simultaneously, Peritext ensures deterministic convergence

### 👥 Real-time Presence & Awareness
- **Live user list** - See who's currently editing the document
- **Active status indicators** - Know when teammates are typing
- **Color-coded participants** - Each user gets a unique color

### 🎯 Cursor Sharing
- **Real-time cursor positions** - See exactly where teammates are typing
- **Smooth spring animations** - Cursors glide naturally across the screen
- **Name labels** - Know who each cursor belongs to
- **Viewport tracking** - Cursors update as users move around the document

### ↩️ Cross-Tab Undo/Redo
- **Unlimited undo/redo** (configurable max history)
- **Works across browser tabs** - Undo in one tab, redo in another
- **Keyboard shortcuts** - Cmd/Ctrl+Z to undo, Cmd/Ctrl+Shift+Z to redo
- **Visual stack counts** - See how many operations can be undone/redone

### 📡 Network Sync (Inherited from v0.1.0)
- **Offline-first** - Works completely offline
- **Auto-reconnection** - Reconnects automatically when back online
- **Offline queue** - All changes queued and synced when reconnected
- **Connection status** - Clear visual feedback

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The app will be available at `http://localhost:5173`.

### Testing Collaboration

To see real-time collaboration in action:

1. Open the app in **two browser tabs**
2. Type in one tab → See changes appear instantly in the other
3. Format text with bold/italic → See formatting sync in real-time
4. Move your mouse → See your cursor in the other tab
5. Undo in one tab → See undo reflected in the other tab

## Architecture

### Component Structure

```
src/
├── components/
│   ├── Header.tsx            # Top bar with menu and connection status
│   ├── Sidebar.tsx           # Document list
│   ├── DocumentTabs.tsx      # Tab bar for open documents
│   ├── Editor.tsx            # Quill editor + QuillBinding + cursor tracking
│   ├── UndoRedoToolbar.tsx   # Undo/redo buttons with keyboard shortcuts
│   ├── Cursor.tsx            # Animated cursor component
│   └── ParticipantList.tsx   # Live presence with SyncKit awareness
├── store.ts                  # Zustand UI state
├── types.ts                  # TypeScript interfaces
├── App.tsx                   # Main app component
└── main.tsx                  # Entry point
```

### Key Implementation Details

#### 1. Rich Text with QuillBinding

```typescript
import Quill from 'quill'
import { QuillBinding } from '@synckit-js/sdk/integrations/quill'

// Create RichText CRDT
const richText = synckit.richText(documentId)
await richText.init()

// Initialize Quill editor
const quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      ['link'],
      ['clean']
    ]
  }
})

// Bind Quill to RichText (two-way sync!)
const binding = new QuillBinding(richText, quill)

// Now:
// - Typing in Quill updates RichText CRDT
// - Remote changes update Quill editor automatically
// - Formatting syncs correctly with Peritext
```

#### 2. Presence & Cursors

```typescript
import { usePresence, useOthers } from '@synckit-js/sdk/react'

// Track local presence
const [presence, setPresence] = usePresence(documentId, {
  name: 'Alice',
  color: '#3B82F6',
  cursor: null
})

// Get other users
const others = useOthers(documentId)

// Track mouse movement
const handleMouseMove = (e: React.MouseEvent) => {
  const rect = containerRef.current.getBoundingClientRect()
  const cursor = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
  setPresence({ ...presence, cursor })
}

// Render teammate cursors
{others.map(user => user.cursor && (
  <Cursor
    key={user.id}
    position={user.cursor}
    color={user.color}
    name={user.name}
  />
))}
```

#### 3. Cross-Tab Undo/Redo

```typescript
import { useUndo } from '@synckit-js/sdk/react'

const { undo, redo, canUndo, canRedo, undoStack, redoStack } = useUndo(documentId, {
  maxUndoSize: 100,
  mergeWindow: 500
})

// Keyboard shortcuts
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      if (canUndo) undo()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
      e.preventDefault()
      if (canRedo) redo()
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [undo, redo, canUndo, canRedo])
```

## What Makes This Different?

### vs Google Docs
- **Lightweight**: 195KB gzipped vs 1MB+ for Google Docs
- **Offline-first**: Works completely offline with automatic sync
- **Open source**: Full control over your data and infrastructure
- **Self-hostable**: Run your own sync server

### vs Other CRDT Libraries
- **Smaller bundle**: 154KB gzipped (default SDK) vs 300KB+ (Yjs), 500KB+ (Automerge)
- **Simpler API**: React hooks + QuillBinding vs manual CRDT management
- **Better DX**: TypeScript-first with excellent autocomplete

## Bundle Analysis

### Production Bundle Size

```
Component                    Uncompressed    Gzipped
──────────────────────────────────────────────────────
Quill 2.0                        285 KB       85 KB
React 18 + ReactDOM              142 KB       45 KB
SyncKit (WASM + SDK)             154 KB       54 KB
Application Code                  28 KB        8 KB
Zustand                            9 KB        3 KB
──────────────────────────────────────────────────────
Total                           ~618 KB     ~195 KB
```

**Why Quill?** vs Monaco (2MB+): 95% smaller, perfect for rich text

**Why SyncKit default variant?** Includes all v0.2.0 features:
- Rich Text (Peritext) - 40KB
- Presence/Awareness - 12KB
- Undo/Redo - 8KB
- Network sync - 20KB

**Need smaller?** Use SyncKit Lite (46KB gzipped) for offline-only apps without rich text features.

## Configuration

### Local-Only Mode (Default)

```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'collaborative-editor',
})
```

All data stays local. Perfect for single-user offline-first apps.

### Server Sync Mode

```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'collaborative-editor',
  serverUrl: 'ws://localhost:8080', // Enable real-time collaboration
})
```

Then start the sync server:

```bash
cd ../../server/typescript
bun install
bun run dev
```

Now open the app in multiple tabs or devices to see real-time collaboration!

## Extending This Example

### Adding More Quill Modules

```typescript
import ImageResize from 'quill-image-resize-module'

const quill = new Quill('#editor', {
  modules: {
    toolbar: [...],
    imageResize: {}
  }
})
```

### Custom Cursor Styles

Edit `Cursor.tsx` to customize cursor appearance:

```typescript
<svg width="24" height="24" viewBox="0 0 24 24">
  <path d="..." fill={color} stroke="white" />
</svg>
```

### Document Export

```typescript
const handleExport = async () => {
  const delta = quill.getContents()
  const html = quill.root.innerHTML
  // Export as HTML, Delta, or Markdown
}
```

## Production Deployment

### Vite Build Optimization

The included `vite.config.ts` creates optimized chunks:

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'quill': ['quill', 'quill-delta'],
          'vendor': ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
})
```

### Hosting

**Static Hosting** (local-only mode):
- Vercel, Netlify, GitHub Pages
- Zero configuration

**With Sync Server**:
- Frontend: Any static host
- Backend: Railway, Fly.io, or VPS
- Use `wss://` in production

## Troubleshooting

### Formatting Not Syncing

**Check:** Ensure QuillBinding is initialized correctly and not destroyed prematurely.

**Fix:** Add logging to verify binding creation:

```typescript
const binding = new QuillBinding(richText, quill)
console.log('QuillBinding created:', binding)
```

### Cursors Jumping

**Cause:** Missing spring animation or incorrect coordinate calculation.

**Fix:** Verify spring animation is running in `Cursor.tsx`.

### Undo/Redo Not Working Across Tabs

**Check:** Both tabs must use the same document ID and have cross-tab sync enabled (default with IndexedDB).

## Learn More

- **[SyncKit v0.2.0 Documentation](../../docs/README.md)**
- **[Rich Text Editing Guide](../../docs/guides/rich-text-editing.md)**
- **[Cursor & Selection Sharing Guide](../../docs/guides/cursor-selection-sharing.md)**
- **[Undo/Redo Guide](../../docs/guides/undo-redo.md)**
- **[API Reference](../../docs/api/SDK_API.md)**

## License

This example is part of the SyncKit project and is licensed under the MIT License.
