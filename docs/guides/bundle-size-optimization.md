# Bundle Size Optimization

**Choose the right variant and optimize what you import.**

SyncKit gives you control: use the Default variant (154KB) for complete collaboration features, or optimize down to 46KB with the Lite variant and selective imports. This guide shows you how to get the bundle size you need.

---

## Quick Wins

### 1. Choose the Right Variant

**Default (154KB):** Complete solution with Text CRDT, Rich Text, Undo/Redo, Presence, Cursors, Counters, Sets, and framework adapters.

**Lite (46KB):** Basic sync only (document CRDT, LWW merge, IndexedDB persistence).

```typescript
// Default - Full features (154KB)
import { SyncKit } from '@synckit-js/sdk'

// Lite - Basic sync (46KB)
import { SyncKit } from '@synckit-js/sdk/lite'
```

**When to use each:** See [Choosing a Variant](./choosing-variant.md) for detailed decision guide.

### 2. Import Only What You Need

SyncKit's SDK is tree-shakeable. Import specific functions instead of the entire SDK:

```typescript
// ❌ Imports everything (larger bundle)
import * as SyncKit from '@synckit-js/sdk'

// ✅ Import only what you use (tree-shakes unused code)
import { SyncKit, SyncDocument } from '@synckit-js/sdk'
import { useSyncDocument } from '@synckit-js/sdk/react'
```

### 3. Dynamic Import Framework Adapters

Load framework adapters only when needed:

```typescript
// ❌ Static import (always in bundle)
import { useSyncDocument } from '@synckit-js/sdk/react'

// ✅ Dynamic import (loaded on demand)
const ReactAdapter = await import('@synckit-js/sdk/react')
const { useSyncDocument } = ReactAdapter
```

**Bundle savings:** ~18KB per framework adapter you don't statically import.

### 4. Code Split by Feature

Split rich text features into separate chunks:

```typescript
// main.ts - Core app (always loaded)
import { SyncKit, SyncDocument } from '@synckit-js/sdk'

// editor-page.ts - Rich text page (lazy loaded)
const loadRichText = async () => {
  const { RichText } = await import('@synckit-js/sdk')
  const { useRichText } = await import('@synckit-js/sdk/react')
  return { RichText, useRichText }
}
```

**Bundle savings:** ~80KB for rich text features loaded only when needed.

---

## Bundle Size Breakdown

### Default Variant (154KB gzipped)

| Component | Size (gzipped) | What It Includes |
|-----------|----------------|------------------|
| **Core SDK (JS)** | 13.2 KB | Document API, Storage, Sync manager |
| **WASM Base** | ~50 KB | LWW CRDT, basic operations |
| **Text CRDT (Fugue)** | ~50-70 KB | Collaborative text editing |
| **Rich Text (Peritext)** | ~30 KB | Format operations, span merging |
| **Undo/Redo** | ~15 KB | Cross-tab undo, operation merging |
| **Awareness + Cursors** | ~20 KB | Presence tracking, cursor positions |
| **Framework Adapters** | ~18 KB | React/Vue/Svelte hooks |
| **Total** | **154 KB** | Complete collaboration platform |

### Lite Variant (46KB gzipped)

| Component | Size (gzipped) | What It Includes |
|-----------|----------------|------------------|
| **Core SDK (JS)** | 1.5 KB | Basic document API |
| **WASM Base** | ~44 KB | LWW CRDT only |
| **Total** | **46 KB** | Basic sync (local-only) |

### What Each 108KB Gets You

The difference between Lite (46KB) and Default (154KB) is 108KB. Here's what that 108KB includes:

- **Fugue Text CRDT** - Character-level collaborative editing with conflict resolution
- **Peritext Rich Text** - Bold, italic, colors, links with formatting conflict resolution
- **Undo/Redo** - Cross-tab undo with persistent history
- **Awareness** - See who's online, what they're editing
- **Cursor Sharing** - Live cursor positions and selections
- **Counters & Sets** - Distributed data structures (PN-Counter, OR-Set)
- **Framework Adapters** - React, Vue 3, and Svelte 5 integrations

