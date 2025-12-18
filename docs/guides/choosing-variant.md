# Choosing a SyncKit Variant

**SyncKit has two variants to fit your app's needs.**

Most apps should use **Default** (154KB). It's the complete solution.
Use **Lite** (46KB) only if bundle size is critical and you're okay building features yourself.

---

## Quick Decision

**Building a collaborative app?** → Use Default
**Building a simple offline app?** → Use Lite
**Every kilobyte matters?** → Use Lite (and plan to build more yourself)

---

## Default Variant (Recommended)

**What you can build:**
- Collaborative text editors (Google Docs-style)
- Real-time whiteboards with presence
- Multi-user forms with live cursors
- Offline-first apps that sync perfectly

**What's included:**
- ✅ Rich text editing (Peritext + Fugue CRDTs)
- ✅ Undo/redo across tabs and sessions
- ✅ Live presence and cursor sharing
- ✅ Counters and Sets for app state
- ✅ Framework adapters (React, Vue, Svelte)
- ✅ Network sync with offline queue
- ✅ IndexedDB persistence

**Bundle size:** 154KB gzipped (JavaScript SDK 13.2KB + WASM 141.1KB)

**Trade-off:** You get everything. The bundle is larger than minimal libraries,
but you won't need to add 5 other packages to ship.

**Import:**
```typescript
import { SyncKit } from '@synckit-js/sdk'
```

**Example - Collaborative Editor:**
```typescript
import { SyncKit } from '@synckit-js/sdk'
import { useSyncText, useCursor, usePresence } from '@synckit-js/sdk/react'

const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app',
  serverUrl: 'ws://localhost:8080'  // Optional: enables real-time sync
})
await sync.init()

function CollaborativeEditor() {
  // Text editing with conflict-free convergence
  const [text, { insert, delete: del }] = useSyncText('doc-1')

  // Live presence - see who's online
  const [presence, { update }] = usePresence('room-1')

  // Cursor sharing - see where teammates are typing
  const cursor = useCursor('user-123', {
    name: 'Alice',
    color: '#3B82F6'
  })

  return <Editor text={text} cursor={cursor} />
}

// ✅ Rich text formatting with conflict resolution
// ✅ Undo/redo syncs across tabs
// ✅ See who's online and where they're editing
// ✅ Works offline, syncs when back online
```

**Bundle breakdown:**
- SyncKit Default: 154KB
- React: 156KB
- CodeMirror (optional): 124KB
- **Total:** ~434KB for a complete collaborative editor

Compare this to building it yourself:
- Text CRDT library: ~65KB (Yjs)
- Undo/redo system: Build yourself (weeks of work)
- Presence protocol: Build yourself (weeks of work)
- Cursor sharing: Build yourself (weeks of work)
- Framework adapters: Build yourself (weeks of work)
- Network sync: Build yourself (weeks of work)

**Real-world examples:**
- [Collaborative Editor](../../examples/collaborative-editor/) - Full-featured text editor
- [Project Management](../../examples/project-management/) - Kanban with presence
- [Todo App](../../examples/todo-app/) - Simple CRUD with sync

---

## Lite Variant (Size-Critical Apps)

**What you can build:**
- Simple offline storage apps
- Local-first note-taking (no collaboration)
- Apps where every KB matters

**What's included:**
- ✅ Basic document sync (Last-Write-Wins)
- ✅ IndexedDB persistence
- ✅ Offline-first architecture

**What's NOT included:**
- ❌ No text editing (no Fugue, no Peritext)
- ❌ No network sync (offline only)
- ❌ No undo/redo
- ❌ No presence or cursors
- ❌ No framework adapters

**Bundle size:** 46KB gzipped

**Trade-off:** Smaller bundle, but you'll build collaboration features yourself.

**Import:**
```typescript
import { SyncKit } from '@synckit-js/sdk/lite'
```

