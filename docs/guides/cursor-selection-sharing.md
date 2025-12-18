# Cursor & Selection Sharing

**Show where teammates are typing and what they're selecting in real-time.**

SyncKit's cursor sharing system makes collaborative editing feel natural. See teammate cursors glide smoothly across the screen with spring animations, watch what they select highlighted in real-time, and avoid editing conflicts before they happen.

---

## What You Can Build

- **Collaborative document editors** - See exactly where teammates are typing
- **Design tools** - Track cursor positions on a shared canvas
- **Code editors** - Show teammate selections with syntax highlighting
- **Presentation tools** - Follow the presenter's cursor automatically
- **Multiplayer whiteboards** - Coordinate drawing and annotations

---

## Quick Start

### React

```typescript
import { usePresence, useOthers, useCursorTracking } from '@synckit-js/sdk/react'
import { useRef } from 'react'

function CollaborativeEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [presence, setPresence] = usePresence('doc-123', {
    name: 'Alice',
    color: '#3B82F6',
    cursor: null
  })
  const others = useOthers('doc-123')

  // Track local cursor
  const cursorProps = useCursorTracking({
    mode: 'container',
    containerRef,
    onUpdate: (position) => {
      setPresence({ ...presence, cursor: position })
    }
  })

  return (
    <div ref={containerRef} {...cursorProps}>
      {/* Your content */}
      <ContentEditor />

      {/* Render teammate cursors */}
      {others.map((user) => user.cursor && (
        <Cursor
          key={user.id}
          position={user.cursor}
          color={user.color}
          name={user.name}
        />
      ))}
    </div>
  )
}
```

### Vue 3

```vue
<script setup lang="ts">
import { usePresence, useOthers } from '@synckit-js/sdk/vue'
import { ref, onMounted } from 'vue'

const container = ref<HTMLElement>()
const { presence, setPresence } = usePresence('doc-123', {
  name: 'Alice',
  color: '#3B82F6',
  cursor: null
})
const { others } = useOthers('doc-123')

function handleMouseMove(e: MouseEvent) {
  if (!container.value) return

  const rect = container.value.getBoundingClientRect()
  const cursor = {
    x: e.clientX - rect.left + container.value.scrollLeft,
    y: e.clientY - rect.top + container.value.scrollTop
  }

  setPresence({ ...presence.value, cursor })
}
</script>

<template>
  <div
    ref="container"
    @mousemove="handleMouseMove"
    class="editor"
  >
    <ContentEditor />

    <!-- Teammate cursors -->
    <Cursor
      v-for="user in others"
      :key="user.id"
      v-if="user.cursor"
      :position="user.cursor"
      :color="user.color"
      :name="user.name"
    />
  </div>
</template>
```

### Svelte 5

```svelte
<script lang="ts">
import { awareness } from '@synckit-js/sdk/svelte'

const { self, others, updateSelf } = awareness('doc-123')

let container: HTMLDivElement

function handleMouseMove(e: MouseEvent) {
  if (!container) return

  const rect = container.getBoundingClientRect()
  const cursor = {
    x: e.clientX - rect.left + container.scrollLeft,
    y: e.clientY - rect.top + container.scrollTop
  }

  updateSelf({ cursor })
}
</script>

<div
  bind:this={container}
  onmousemove={handleMouseMove}
  class="editor"
>
  <ContentEditor />

  {#each $others as user}
    {#if user.cursor}
      <Cursor
        position={user.cursor}
        color={user.color}
        name={user.name}
      />
    {/if}
  {/each}
</div>
```

---

## Core Concepts

### Viewport vs Container Modes

SyncKit supports two coordinate systems:

**Viewport Mode** - Coordinates relative to browser viewport
```typescript
// Viewport mode: Good for fullscreen apps, canvases
{ x: 450, y: 300 }  // 450px from left edge, 300px from top edge of viewport
```

**Container Mode** - Coordinates relative to scrollable container
```typescript
// Container mode: Good for scrollable documents, text editors
{ x: 450, y: 2300 }  // 450px from left, 2300px from top (includes scroll offset)
```

**When to use each:**
- **Viewport:** Fullscreen apps, canvases, games, design tools
- **Container:** Scrollable documents, text editors, spreadsheets, code editors

**Why it matters:** If teammates scroll independently (common in docs), container mode ensures cursors stay aligned with content. Viewport mode works when everyone sees the same view.

### Cursor Position Tracking

Track mouse/touch positions automatically:

