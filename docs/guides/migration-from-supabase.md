# Migrating from Supabase Realtime to SyncKit

A comprehensive guide for adding true offline-first capabilities to your Supabase application with SyncKit.

---

## Table of Contents

1. [What Supabase Does Exceptionally Well](#what-supabase-does-exceptionally-well)
2. [When to Add SyncKit to Supabase](#when-to-add-synckit-to-supabase)
3. [Supabase vs SyncKit Comparison](#supabase-vs-synckit-comparison)
4. [Migration Considerations](#migration-considerations)
5. [Core Concepts Mapping](#core-concepts-mapping)
6. [Code Migration Patterns](#code-migration-patterns)
7. [Hybrid Architecture Option (Recommended)](#hybrid-architecture-option-recommended)
8. [Testing & Validation](#testing--validation)
9. [Deployment Strategy](#deployment-strategy)

---

## What Supabase Does Exceptionally Well

Supabase is a powerful backend-as-a-service that handles infrastructure so you can focus on building features:

**Strengths:**
- **Managed Postgres:** Production-ready database with automatic backups, scaling, and maintenance
- **Built-in Authentication:** Email, OAuth providers, magic links, phone auth—all handled
- **Row-Level Security:** Postgres RLS provides granular access control at the database level
- **File Storage:** S3-compatible storage with automatic image optimization
- **Edge Functions:** Deploy serverless Deno functions globally
- **Realtime:** Postgres CDC (Change Data Capture) broadcasts database changes
- **Dashboard:** Beautiful UI for managing database, auth, storage, and more
- **Pricing:** Free tier is generous, $25/month for production apps
- **Developer Experience:** Excellent docs, CLI tools, and local development setup

**What makes Supabase special:**

Supabase gives you a complete backend infrastructure in minutes. No server management, no DevOps complexity—just a Postgres connection string and you're building features. The integration between Auth, Database, and Storage is seamless.

**If you need managed infrastructure and don't require offline-first functionality, stick with Supabase.**

---

## When to Add SyncKit to Supabase

Supabase Realtime is excellent for online applications. However, some scenarios benefit from adding offline-first capabilities:

### Scenario 1: Mobile Applications

Mobile users frequently encounter:
- Spotty network connections (subway, elevators, rural areas)
- Airplane mode
- Network switching (WiFi ↔ cellular)
- High latency connections

**SyncKit benefit:** Works perfectly offline, syncs when connection returns.

### Scenario 2: Collaborative Editing

Supabase Realtime broadcasts changes, but doesn't include:
- Rich text editing with proper conflict resolution
- Cross-tab undo/redo
- Operational transforms for text
- Cursor presence and tracking

**SyncKit benefit:** Includes Peritext rich text, cross-tab undo, and awareness out of the box.

### Scenario 3: Instant User Experience

Database round-trips add latency:
- Supabase query: ~50-200ms (network + database)
- Local IndexedDB read: <5ms

**SyncKit benefit:** Instant reads from local cache, background sync.

### Scenario 4: Cost Optimization at Scale

Supabase charges for:
- Database compute (based on size)
- Realtime connections
- Bandwidth

**SyncKit benefit:** Self-hosted, no per-user costs. Keep Supabase Auth/Storage, move sync to SyncKit.

---

## Supabase vs SyncKit Comparison

Both handle real-time data, but optimize for different scenarios:

| Feature | Supabase | SyncKit v0.2.0 | Notes |
|---------|----------|----------------|-------|
| **Offline Support** | Limited (cache only) | ✅ Native offline-first | Supabase: read-only cache. SyncKit: full offline writes. |
| **Real-Time Sync** | ✅ Postgres CDC | ✅ WebSocket-backed | Both work well online. |
| **Database** | ✅ Managed Postgres | Bring your own | Supabase handles infrastructure. SyncKit: you choose backend. |
| **Auth** | ✅ Built-in (email, OAuth, phone) | JWT-based (BYO) | Supabase has comprehensive auth. SyncKit focuses on sync. |
| **Row-Level Security** | ✅ Postgres RLS | Server-side validation | Supabase: database-level security. SyncKit: server validation. |
| **Bundle Size** | ~45KB | **154KB** (46KB lite) | Supabase is smaller. SyncKit includes text, rich text, undo, presence. |
| **Pricing** | $0-$25/mo (managed) | Self-hosted (free) | Supabase: managed convenience. SyncKit: self-hosted control. |
| **Mobile-Ready** | Online-first | ✅ Offline-first | Supabase needs connection. SyncKit works offline. |
| **Ecosystem** | ✅ Full-stack (Storage, Edge, etc.) | Sync only | Supabase is complete. SyncKit specializes in sync. |
| **Rich Text** | Build your own | ✅ Peritext + Quill | SyncKit includes collaborative rich text. |
| **Undo/Redo** | Build your own | ✅ Cross-tab | SyncKit's undo works across tabs. |

### The Hybrid Approach (Recommended)

Don't choose one—use both:

```typescript
// Use Supabase for what it does best
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const { data: { user } } = await supabase.auth.getUser()

// Use SyncKit for offline-first data
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app',
  serverUrl: 'ws://localhost:8080'  // Optional: enables network sync
})
await sync.init()

// Supabase Storage for files
await supabase.storage.from('avatars').upload('avatar.png', file)

// SyncKit for offline-first documents
const todo = sync.document<Todo>('todo-1')
await todo.update({ completed: true })  // Works offline!
```

**Best of both worlds:**
- ✅ Supabase Auth, Storage, Edge Functions
- ✅ SyncKit offline-first data sync
- ✅ Minimal code changes
- ✅ Keep managed infrastructure where it helps

---

## Migration Considerations

### Strategy 1: Hybrid Architecture (Recommended)

Keep Supabase for backend, add SyncKit for offline:

```
┌─────────────────────────────────────┐
│         Your Application            │
└─────────────────────────────────────┘
         ↓                    ↓
┌────────────────┐    ┌───────────────┐
│    SyncKit     │    │   Supabase    │
│  (Offline)     │    │  (Backend)    │
└────────────────┘    └───────────────┘
         ↓                    ↓
┌────────────────┐    ┌───────────────┐
│   IndexedDB    │    │   Postgres    │
└────────────────┘    └───────────────┘
```

**Benefits:**
- ✅ Keep Supabase Auth, Storage, Edge Functions
- ✅ Add offline capability with SyncKit
- ✅ Minimal code changes
- ✅ Best of both worlds

**Use cases:**
- Mobile apps requiring offline
- Apps with spotty connectivity
- Apps needing instant UX

### Strategy 2: Full Migration to SyncKit

Replace Supabase Realtime entirely:

```
┌─────────────────────────────────────┐
│         Your Application            │
└─────────────────────────────────────┘
                ↓
        ┌───────────────┐
        │    SyncKit    │
        └───────────────┘
                ↓
        ┌───────────────┐
        │  Your Backend │
        │  (Node/Bun)   │
        └───────────────┘
                ↓
        ┌───────────────┐
        │   Postgres    │
        │  (self-hosted)│
        └───────────────┘
```

**Benefits:**
- ✅ Full control over stack
- ✅ No vendor dependencies
- ✅ Potential cost savings

**Trade-offs:**
- ⚠️ Lose Supabase managed Auth, Storage, etc.
- ⚠️ More infrastructure to manage
- ⚠️ Longer migration time

**When to use:**
- Need complete data sovereignty
- Already have backend infrastructure
- Cost optimization required

---

## Core Concepts Mapping

### Supabase Channels → SyncKit Documents

**Supabase:**
```typescript
const channel = supabase
  .channel('room-1')
  .on('broadcast', { event: 'message' }, (payload) => {
    console.log('Message:', payload)
  })
  .subscribe()
```

**SyncKit:**
```typescript
const room = sync.document<Room>('room-1')
room.subscribe((data) => {
  console.log('Room updated:', data)
})
```

### Supabase Realtime Subscriptions → SyncKit subscribe()

**Supabase:**
```typescript
const subscription = supabase
  .from('todos')
  .on('INSERT', (payload) => {
    console.log('New todo:', payload.new)
  })
  .on('UPDATE', (payload) => {
    console.log('Updated todo:', payload.new)
  })
  .on('DELETE', (payload) => {
    console.log('Deleted todo:', payload.old)
  })
  .subscribe()
```

**SyncKit:**
```typescript
const todo = sync.document<Todo>('todo-1')
todo.subscribe((data) => {
  // Fires on any change (insert, update, delete)
  console.log('Todo changed:', data)
})
```

### Supabase Insert/Update → SyncKit update()

**Supabase:**
```typescript
// Insert
const { data, error } = await supabase
  .from('todos')
  .insert({ text: 'Buy milk', completed: false })

// Update
const { data, error } = await supabase
  .from('todos')
  .update({ completed: true })
  .eq('id', todoId)
```

**SyncKit:**
```typescript
// Set (similar to insert)
await sync.document<Todo>(todoId).update({
  id: todoId,
  text: 'Buy milk',
  completed: false
})

// Update (partial)
await sync.document<Todo>(todoId).update({
  completed: true
})
```

---

## Code Migration Patterns

### Pattern 1: Real-Time Subscription

**Before (Supabase):**
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function TodoComponent({ id }: { id: string }) {
  const [todo, setTodo] = useState<Todo | null>(null)

  useEffect(() => {
    // Initial fetch
    supabase
      .from('todos')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => setTodo(data))

    // Subscribe to changes
    const subscription = supabase
      .from('todos')
      .on('UPDATE', payload => {
        if (payload.new.id === id) {
          setTodo(payload.new as Todo)
        }
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [id])

  if (!todo) return <div>Loading...</div>

  return <div>{todo.text}</div>
}
```

**After (SyncKit):**
```typescript
import { useSyncDocument } from '@synckit-js/sdk/react'

function TodoComponent({ id }: { id: string }) {
  const [todo, { update }] = useSyncDocument<Todo>(id)

  if (!todo || !todo.text) return <div>Loading...</div>

  return <div>{todo.text}</div>
}
```

Less code, works offline.

### Pattern 2: Broadcasting Messages

**Before (Supabase):**
```typescript
// Client A sends message
await supabase
  .channel('room-1')
  .send({
    type: 'broadcast',
    event: 'message',
    payload: { text: 'Hello!', author: 'Alice' }
  })

// Client B receives message
supabase
  .channel('room-1')
  .on('broadcast', { event: 'message' }, (payload) => {
    console.log('Message:', payload)
  })
  .subscribe()
```

**After (SyncKit):**
```typescript
// Client A sends message
const room = sync.document<Room>('room-1')
await room.init()

const currentData = room.get()
await room.update({
  messages: [
    ...(currentData.messages || []),
    { text: 'Hello!', author: 'Alice', timestamp: Date.now() }
  ]
})

// Client B receives message (automatic)
room.subscribe((data) => {
  console.log('New messages:', data.messages)
})
```

Both work. Supabase broadcasts are ephemeral. SyncKit messages persist.

### Pattern 3: Presence (Who's Online)

**Before (Supabase):**
```typescript
const channel = supabase.channel('room-1')

// Track presence
await channel
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    console.log('Online users:', Object.keys(state))
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user: 'Alice', online_at: new Date() })
    }
  })
```

**After (SyncKit):**
```typescript
const room = sync.document<Room>('room-1')
await room.init()

// Update presence
const currentData = room.get()
await room.update({
  presence: {
    ...(currentData.presence || {}),
    [userId]: {
      user: 'Alice',
      online_at: Date.now(),
      active: true
    }
  }
})

// Subscribe to presence changes
room.subscribe((data) => {
  const onlineUsers = Object.values(data.presence || {}).filter(p => p.active)
  console.log('Online users:', onlineUsers)
})

// Heartbeat to stay "online"
setInterval(async () => {
  const data = room.get()
  await room.update({
    presence: {
      ...(data.presence || {}),
      [userId]: { ...(data.presence?.[userId] || {}), online_at: Date.now() }
    }
  })
}, 30000)  // Every 30 seconds
```

Both handle presence. Supabase is automatic. SyncKit gives you control and works offline.

---

## Hybrid Architecture Option (Recommended)

### Best of Both Worlds: Supabase + SyncKit

Keep Supabase for backend features, add SyncKit for offline:

```typescript
// Use Supabase for auth
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const { data: { user } } = await supabase.auth.getUser()

// Use SyncKit for offline-first data with network sync
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app',
  serverUrl: 'ws://localhost:8080',  // ✅ Enables WebSocket sync
})
await sync.init()

// Use Supabase Storage for files
const { data, error } = await supabase.storage
  .from('avatars')
  .upload('public/avatar1.png', file)

// Use SyncKit for offline-first documents
const todo = sync.document<Todo>('todo-1')
await todo.update({ completed: true })  // Works offline!
```

**Architecture:**

```
┌─────────────────────────────────────────────────┐
│              Your Application                   │
└─────────────────────────────────────────────────┘
    ↓                ↓                ↓
┌──────────┐   ┌──────────┐   ┌──────────────┐
│ Supabase │   │ SyncKit  │   │  Supabase    │
│   Auth   │   │  Sync    │   │  Storage     │
└──────────┘   └──────────┘   └──────────────┘
    ↓                ↓                ↓
┌──────────┐   ┌──────────┐   ┌──────────────┐
│ Supabase │   │IndexedDB │   │  S3 Storage  │
│  Server  │   │ (Local)  │   │  (Supabase)  │
└──────────┘   └──────────┘   └──────────────┘
```

**What to use each for:**
- ✅ Supabase Auth - User authentication
- ✅ Supabase Storage - File uploads
- ✅ Supabase Edge Functions - Serverless functions
- ✅ SyncKit - Offline-first data sync
- ✅ Postgres - Backend database (Supabase managed or self-hosted)

---

## Testing & Validation

### Test Offline Functionality

```typescript
describe('Supabase + SyncKit hybrid', () => {
  test('should work offline with SyncKit', async () => {
    // Initialize both
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const sync = new SyncKit({ storage: 'memory' })
    await sync.init()

    const todo = sync.document<Todo>('todo-1')
    await todo.init()

    // Set initial data
    await todo.update({
      id: 'todo-1',
      text: 'Buy milk',
      completed: false
    })

    // Update works immediately (local-first)
    await todo.update({ completed: true })

    const data = todo.get()
    expect(data.completed).toBe(true)

    // If serverUrl is configured, changes sync automatically to server
    // You can also manually sync to Supabase for hybrid approach:
    await supabase
      .from('todos')
      .update({ completed: true })
      .eq('id', 'todo-1')
  })

  test('Supabase handles auth, SyncKit handles sync', async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const sync = new SyncKit({
      storage: 'indexeddb',
      name: 'my-app',
      serverUrl: 'ws://localhost:8080'  // Optional: enables network sync
    })
    await sync.init()

    // Supabase handles token refresh internally
    // SyncKit operations work independently (local-first)
    const doc = sync.document('test')
    await doc.init()
    await doc.update({ value: 'test' })
  })
})
```

---

## Deployment Strategy

### Phase 1: Add SyncKit (Week 1)

**Goal:** Add SyncKit alongside Supabase (no breaking changes)

```typescript
// Keep existing Supabase code
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Add SyncKit with network sync
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app',
  serverUrl: 'ws://localhost:8080',  // ✅ Enables real-time sync
})
await sync.init()

// Dual-write: Write to both Supabase and SyncKit
async function updateTodo(id: string, updates: Partial<Todo>) {
  const doc = sync.document<Todo>(id)
  await doc.init()

  await Promise.all([
    supabase.from('todos').update(updates).eq('id', id),
    doc.update(updates)
  ])
}
```

**Validation:**
- ✅ SyncKit initialized (local storage working)
- ✅ Network sync working (if serverUrl configured)
- ✅ Dual-write working
- ✅ No user-facing changes

### Phase 2: Migrate Reads to SyncKit (Week 2)

**Goal:** Read from SyncKit for instant UX

```typescript
// Read from SyncKit (instant, offline-first)
const [todo, { update: updateTodo }] = useSyncDocument<Todo>(id)

// Write to both (safety)
async function saveTodo(id: string, updates: Partial<Todo>) {
  const doc = sync.document<Todo>(id)
  await doc.init()
  await Promise.all([
    supabase.from('todos').update(updates).eq('id', id),  // Backup
    doc.update(updates)  // Primary
  ])
}
```

**Validation:**
- ✅ Instant UI updates
- ✅ Offline functionality working
- ✅ Data consistency maintained

### Phase 3: Optional - Optimize (Week 3+)

**Goal:** Reduce complexity if desired

```typescript
// Option A: Keep both (recommended for most apps)
// - Supabase for Auth, Storage, Functions
// - SyncKit for data sync

// Option B: Remove Supabase Realtime if you want
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 0  // Disable realtime
    }
  }
})