**Is 108KB worth it?** If you need any of those features, yes. Building them yourself would take months.

---

## Optimization Strategies

### Strategy 1: Variant Selection

Choose based on features needed:

```typescript
// Simple offline app? Use Lite
import { SyncKit } from '@synckit-js/sdk/lite'

// Collaborative editor? Use Default
import { SyncKit } from '@synckit-js/sdk'
```

**Bundle impact:**
- Lite: 46KB
- Default: 154KB
- Difference: 108KB

### Strategy 2: Selective Feature Imports

Import only the CRDTs you use:

```typescript
// Only need basic documents? Import minimal
import { SyncKit, SyncDocument } from '@synckit-js/sdk'
// Bundle: ~60KB (base only, no text/rich text)

// Need text editing? Add Text CRDT
import { SyncKit, SyncText } from '@synckit-js/sdk'
// Bundle: ~110KB (base + text)

// Need rich text? Add RichText
import { SyncKit, RichText } from '@synckit-js/sdk'
// Bundle: ~154KB (base + text + rich text)
```

**Tree-shaking:** Modern bundlers automatically remove unused code. If you never import `RichText`, it won't be in your bundle.

### Strategy 3: Framework Adapter Splitting

Each framework adapter adds ~18KB. Load only what your app uses:

```typescript
// React app - only import React adapter
import { useSyncDocument } from '@synckit-js/sdk/react'
// Bundle: +18KB

// Don't import Vue/Svelte adapters (tree-shaken automatically)
// ❌ import { useSyncDocument } from '@synckit-js/sdk/vue'  // Not imported = not in bundle
```

### Strategy 4: Code Splitting by Route

Split features across pages:

```typescript
// Home page - basic documents only
// Route: /
import { SyncKit, SyncDocument } from '@synckit-js/sdk'

// Editor page - rich text features
// Route: /editor (lazy loaded)
const EditorPage = lazy(() => import('./EditorPage'))

// EditorPage.tsx
import { RichText } from '@synckit-js/sdk'
import { useRichText } from '@synckit-js/sdk/react'
```

**Result:**
- Home page bundle: ~60KB (basic features)
- Editor page bundle: +80KB (loaded on demand)
- Total: 140KB (but only 60KB for home page visitors)

### Strategy 5: Dynamic Imports

Load features on user action:

```typescript
function DocumentEditor() {
  const [richTextLoaded, setRichTextLoaded] = useState(false)

  async function enableRichText() {
    // Load RichText only when user clicks "Enable Formatting"
    const { RichText } = await import('@synckit-js/sdk')
    const { useRichText } = await import('@synckit-js/sdk/react')

    setRichTextLoaded(true)
    // Now rich text features are available
  }

  return (
    <div>
      {!richTextLoaded && (
        <button onClick={enableRichText}>
          Enable Rich Text Formatting
        </button>
      )}
    </div>
  )
}
```

**Bundle savings:** 80KB loaded only when user needs formatting.

---

## Bundler Configuration

### Vite

Vite tree-shakes automatically. No special configuration needed:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split SyncKit into separate chunk
          'synckit-core': ['@synckit-js/sdk'],
          'synckit-react': ['@synckit-js/sdk/react'],
        }
      }
    }
  }
})
```

### Webpack

Enable tree-shaking with production mode:

```javascript
// webpack.config.js
module.exports = {
  mode: 'production',  // Enables tree-shaking
  optimization: {
    usedExports: true,  // Mark unused exports
    sideEffects: false, // Allow aggressive tree-shaking
  }
}
```

### Next.js

Next.js tree-shakes automatically in production:

```javascript
// next.config.js
module.exports = {
  // Tree-shaking enabled by default in production
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@synckit-js/sdk/react': '@synckit-js/sdk/react', // Explicit alias
    }
    return config
  }
}
```

---

## Measuring Bundle Impact

### 1. Analyze Bundle Composition

**Vite:**
```bash
npm run build -- --mode production
npx vite-bundle-visualizer
```

**Webpack:**
```bash
npm install --save-dev webpack-bundle-analyzer
npx webpack-bundle-analyzer dist/stats.json
```

**Next.js:**
```bash
npm install --save-dev @next/bundle-analyzer

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true'
})