**Example - Local-Only Todo App:**
```typescript
import { SyncKit } from '@synckit-js/sdk/lite'

const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'todo-app'
})
await sync.init()

const todo = sync.document<Todo>('todo-1')
await todo.update({
  text: 'Buy milk',
  completed: false
})

// ✅ Local storage with IndexedDB
// ✅ Offline-first, instant writes
// ❌ NO real-time sync (use Default for that)
// ❌ NO text editing (use Default for that)
```

**Bundle:** SyncKit Lite (46KB) + React (156KB) = ~202KB total

**When it makes sense:**
- Browser extensions (strict size limits)
- Embedded widgets (minimal footprint)
- Local-only apps (no server ever)
- You have time to build collaboration yourself

---

## How to Choose

### Choose Default if:
- ✅ You need real-time collaboration (recommended!)
- ✅ You want server sync
- ✅ You're building any production app
- ✅ You value shipping fast over minimizing bytes

### Choose Lite if:
- ⚠️ Bundle size is absolutely critical (e.g., embedded widget)
- ⚠️ You only need local storage (no server sync)
- ⚠️ You're comfortable building collaboration features yourself
- ⚠️ You understand the limitations

### Still unsure?

**Start with Default.** You can always switch to Lite later if needed.
Most apps need collaboration eventually—Default saves you from rebuilding.

---

## Switching Variants

Switching is seamless - just change the import:

```typescript
// Before (Lite)
import { SyncKit } from '@synckit-js/sdk/lite'

// After (need collaboration features)
import { SyncKit } from '@synckit-js/sdk'

// All core APIs remain the same!
```

**Important:** Don't mix imports from different variants in the same app:

```typescript
// ❌ BAD: Imports from multiple variants (duplicates WASM)
import { SyncKit } from '@synckit-js/sdk'
import { SyncDocument } from '@synckit-js/sdk/lite'

// ✅ GOOD: Import everything from one variant
import { SyncKit, SyncDocument } from '@synckit-js/sdk'
```

**Migration is non-breaking:**
- Data format is the same across both variants
- A document created with Lite works with Default
- Upgrade anytime without data migration

---

## Bundle Size Breakdown

| Variant | Total (gzipped) | What You Get |
|---------|-----------------|--------------|
| **Lite** | **46KB** | Basic sync (local-only) |
| **Default** | **154KB** | Text + Rich Text + Undo + Presence + Cursors + Counters + Sets + Framework adapters |

**What the extra 108KB gets you:**
- Fugue Text CRDT (~50-70KB)
- Peritext Rich Text (~30KB)
- Undo/Redo (~15KB)
- Awareness + Cursors (~20KB)
- Framework adapters (~18KB)

**Is 108KB worth it?** If you need any of those features, yes. Building them yourself would take months.

---

## How SyncKit Fits the Ecosystem

Different libraries make different trade-offs:

| Library | Bundle Size | What You Get | Best For |
|---------|-------------|--------------|----------|
| SyncKit Lite | 46KB | Basic sync | Size-critical apps |
| Yjs | 65KB | Minimal core | Text editing, DIY rest |
| SyncKit Default | 154KB | Complete solution | Production apps |
| Automerge | 300KB+ | Complete solution | Feature-rich apps |

**When to choose SyncKit:**
- You want rich text, undo/redo, cursors, and framework adapters included
- You value shipping fast over optimizing every byte
- You need Vue or Svelte support (not just React)

**When to choose alternatives:**
- **Yjs:** Minimal core is your #1 priority (but you'll DIY undo, presence, and frameworks).
- **Automerge:** Need JSON patching or unique Automerge features

---

## Common Scenarios

### Scenario 1: Collaborative Document Editor

**Recommended:** Default variant

**Why:**
- Need rich text editing
- Need undo/redo
- Need presence and cursors
- All features included

**Bundle:** SyncKit (154KB) + React (156KB) + CodeMirror (124KB) = ~434KB total

**Example:** [Collaborative Editor](../../examples/collaborative-editor/)

---

### Scenario 2: Todo App with Real-Time Sync

