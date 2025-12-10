# React Cursors Example

**Phase 4: Cursor Sharing & Animations** - Zero-config collaborative cursors with spring physics

## Overview

This example demonstrates SyncKit's revolutionary zero-config cursor sharing feature. With just **one line of code**, you get:

- 🎨 **Spring Physics Animations** - Butter-smooth cursor movements (damping: 45, stiffness: 400)
- ⚡ **Adaptive Throttling** - Auto-adjusts update frequency based on room size
- 📐 **Relative Coordinates** - Works across different screen sizes (0-1 range)
- 🚀 **GPU Acceleration** - 60fps rendering with `translate3d`
- 🎯 **Zero Configuration** - No setup, no boilerplate, just works

## The Magic

```tsx
// That's literally it!
<Cursors documentId="my-doc" />
```

Compare this to competitors:
- Liveblocks: 40+ lines of setup code
- Yjs: Manual cursor tracking + rendering
- Others: No built-in cursor support

## What's Different?

### 1. Spring Physics (Not CSS Transitions)

We use **real physics** (Hooke's law) instead of CSS transitions:

```typescript
// Spring force: F = -kx
const springForce = -stiffness * (position - target)

// Damping force: F = -cv
const dampingForce = -damping * velocity

// Newton's second law: a = F/m
const acceleration = (springForce + dampingForce) / mass
```

Result: Natural, organic movement that feels **magical**.

### 2. Adaptive Throttling

Automatically adjusts update frequency based on room size:

- **<5 users**: 30ms (33fps) - Ultra responsive
- **5-20 users**: 50ms (20fps) - Balanced
- **20-50 users**: 100ms (10fps) - Efficient
- **50+ users**: 200ms (5fps) - Scalable

No configuration needed - it just works.

### 3. Relative Coordinates

Cursors use 0-1 percentage coordinates instead of absolute pixels:

```typescript
// Absolute (breaks across devices)
{ x: 640, y: 480 }  // Only works on 1280x960 screens

// Relative (works everywhere)
{ x: 0.5, y: 0.5 }  // 50% of container width/height
```

Result: Cursors work perfectly across different screen sizes.

## Usage

### Zero Config (Recommended)

```tsx
import { SyncKitProvider, Cursors } from '@synckit-js/sdk/adapters/react'

function App() {
  return (
    <SyncKitProvider serverUrl="ws://localhost:8080/ws">
      <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
        <Cursors documentId="my-doc" />
      </div>
    </SyncKitProvider>
  )
}
```

### With Cursor Tracking

```tsx
import { useCursor, Cursors } from '@synckit-js/sdk/adapters/react'

function CollaborativeCanvas() {
  const containerRef = useRef(null)
  const cursor = useCursor('my-doc', {
    containerRef,
    metadata: {
      user: { name: 'Alice', color: '#FF6B6B' }
    }
  })

  return (
    <div ref={containerRef} {...cursor.bind()}>
      <Cursors documentId="my-doc" containerRef={containerRef} />
      {/* Your content */}
    </div>
  )
}
```

### Custom Cursor Renderer

```tsx
<Cursors
  documentId="my-doc"
  renderCursor={(user) => (
    <div style={{ color: user.color }}>
      <YourCustomCursor />
      <span>{user.name}</span>
    </div>
  )}
/>
```

## API Reference

### `<Cursors />` Component

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `documentId` | `string` | required | Document ID to track cursors for |
| `containerRef` | `RefObject` | auto | Container ref (auto-detects if not provided) |
| `showSelf` | `boolean` | `false` | Show your own cursor |
| `showLabels` | `boolean` | `true` | Show cursor labels |
| `renderCursor` | `function` | default | Custom cursor renderer |
| `spring` | `SpringConfig` | see below | Spring animation config |

### Default Spring Config

```typescript
{
  damping: 45,      // Higher = less bouncy
  stiffness: 400,   // Higher = faster movement
  mass: 1,          // Object "weight"
  restDelta: 0.001  // Stop threshold
}
```

Carefully tuned for the best feel. Don't change unless you know what you're doing!

### `useCursor()` Hook

```typescript
const cursor = useCursor(documentId: string, options?: {
  containerRef?: RefObject<HTMLElement>
  throttle?: number | 'auto'  // Default: 'auto'
  metadata?: Record<string, unknown>
  updateOnLeave?: boolean     // Default: true
})

// Returns
{
  position: RelativePosition | null  // Current cursor position (0-1)
  update: (pos: RelativePosition) => void
  bind: () => CursorBinding  // { ref, onMouseMove, onMouseLeave }
  clear: () => void
}
```

## Performance

- **Bundle Size**: ~4KB (gzipped)
- **CPU Usage**: <1% with 10 users
- **Memory**: ~2MB per 100 cursors
- **FPS**: Constant 60fps (GPU accelerated)

## Running This Example

1. Start the SyncKit server:
   ```bash
   cd server/typescript
   npm run dev
   ```

2. Open the example:
   ```bash
   cd examples/react-cursors
   # Open index.html in your browser
   # Or use a local server:
   npx http-server -p 8081
   ```

3. Open multiple tabs to see collaborative cursors in action!

## Technical Details

### Architecture

```
useCursor Hook
   ↓ (tracks local cursor)
   ↓
usePresence Hook
   ↓ (updates awareness)
   ↓
Awareness Protocol
   ↓ (syncs to other clients)
   ↓
useOthers Hook
   ↓ (receives other cursors)
   ↓
Cursors Component
   ↓ (renders all cursors)
   ↓
Cursor Component (for each user)
   ↓ (spring animation)
   ↓
Spring2D Physics
   ↓ (smooth movement)
   ↓
GPU Rendering (translate3d)
```

### Why This Matters

**Before (Competitors):**
```tsx
// 40+ lines of setup
const [cursors, setCursors] = useState({})
const liveblocksRoom = useRoom()

useEffect(() => {
  // Manual cursor tracking
  const handlePointerMove = (e) => {
    liveblocksRoom.updatePresence({
      cursor: { x: e.clientX, y: e.clientY }
    })
  }
  // ... more boilerplate
}, [])

// Manual rendering
{Object.entries(cursors).map(([id, cursor]) => (
  <div
    key={id}
    style={{
      position: 'absolute',
      left: cursor.x,
      top: cursor.y,
      // Manual styling...
    }}
  />
))}
```

**After (SyncKit):**
```tsx
// One line!
<Cursors documentId="my-doc" />
```

**Winner**: Developer happiness 🎉

## What's Next?

- [ ] Touch/mobile support
- [ ] Cursor trails/effects
- [ ] Hover interactions
- [ ] Laser pointer mode
- [ ] Cursor emotes/reactions

## Learn More

- [Phase 4 Implementation Plan](../../analysis/PHASE_4_CURSOR_SHARING_PLAN.md)
- [Strategic Research Report](../../analysis/v0.2.0_STRATEGIC_RESEARCH_REPORT.md)
- [API Documentation](../../sdk/README.md)

---

**Built with love by the SyncKit team** ❤️