module.exports = withBundleAnalyzer({})
```

```bash
ANALYZE=true npm run build
```

### 2. Check Gzipped Size

```bash
# Build for production
npm run build

# Check gzipped size
gzip -9 < dist/assets/index-*.js | wc -c
```

### 3. Compare Variants

```bash
# Build with Default
import { SyncKit } from '@synckit-js/sdk'
npm run build
# Output: 154KB gzipped

# Build with Lite
import { SyncKit } from '@synckit-js/sdk/lite'
npm run build
# Output: 46KB gzipped
```

---

## Real-World Examples

### Example 1: Todo App (Lite Variant)

**Requirements:** Basic document sync, offline support, no collaboration features.

```typescript
// Use Lite variant (vanilla JS API)
import { SyncKit } from '@synckit-js/sdk/lite'
import { useEffect, useState } from 'react'

function TodoApp() {
  const [todos, setTodos] = useState(null)
  const [syncKit] = useState(() => new SyncKit())

  useEffect(() => {
    const doc = syncKit.document('todos-123')
    doc.subscribe((data) => setTodos(data))
    doc.init()

    return () => doc.unsubscribe()
  }, [])

  const update = (changes) => {
    syncKit.document('todos-123').update(changes)
  }

  // ...
}
```

**Bundle size:** 46KB gzipped
**Why:** No text editing, no rich text, no undo. Just basic document sync.
**Note:** Lite variant doesn't include framework adapters - use vanilla JS API with hooks.

### Example 2: Note-Taking App (Selective Imports)

**Requirements:** Plain text editing, no formatting, offline sync.

```typescript
// Import only Text CRDT (no RichText)
import { SyncKit, SyncText } from '@synckit-js/sdk'
import { useSyncText } from '@synckit-js/sdk/react'

function NotesApp() {
  const [note, { insert, delete: del }] = useSyncText('note-456')
  // ...
}
```

**Bundle size:** ~110KB gzipped
**Why:** Text CRDT included, but no rich text formatting or undo.

### Example 3: Collaborative Document Editor (Default)

**Requirements:** Rich text, undo/redo, cursor sharing, presence.

```typescript
// Use Default variant with all features
import { SyncKit } from '@synckit-js/sdk'
import { useRichText, useUndo, useCursor, useAwareness } from '@synckit-js/sdk/react'

function CollaborativeEditor() {
  const [ranges, richTextActions] = useRichText('doc-789')
  const { undo, redo } = useUndo('doc-789')
  const [cursors] = useCursor('doc-789')
  const [awareness] = useAwareness('doc-789')
  // ...
}
```

**Bundle size:** 154KB gzipped
**Why:** All collaboration features needed. Worth the size for the functionality.

### Example 4: Hybrid App (Code Splitting)

**Requirements:** Basic views use minimal features, editor page uses rich text.

```typescript
// Home page - Lite features
import { SyncKit } from '@synckit-js/sdk/lite'

// Editor page - Lazy load rich features
const EditorPage = lazy(() => import('./pages/Editor'))

// pages/Editor.tsx
import { RichText } from '@synckit-js/sdk'
import { useRichText, useUndo } from '@synckit-js/sdk/react'
```

**Bundle sizes:**
- Home page: 46KB (Lite variant)
- Editor page: +80KB (loaded on navigation)
- Total: 126KB (but split across pages)

---

## Performance Trade-offs

### Bundle Size vs Development Speed

**Smaller bundle (Lite):**
- ✅ Faster page load
- ❌ More code to write (no built-in text editing, undo, etc.)
- ❌ Longer development time

**Complete solution (Default):**
- ✅ Ship faster (features included)
- ✅ Less code to maintain
- ❌ Larger initial bundle

**Most apps choose Default** because the development time saved (months) outweighs the 108KB bundle cost.

### Bundle Size vs User Experience

**Features users expect:**
- Rich text formatting (bold, italic, links)
- Undo/redo (Ctrl+Z works everywhere)
- Live cursors (see teammates typing)
- Offline support (works without internet)

**The cost:** 154KB gzipped

**Is it worth it?**
- One medium image: ~150KB
- One web font: ~50-100KB
- SyncKit Default: 154KB (complete collaboration)

**Context:** Users happily download megabytes of images. A 154KB library that enables real-time collaboration is a reasonable trade-off.

---

## Common Patterns

### Pattern 1: Start with Default, Optimize Later

```typescript
// Phase 1: Ship fast with Default
import { SyncKit } from '@synckit-js/sdk'