```typescript
const cursorProps = useCursorTracking({
  mode: 'container',  // or 'viewport'
  containerRef,       // Required for container mode
  onUpdate: (position) => {
    // position = { x: 450, y: 2300 }
    awareness.setLocalCursor(position)
  }
})

// Apply to your container
<div ref={containerRef} {...cursorProps}>
  {/* Cursor tracking active here */}
</div>
```

**What gets tracked:**
- Mouse move events (desktop)
- Touch events (mobile/tablet)
- Automatic throttling (adapts to user count)
- Scroll-aware positioning (container mode)

### Selection Sharing

Share text selections across clients:

```typescript
import { getSelectionFromDOM, serializeSelection } from '@synckit-js/sdk/cursor/selection'

// Capture selection
const selection = getSelectionFromDOM('container', containerElement)
// selection = { rects: [{ x: 100, y: 200, width: 300, height: 20 }] }

// Serialize for sharing (layout-independent)
const serialized = serializeSelection()
// serialized = {
//   startXPath: "/html/body/div[2]/p[1]/text()[1]",
//   startOffset: 15,
//   endXPath: "/html/body/div[2]/p[1]/text()[1]",
//   endOffset: 26
// }

// Share via awareness
awareness.updateSelf({ selection: serialized })

// Deserialize on other client (adapts to their layout)
const remoteSelection = deserializeSelection(serialized)
// Renders correctly even if window size/zoom differs
```

**Selection vs Cursor:**
- **Cursor:** Single point (x, y) - where the mouse is
- **Selection:** Text range (startXPath, endXPath) - what's highlighted

---

## API Reference

### `useCursorTracking(options)`

Hook for automatic cursor position tracking.

**Options:**
- `enabled` (boolean): Enable/disable tracking (default: true)
- `mode` ('viewport' | 'container'): Coordinate system (default: 'viewport')
- `containerRef` (RefObject<HTMLElement>): Container ref (required for container mode)
- `onUpdate` ((position: CursorPosition) => void): Called on cursor move

**Returns:** Props object to spread on container (`{ onMouseMove, onMouseLeave, onTouchStart, ... }`)

**Example:**
```typescript
const cursorProps = useCursorTracking({
  mode: 'container',
  containerRef,
  onUpdate: (pos) => awareness.setLocalCursor(pos)
})

<div ref={containerRef} {...cursorProps} />
```

### `getCursorPosition(event)`

Get cursor position from mouse event (viewport mode).

```typescript
import { getCursorPosition } from '@synckit-js/sdk/cursor/coordinates'

const position = getCursorPosition(mouseEvent)
// Returns: { x: 450, y: 300 }
```

### `getCursorPositionInContainer(event, container)`

Get cursor position relative to container (container mode).

```typescript
import { getCursorPositionInContainer } from '@synckit-js/sdk/cursor/coordinates'

const position = getCursorPositionInContainer(mouseEvent, containerElement)
// Returns: { x: 450, y: 2300 } (includes scroll offset)
```

### `getSelectionFromDOM(mode, container?)`

Capture current text selection as rectangles.

```typescript
import { getSelectionFromDOM } from '@synckit-js/sdk/cursor/selection'

// Viewport mode
const selection = getSelectionFromDOM('viewport')

// Container mode
const selection = getSelectionFromDOM('container', containerElement)

// Returns: { rects: [{ x, y, width, height }, ...], timestamp }
// Or null if no selection
```

### `serializeSelection()`

Serialize selection as XPath (layout-independent).

```typescript
import { serializeSelection } from '@synckit-js/sdk/cursor/selection'

const serialized = serializeSelection()
// Returns: {
//   startXPath: "/html/body/div[2]/p[1]/text()[1]",
//   startOffset: 15,
//   endXPath: "/html/body/div[2]/p[1]/text()[1]",
//   endOffset: 26
// }
```

**Why XPath:** Works across different window sizes, scroll positions, and zoom levels. Each client deserializes to their own layout.

### `deserializeSelection(serialized)`

Convert serialized selection back to visual rectangles.

```typescript
import { deserializeSelection } from '@synckit-js/sdk/cursor/selection'

const selection = deserializeSelection(serializedRange)
// Returns: { rects: [{ x, y, width, height }, ...] }
```

---

## Advanced Features

### Spring Animations

SyncKit uses spring physics for smooth cursor movement:

```typescript
import { createSpring } from '@synckit-js/sdk/cursor/spring'

const springX = createSpring({
  damping: 45,       // Higher = less bounce (default: 45)
  stiffness: 400,    // Higher = snappier (default: 400)
  mass: 1,           // Affects inertia (default: 1)
})

// Update target (cursor moved to x=500)
springX.setTarget(500)

// Animate
function animate() {
  const currentX = springX.update(deltaTime)
  // Smoothly moves toward 500 with spring physics
}
```

**Why springs:** Cursors feel natural and fluid (not robotic linear movement). Google Docs, Figma, and Linear use spring animations for cursors.

**Default config (research-backed):**
- Damping: 45 (reduces oscillation)
- Stiffness: 400 (responsive but not jarring)
- Mass: 1 (standard)

### Adaptive Throttling

Cursor updates throttle automatically based on user count:

```typescript
import { createAdaptiveThrottle } from '@synckit-js/sdk/cursor/throttle'

const throttle = createAdaptiveThrottle({
  minDelay: 16,      // 60 FPS max (1-5 users)
  maxDelay: 200,     // 5 FPS min (50+ users)
  userThresholds: {
    1: 16,   // 1-5 users: 60 FPS
    5: 33,   // 6-10 users: 30 FPS
    10: 50,  // 11-20 users: 20 FPS
    20: 100, // 21-50 users: 10 FPS
    50: 200  // 50+ users: 5 FPS
  }
})

// Throttle updates
throttle.call(userCount, () => {
  awareness.setLocalCursor(position)
})
```

**Why throttle:** With 50 users moving cursors at 60 FPS, that's 3,000 updates/second. Throttling prevents network/CPU saturation.

**How it scales:**
- 1-5 users: Buttery smooth (60 FPS)
- 10-20 users: Still smooth (20-30 FPS)
- 50+ users: Acceptable (5-10 FPS, better than unusable)

### Inactivity Detection

Hide cursors after inactivity:

```typescript
import { createInactivityDetector } from '@synckit-js/sdk/cursor/inactive'

const detector = createInactivityDetector({
  timeout: 5000,        // 5 seconds of no movement
  fadeOutDuration: 300, // 300ms fade out
  onInactive: () => {
    // Hide cursor
    setCursorVisible(false)
  }
})

// Call on cursor move
detector.reset()
```

**Why hide:** Reduces clutter. If someone stops moving their cursor for 5+ seconds, they're probably not actively editing.

### Collision Avoidance

Stack overlapping cursors vertically:

```typescript
import { detectCollisions } from '@synckit-js/sdk/cursor/collision'

const cursors = [
  { id: 'user-a', x: 100, y: 200 },
  { id: 'user-b', x: 105, y: 205 },  // Too close!
  { id: 'user-c', x: 300, y: 400 }
]

const adjusted = detectCollisions(cursors, {
  threshold: 50,    // Collision if within 50px
  stackOffset: 20   // Stack 20px apart
})

// Result:
// user-a: { x: 100, y: 200 }
// user-b: { x: 105, y: 225 }  // Moved down 20px
// user-c: { x: 300, y: 400 }  // No collision
```

**Why avoid:** Overlapping cursor labels are unreadable. Stacking keeps all names visible.

---

## Framework Examples

### React: Animated Cursors

```typescript
import { usePresence, useOthers, useCursorTracking } from '@synckit-js/sdk/react'
import { useRef, useState, useEffect } from 'react'
import { createSpring } from '@synckit-js/sdk/cursor/spring'

function AnimatedCursor({ targetPos, color, name }) {
  const [pos, setPos] = useState(targetPos)
  const springX = useRef(createSpring())
  const springY = useRef(createSpring())

  useEffect(() => {
    springX.current.setTarget(targetPos.x)
    springY.current.setTarget(targetPos.y)

    let rafId: number

    function animate() {
      const x = springX.current.update(16) // 60 FPS
      const y = springY.current.update(16)

      setPos({ x, y })

      if (!springX.current.isAtRest() || !springY.current.isAtRest()) {
        rafId = requestAnimationFrame(animate)
      }
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [targetPos])

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none'
      }}
    >
      {/* Cursor dot */}
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: color,
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />

      {/* Name label */}
      <div
        style={{
          marginTop: 4,
          padding: '2px 6px',
          backgroundColor: color,
          color: 'white',
          fontSize: 12,
          borderRadius: 4,
          whiteSpace: 'nowrap'
        }}
      >
        {name}
      </div>
    </div>
  )
}

function CollaborativeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [presence, setPresence] = usePresence('canvas-123', {
    name: 'Alice',
    color: '#3B82F6',
    cursor: null
  })
  const others = useOthers('canvas-123')

  const cursorProps = useCursorTracking({
    mode: 'container',
    containerRef,
    onUpdate: (position) => {
      setPresence({ ...presence, cursor: position })
    }
  })

  return (
    <div
      ref={containerRef}
      {...cursorProps}
      style={{ position: 'relative', width: '100%', height: '600px' }}
    >
      {/* Canvas content */}
      <CanvasContent />

      {/* Animated teammate cursors */}
      {others.map((user) => user.cursor && (
        <AnimatedCursor
          key={user.id}
          targetPos={user.cursor}
          color={user.color || '#3B82F6'}
          name={user.name || 'Anonymous'}
        />
      ))}
    </div>
  )
}
```