// Use only SyncKit for data sync
const [todo, { update }] = useSyncDocument<Todo>(id)
```

**Validation:**
- ✅ Offline functionality added
- ✅ All features working
- ✅ Simplified if Realtime removed

---

## Summary

### What SyncKit Adds to Supabase

When you combine Supabase with SyncKit v0.2.0, you get:

- **True offline-first:** Works on planes, trains, and coffee shops with spotty WiFi
- **Collaborative editing:** Rich text with Peritext, undo/redo that syncs across tabs
- **Live presence:** See who's editing, where they're typing
- **Keep what works:** Supabase Auth, Storage, and Edge Functions stay as-is
- **Bundle: 154KB** for everything (text, rich text, undo, presence, cursors)

### The Hybrid Approach

Don't replace Supabase—extend it:

- ✅ **Supabase Auth** for user authentication
- ✅ **Supabase Storage** for files and media
- ✅ **Supabase Edge Functions** for serverless logic
- ✅ **SyncKit** for offline-first data sync and collaboration

### When to Add SyncKit

| Your Situation | Our Recommendation |
|----------------|-------------------|
| **Building a mobile app** | Add SyncKit—offline is essential on mobile |
| **Users have unreliable internet** | Add SyncKit—spotty connections hurt UX |
| **Need collaborative editing** | Add SyncKit—rich text and presence included |
| **Only need basic CRUD online** | Stick with Supabase—it handles online use cases beautifully |

### Timeline

Most teams integrate SyncKit with Supabase in 2-3 weeks:

1. **Week 1:** Add SyncKit, implement dual-write (zero risk)
2. **Week 2:** Switch reads to SyncKit, test offline scenarios
3. **Week 3:** Optional—optimize based on your needs

Zero downtime. Your users won't notice the switch.

### Next Steps

1. Try the [Getting Started Guide](./getting-started.md)—5 minutes to your first sync
2. Read the [Offline-First Guide](./offline-first.md) for patterns
3. Check out [Rich Text](./rich-text-editing.md) if you need collaborative editing

---

**Supabase for backend, SyncKit for offline. Simple as that. 🚀**