// Phase 2: Profile and optimize after launch
// - Use bundle analyzer to find large dependencies
// - Code-split features users rarely use
// - Consider Lite variant if features aren't needed
```

**Why:** Premature optimization wastes time. Ship first, measure, then optimize.

### Pattern 2: Lite + Feature Flags

```typescript
// Use Lite, add features behind flags
import { SyncKit } from '@synckit-js/sdk/lite'

if (user.hasPremium) {
  // Dynamically load rich text for premium users
  const { RichText } = await import('@synckit-js/sdk')
}
```

**Bundle savings:** Pay the 108KB cost only for premium users who need it.

### Pattern 3: Gradual Feature Adoption

```typescript
// Week 1: Launch with basic sync (Lite)
import { SyncKit } from '@synckit-js/sdk/lite'

// Week 4: Add text editing (partial Default)
import { SyncKit, SyncText } from '@synckit-js/sdk'

// Week 8: Add rich text (full Default)
import { SyncKit, RichText } from '@synckit-js/sdk'
```

**Why:** Spread bundle growth over time as features are needed.

---

## FAQ

### Q: Is 154KB too large?

**A:** It depends on your app's priorities.

**154KB is reasonable if:**
- You need collaboration features (rich text, undo, cursors)
- Development speed matters (months saved vs 108KB)
- Your app already loads images/fonts of similar size

**Consider optimization if:**
- Bundle size is a top priority (mobile-first, slow networks)
- You only need basic sync (use Lite: 46KB)
- Most users don't use advanced features (code-split)

### Q: Can I get below 46KB?

**A:** Not while keeping the CRDT functionality.

46KB (Lite variant) includes:
- WASM engine (~44KB): Core CRDT operations
- SDK wrapper (~1.5KB): TypeScript API

Removing WASM would eliminate conflict resolution (the whole point of SyncKit).

### Q: How does SyncKit compare?

**Size comparison (gzipped):**
- SyncKit Lite: 46KB (basic sync)
- Yjs: 65KB (minimal core)
- SyncKit Default: 154KB (complete platform)
- Automerge: 300KB+ (complete platform)

SyncKit Lite is competitive for minimal sync. SyncKit Default is competitive for complete platforms.

### Q: Does tree-shaking actually work?

**A:** Yes, if your bundler supports ES modules.

**Test it:**
```typescript
// Import only SyncDocument
import { SyncDocument } from '@synckit-js/sdk'

// Build and check bundle size
npm run build

// RichText, Undo, Cursor, etc. should NOT be in bundle
```

If unused features appear in your bundle, check your bundler configuration (ensure `mode: 'production'` and `sideEffects: false`).

---

## Next Steps

- **[Choosing a Variant](./choosing-variant.md)** - Decide between Default and Lite
- **[Performance Guide](./performance.md)** - Runtime performance optimization
- **[Getting Started](./getting-started.md)** - Quick start guide

---

## Summary

**Key takeaways:**
- Default (154KB) vs Lite (46KB) - choose based on features needed
- Tree-shaking removes unused code automatically
- Code-split features by route or user action
- Dynamic imports load features on demand
- 154KB is reasonable for a complete collaboration platform

**Optimization priorities:**
1. Choose the right variant (Default vs Lite)
2. Import only what you use (tree-shaking)
3. Code-split by route (separate chunks per page)
4. Dynamic import rare features (loaded on demand)

**Remember:** Development speed often matters more than 108KB. Ship fast with Default, optimize later if needed.
