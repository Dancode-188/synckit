# React Cursors & Selection Examples

**Real-time multiplayer cursors and text selection** - Production-ready collaborative features with zero configuration

## Examples

### 1. `cursors-basic.html` - Cursor Sharing Basics

The main example demonstrating cursor sharing with spring physics animation.

**Features:**
- 🎨 Spring physics animations (butter-smooth movement)
- 🎯 Color-coded cursors with user labels
- ⚡ Cross-tab testing with BroadcastChannel
- 📐 Viewport-relative positioning

**One line of code:**
```tsx
<Cursors documentId="my-doc" />
```

### 2. `cursors-container-mode.html` - Scrollable Content

Side-by-side comparison of viewport vs container positioning modes.

**Features:**
- 📜 Viewport mode (cursors fixed to screen)
- 📄 Container mode (cursors scroll with content)
- 🔄 Live comparison demo
- 📚 Perfect for document editors

**Usage:**
```tsx
// Viewport mode (default)
<Cursors documentId="doc" mode="viewport" />

// Container mode (scrollable content)
<Cursors documentId="doc" mode="container" containerRef={ref} />
```

### 3. `text-selection.html` - Text Selection Sharing

Collaborative text selection with semantic (XPath-based) serialization.

**Features:**
- ✨ Multi-line text selection (Google Docs style)
- 🌍 Cross-layout compatibility (works on different screen sizes)
- 🎯 Semantic selection (XPath + offsets, not pixels)
- 🎨 Color-coded selection highlights

**Usage:**
```tsx
<Selections documentId="doc" users={users} />
```

---

## Quick Start

### Zero Config (Recommended)

```tsx
import { SyncProvider, Cursors } from '@synckit-js/sdk/adapters/react'

function App() {
  return (
    <SyncProvider serverUrl="ws://localhost:8080/ws">
      <Cursors documentId="my-doc" />
    </SyncProvider>
  )
}
```

### With Advanced Features

```tsx
<Cursors
  documentId="my-doc"
  inactivity={{ timeout: 5000, fadeOutDuration: 300 }}  // Fade after 5s
  collision={{ threshold: 50, stackOffset: 20 }}        // Stack when overlapping
/>
```

### With Text Selection

```tsx
import { Selections, useSelection } from '@synckit-js/sdk/adapters/react'

function Editor() {
  const { users } = usePresence('doc')

  useSelection({ documentId: 'doc' })  // Track your selection

  return (
    <div>
      <Selections documentId="doc" users={users} />
      {/* Your content */}
    </div>
  )
}
```

---

## Features

### Cursor Sharing

✅ **Spring Physics Animations** - Butter-smooth cursor movements (damping: 45, stiffness: 400)
✅ **Inactivity Hiding** - Cursors fade after 5 seconds of inactivity
✅ **Collision Detection** - Cursors stack vertically when overlapping
✅ **Adaptive Throttling** - Auto-adjusts update frequency based on room size
✅ **Viewport & Container Modes** - Works with fixed or scrollable content
✅ **GPU Acceleration** - 60fps rendering with hardware acceleration
✅ **Zero Configuration** - Sensible defaults, just works

### Text Selection

✅ **Multi-Line Selection** - Rectangle-based rendering, one per line
✅ **Semantic Serialization** - XPath + offsets (works across different layouts)
✅ **Cross-Layout Compatibility** - Same text highlighted regardless of screen size
✅ **Smooth Transitions** - Fade in/out animations
✅ **Color Coordination** - Matches user cursor color

---

## API Reference

### `<Cursors />` Component

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `documentId` | `string` | required | Document ID to track cursors for |
| `mode` | `'viewport' \| 'container'` | `'viewport'` | Positioning mode |
| `containerRef` | `RefObject` | - | Required for container mode |
| `showSelf` | `boolean` | `false` | Show your own cursor |
| `showLabels` | `boolean` | `true` | Show cursor labels |
| `inactivity` | `InactivityConfig \| false` | `undefined` | Inactivity hiding config |
| `collision` | `CollisionConfig \| false` | `undefined` | Collision detection config |

**Inactivity Config:**
```typescript
{
  timeout: 5000,          // ms before fade (default: 5000)
  fadeOutDuration: 300    // ms fade animation (default: 300)
}
```

**Collision Config:**
```typescript
{
  threshold: 50,          // px distance for collision (default: 50)
  stackOffset: 20,        // px vertical offset per cursor (default: 20)
  cellSize: 100          // px spatial hash grid size (default: 100)
}
```

### `<Selections />` Component

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `documentId` | `string` | required | Document ID to track selections for |
| `users` | `User[]` | required | Users with selection data |
| `mode` | `'viewport' \| 'container'` | `'viewport'` | Positioning mode |
| `containerRef` | `RefObject` | - | Required for container mode |
| `opacity` | `number` | `0.2` | Selection highlight opacity |

### `useCursor()` Hook

```typescript
useCursor({
  documentId: string
  mode?: 'viewport' | 'container'
  containerRef?: RefObject<HTMLElement>
  enabled?: boolean          // Default: true
  throttleMs?: number        // Default: 50 (20 updates/sec)
})
```

### `useSelection()` Hook

```typescript
useSelection({
  documentId: string
  containerRef?: RefObject<HTMLElement>  // Optional: limit to container
  enabled?: boolean                      // Default: true
  throttleMs?: number                    // Default: 100
})
```

---

## Running These Examples

### Option 1: With SyncKit Server (Full Features)

1. Start the SyncKit server:
   ```bash
   cd server/typescript
   bun run dev  # or npm run dev
   ```

2. Start a local web server:
   ```bash
   cd examples/react-cursors
   python -m http.server 8081
   # or: npx http-server -p 8081
   ```

3. Open in browser:
   ```
   http://localhost:8081/cursors-basic.html
   ```

4. Open multiple tabs to see collaboration in action!

### Option 2: Standalone (Cross-Tab Testing)

The examples use BroadcastChannel for cross-tab communication, so they work without a server:

1. Just open the HTML files directly in your browser
2. Open the same file in multiple tabs
3. See cursors/selections sync across tabs

**Note:** This uses in-browser communication only. For real multiplayer across different devices, you need the SyncKit server.

---

## Performance

- **Bundle Size**: ~7.5KB (gzipped) for cursor + selection features
- **CPU Usage**: <1% with 10 users
- **Memory**: ~2MB per 100 cursors
- **FPS**: Constant 60fps (GPU accelerated)
- **Latency**: <100ms cursor updates

---

## Technical Details

### Architecture

```
useCursor / useSelection
   ↓ (capture local position/selection)
   ↓
usePresence
   ↓ (broadcast via awareness)
   ↓
Awareness Protocol
   ↓ (sync to other clients)
   ↓
Cursors / Selections
   ↓ (render remote cursors/selections)
   ↓
Spring Animation / XPath Deserialization
   ↓ (smooth movement / compute visual rects)
   ↓
GPU Rendering (translate3d / positioned divs)
```

### Why This Matters

**Cursors - Before (Competitors):**
```tsx
// 40+ lines of manual setup
const [cursors, setCursors] = useState({})
// ... manual tracking, rendering, animation
```

**Cursors - After (SyncKit):**
```tsx
<Cursors documentId="my-doc" />  // One line!
```

**Selections - The Innovation:**
- Other solutions: Share pixel coordinates (breaks on different screen sizes)
- SyncKit: Share semantic data (XPath + offsets) → works everywhere

---

## Learn More

- [API Documentation](../../sdk/README.md)

---

**Built with ❤️ by the SyncKit team**