### Vue 3: Selection Highlighting

```vue
<script setup lang="ts">
import { usePresence, useOthers } from '@synckit-js/sdk/vue'
import { ref, computed } from 'vue'
import { getSelectionFromDOM, serializeSelection } from '@synckit-js/sdk/cursor/selection'

const container = ref<HTMLElement>()
const { presence, setPresence } = usePresence('doc-456', {
  name: 'Alice',
  color: '#3B82F6',
  selection: null
})
const { others } = useOthers('doc-456')

// Track selection
function handleSelectionChange() {
  if (!container.value) return

  const selection = getSelectionFromDOM('container', container.value)
  if (selection) {
    const serialized = serializeSelection()
    setPresence({ ...presence.value, selection: serialized })
  } else {
    setPresence({ ...presence.value, selection: null })
  }
}

// Compute teammate selections as highlight rects
const selectionHighlights = computed(() => {
  return others.value
    .filter(user => user.selection)
    .map(user => ({
      id: user.id,
      color: user.color,
      rects: deserializeSelection(user.selection).rects
    }))
})
</script>

<template>
  <div
    ref="container"
    @mouseup="handleSelectionChange"
    @keyup="handleSelectionChange"
    class="editor"
  >
    <ContentEditor />

    <!-- Teammate selection highlights -->
    <div
      v-for="highlight in selectionHighlights"
      :key="highlight.id"
      class="selection-layer"
    >
      <div
        v-for="(rect, i) in highlight.rects"
        :key="i"
        :style="{
          position: 'absolute',
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          backgroundColor: highlight.color,
          opacity: 0.3,
          pointerEvents: 'none'
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.selection-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}
</style>
```

### Svelte 5: Cursor Following

```svelte
<script lang="ts">
import { awareness } from '@synckit-js/sdk/svelte'

const { self, others, updateSelf } = awareness('presentation-789')

let container: HTMLDivElement
let followingUserId: string | null = null

// Follow presenter's cursor
function followUser(userId: string) {
  followingUserId = userId

  // Scroll to their cursor
  const user = $others.find(u => u.id === userId)
  if (user?.cursor && container) {
    container.scrollTo({
      left: user.cursor.x - container.clientWidth / 2,
      top: user.cursor.y - container.clientHeight / 2,
      behavior: 'smooth'
    })
  }
}

// Auto-scroll when following
$: if (followingUserId) {
  const user = $others.find(u => u.id === followingUserId)
  if (user?.cursor && container) {
    container.scrollTo({
      left: user.cursor.x - container.clientWidth / 2,
      top: user.cursor.y - container.clientHeight / 2,
      behavior: 'smooth'
    })
  }
}
</script>

<div class="toolbar">
  <h3>Follow:</h3>
  {#each $others as user}
    <button
      onclick={() => followUser(user.id)}
      class:active={followingUserId === user.id}
    >
      {user.name}
    </button>
  {/each}

  {#if followingUserId}
    <button onclick={() => followingUserId = null}>
      Stop Following
    </button>
  {/if}
</div>

<div bind:this={container} class="editor">
  <PresentationContent />

  {#each $others as user}
    {#if user.cursor}
      <Cursor
        position={user.cursor}
        color={user.color}
        name={user.name}
        isFollowed={followingUserId === user.id}
      />
    {/if}
  {/each}
</div>

<style>
.toolbar button.active {
  background-color: #3B82F6;
  color: white;
}
</style>
```

---

## Troubleshooting

### Cursors Not Appearing

**Problem:** Teammate cursors don't show up.

**Solutions:**

1. **Check awareness connection:**
```typescript
import { useSelf } from '@synckit-js/sdk/react'

const self = useSelf('doc-123')

if (!self) {
  console.log('Not connected to awareness channel')
}
```