**Recommended:** Default variant

**Why:**
- Multi-user collaboration
- Cross-device sync
- Framework adapters included

**Bundle:** SyncKit (154KB) + React (156KB) = ~310KB total

**Example:** [Todo App](../../examples/todo-app/)

---

### Scenario 3: Local-Only Note App

**Recommended:** Lite variant

**Why:**
- No server sync needed
- Size matters
- Simple storage only

**Bundle:** SyncKit Lite (46KB) + React (156KB) = ~202KB total

---

### Scenario 4: Browser Extension (Local Storage)

**Recommended:** Lite variant

**Why:**
- Bundle size is critical for extensions
- Local-only storage
- No collaboration needed

**Bundle:** 46KB (smallest possible)

---

## Best Practices

### 1. Start with Default

Use Default unless you have a specific reason not to.

```typescript
import { SyncKit } from '@synckit-js/sdk'
```

Only consider Lite if:
- Bundle size is absolutely critical
- You're 100% sure you'll never need collaboration

### 2. Don't Over-Optimize

**Rule of thumb:**
- Unsure? → Use Default
- 108KB difference matters less than months of dev time
- Most users won't notice the difference

### 3. Consider Your Total Bundle

154KB is small in context:
- SyncKit Default: 154KB
- React: 156KB
- Average webpage: 2-3MB
- **Total context matters**

### 4. Profile Your App

Use browser dev tools:

```bash
# Chrome DevTools → Network tab → Filter: WASM
# Look for synckit_core_bg.wasm size
```

---

## FAQ

### Q: Which variant should I use?

**A:** Default for 95% of apps. It has everything you need for production.

### Q: Is 154KB too large?

**A:** Not for a production app. It's roughly the size of one medium hero image. In exchange for that 154KB, you get a fully verified sync engine, rich text, and framework adapters that would take you months to build and test yourself. If every byte counts, use **SyncKit Lite (46KB)**.

### Q: Can I use Lite and add features later?

**A:** Yes, but you'll rebuild what Default already has. Easier to start with Default.

### Q: Will my bundle really be 46KB/154KB?

**A:** Yes, verified with gzip compression. Your total bundle includes SyncKit + React + your code.

### Q: Can I switch variants later?

**A:** Yes! Change the import, rebuild, done. No data migration needed.

---

## Next Steps

Ready to build?

1. **Choose your variant** (Default for most apps)
2. **Install:** `npm install @synckit-js/sdk`
3. **Import:**
   ```typescript
   // Most apps
   import { SyncKit } from '@synckit-js/sdk'

   // Local-only apps
   import { SyncKit } from '@synckit-js/sdk/lite'
   ```
4. **Build:** Follow the [Getting Started Guide](./getting-started.md)

**Recommended reading:**
- [Getting Started Guide](./getting-started.md) - Your first app
- [API Reference](../api/SDK_API.md) - Complete API docs
- [Examples](../../examples/) - Real-world apps

---

## Summary

### Default (Recommended)

```typescript
import { SyncKit } from '@synckit-js/sdk'
```

- **154KB gzipped** - Complete solution
- Rich text, undo/redo, cursors, presence, framework adapters
- Perfect for 95% of applications
- **Use this unless you have a specific reason not to**

### Lite (Size-Optimized)

```typescript
import { SyncKit } from '@synckit-js/sdk/lite'
```

- **46KB gzipped** - Basic sync only
- Local-only, no collaboration features
- Use for offline-first apps without backend
- Build collaboration features yourself

### Decision

| Need collaboration? | Use variant |
|--------------------|-------------|
| Yes or Maybe | Default |
| No, never | Lite |
| Unsure | Default |

**When in doubt, choose Default.** The 108KB difference is worth it for production features.

---

**Still have questions?**
- [GitHub Issues](https://github.com/Dancode-188/synckit/issues)
- [GitHub Discussions](https://github.com/Dancode-188/synckit/discussions)
- Email: danbitengo@gmail.com