2. **Verify cursor data is set:**
```typescript
import { useSelf } from '@synckit-js/sdk/react'

const self = useSelf('doc-123')
console.log('My cursor:', self?.cursor)  // Should not be undefined
```

3. **Check cursor rendering:**
```typescript
import { useOthers } from '@synckit-js/sdk/react'

const others = useOthers('doc-123')
console.log('Others:', others)  // Should see other users
others.forEach(user => {
  console.log(`${user.name}: cursor at`, user.cursor)
})
```

### Cursors Jumping/Teleporting

**Problem:** Cursors jump instead of moving smoothly.

**Cause:** Missing spring animation.

**Solution:** Add spring physics:

```typescript
// ❌ Without spring (jumpy)
setCursorPos(targetPos)

// ✅ With spring (smooth)
const springX = createSpring()
const springY = createSpring()

springX.setTarget(targetPos.x)
springY.setTarget(targetPos.y)

function animate() {
  const x = springX.update(deltaTime)
  const y = springY.update(deltaTime)
  setCursorPos({ x, y })

  if (!springX.isAtRest()) requestAnimationFrame(animate)
}
```

### Selection Highlights Misaligned

**Problem:** Selection highlights don't match actual selected text.

**Cause:** Using viewport mode instead of container mode for scrollable content.

**Solution:**

```typescript
// ❌ Wrong mode for scrollable content
const selection = getSelectionFromDOM('viewport', container)

// ✅ Correct mode
const selection = getSelectionFromDOM('container', container)
```

### Performance Issues (Many Users)

**Problem:** Cursor updates cause lag with 20+ users.

**Solution:** Enable adaptive throttling:

```typescript
import { createAdaptiveThrottle } from '@synckit-js/sdk/cursor/throttle'

const throttle = createAdaptiveThrottle()

// Throttle cursor updates
const cursorProps = useCursorTracking({
  onUpdate: (position) => {
    throttle.call(others.length, () => {
      updateSelf({ cursor: position })
    })
  }
})
```

**Throttling automatically adapts:**
- 1-5 users: 60 FPS (smooth)
- 10-20 users: 20 FPS (acceptable)
- 50+ users: 5 FPS (prevents saturation)

---

## Best Practices

### 1. Use Container Mode for Scrollable Content

```typescript
// ✅ GOOD: Container mode for scrollable docs
const [presence, setPresence] = usePresence('doc-123', { cursor: null })
const cursorProps = useCursorTracking({
  mode: 'container',
  containerRef,
  onUpdate: (pos) => setPresence({ ...presence, cursor: pos })
})

// ❌ BAD: Viewport mode (cursors misalign when scrolling)
const cursorProps = useCursorTracking({
  mode: 'viewport',  // Wrong for scrollable content!
  onUpdate: (pos) => setPresence({ ...presence, cursor: pos })
})
```

### 2. Always Animate Cursors

```typescript
// ✅ GOOD: Spring animation (feels natural)
<AnimatedCursor targetPos={user.cursor} />

// ❌ BAD: Instant movement (robotic, jarring)
<div style={{ left: user.cursor.x, top: user.cursor.y }} />
```

### 3. Hide Inactive Cursors

```typescript
import { createInactivityDetector } from '@synckit-js/sdk/cursor/inactive'

const detector = createInactivityDetector({
  timeout: 5000,
  onInactive: () => setCursorVisible(false)
})
```

### 4. Use Collision Detection for Labels

```typescript
import { detectCollisions } from '@synckit-js/sdk/cursor/collision'

const adjustedCursors = detectCollisions(cursors, {
  threshold: 50,
  stackOffset: 20
})
```

### 5. Throttle Updates with Many Users

```typescript
// Automatically reduce update frequency as user count increases
throttle.call(others.length, () => setPresence({ ...presence, cursor: position }))
```

---

## Next Steps

- **[Awareness & Presence](./awareness-protocol.md)** - User presence tracking (who's online)
- **[Rich Text Editing](./rich-text-editing.md)** - Combine cursors with rich text
- **[API Reference](../api/SDK_API.md#cursor-sharing)** - Complete cursor API

---

## Summary

**What you learned:**
- Viewport vs container coordinate modes
- Cursor position tracking and selection sharing
- Spring animations for smooth movement
- Adaptive throttling for scalability
- Inactivity detection and collision avoidance

**Key takeaways:**
- Use container mode for scrollable content
- Always animate cursors with springs
- XPath-based selection sharing works across layouts
- Throttling prevents performance issues with many users

**Ready to build?** The [Collaborative Editor Example](../../examples/collaborative-editor/) shows cursor sharing in action.
