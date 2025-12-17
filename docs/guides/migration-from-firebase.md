# Migrating from Firebase/Firestore to SyncKit

A comprehensive guide for migrating from Firebase/Firestore to SyncKit for true offline-first architecture and infrastructure control.

---

## Table of Contents

1. [What Firebase Does Exceptionally Well](#what-firebase-does-exceptionally-well)
2. [When to Consider SyncKit](#when-to-consider-synckit)
3. [Firebase vs SyncKit Comparison](#firebase-vs-synckit-comparison)
4. [Migration Considerations](#migration-considerations)
5. [Data Model Mapping](#data-model-mapping)
6. [Code Migration Patterns](#code-migration-patterns)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Plan](#deployment-plan)
9. [Common Challenges](#common-challenges)

---

## What Firebase Does Exceptionally Well

Firebase is a complete backend-as-a-service platform that has powered millions of apps:

**Strengths:**
- **Fully Managed Infrastructure:** Zero DevOps—Google handles scaling, backups, security updates, and uptime
- **Generous Free Tier:** Start free, scale as you grow
- **Built-in Authentication:** Email, Google, Facebook, Twitter, phone auth all included
- **Real-time Database & Firestore:** Battle-tested real-time sync used by massive apps
- **Cloud Functions:** Serverless backend code that scales automatically
- **Firebase Storage:** File uploads with automatic CDN distribution
- **Crashlytics & Analytics:** Production debugging and user insights
- **ML Kit:** On-device machine learning without complexity
- **App Distribution:** Beta testing and app delivery
- **Complete Ecosystem:** Everything integrates seamlessly

**What makes Firebase special:**

Firebase lets you ship a production app in hours, not weeks. Authentication, database, file storage, analytics, and serverless functions all work together out of the box. For startups and teams without dedicated DevOps, Firebase removes infrastructure complexity entirely.

**If managed infrastructure and rapid development are your priorities, Firebase is excellent.**

---

## When to Consider SyncKit

Firebase excels at managed infrastructure. However, certain scenarios benefit from SyncKit's approach:

### Scenario 1: Extended Offline Capability

Firebase provides offline persistence, but with limitations:
- Cache-based (not a true local database)
- Storage limits (~40MB in practice)
- Cleared on restart in some configurations

**SyncKit approach:** IndexedDB-based storage (typically ~50GB+), persistent across restarts, true local-first database.

**Consider SyncKit if:** Your users need unlimited offline storage or work extensively without connectivity.

### Scenario 2: Cost Predictability at Scale

Firebase pricing is usage-based:
- Document reads: $0.036 per 100,000
- Document writes: $0.108 per 100,000
- Network egress: $0.12/GB

Costs scale with usage (which is good when starting, but can become unpredictable at scale).

**SyncKit approach:** Self-hosted, predictable infrastructure costs regardless of usage.

**Consider SyncKit if:** You want fixed infrastructure costs or your Firebase bill is becoming unpredictable.

### Scenario 3: Data Sovereignty

Firebase stores data on Google Cloud:
- Data center locations are limited
- Google's infrastructure and compliance
- Vendor-managed security

**SyncKit approach:** Host anywhere—your servers, your data centers, your compliance requirements.

**Consider SyncKit if:** You need complete control over data location for regulatory compliance (GDPR, HIPAA, etc.).

### Scenario 4: Query Flexibility

Firestore has specific query constraints:
- Range filters on single field only
- OR queries require `IN` (limited to 10 values)
- No native full-text search
- No JOIN operations

**SyncKit approach:** Use your own database (Postgres, MySQL, SQLite) with full SQL capabilities.

**Consider SyncKit if:** Firestore's query limitations are blocking features you need.

---

## Firebase vs SyncKit Comparison

Both handle real-time data, but optimize for different priorities:

| Feature | Firebase | SyncKit v0.2.0 | Notes |
|---------|----------|----------------|-------|
| **Offline Support** | Cache-based (~40MB) | ✅ True local database (unlimited) | Firebase: limited cache. SyncKit: persistent storage. |
| **Pricing** | Usage-based ($0.036/100k reads) | Self-hosted (fixed) | Firebase: scales with usage. SyncKit: predictable costs. |
| **Infrastructure** | ✅ Fully managed | Self-hosted | Firebase: zero DevOps. SyncKit: you manage it. |
| **Auth** | ✅ Built-in (many providers) | JWT-based (BYO) | Firebase has comprehensive auth. SyncKit: bring your own. |
| **Bundle Size** | ~150-200KB | **154KB** (46KB lite) | Comparable sizes. |
| **Query Capabilities** | Firestore queries | Your database (SQL, etc.) | Firebase: Firestore API. SyncKit: full database power. |
| **Cloud Functions** | ✅ Built-in serverless | Use your backend | Firebase: integrated. SyncKit: you build it. |
| **File Storage** | ✅ Built-in CDN | Use S3/your solution | Firebase: managed. SyncKit: bring your own. |
| **Ecosystem** | ✅ Complete (Analytics, ML, etc.) | Sync only | Firebase is full-stack. SyncKit specializes in sync. |
| **Data Sovereignty** | Google Cloud only | ✅ Host anywhere | Firebase: Google's infrastructure. SyncKit: your control. |
| **Rich Text** | Build your own | ✅ Peritext + Quill | SyncKit includes collaborative editing. |
| **Undo/Redo** | Build your own | ✅ Cross-tab | SyncKit's undo syncs across tabs. |

### Trade-offs Summary

**Firebase gives you:**
- Managed infrastructure (no servers to manage)
- Complete ecosystem (auth, storage, functions, analytics)
- Rapid development (ship faster)

**SyncKit gives you:**
- Cost predictability (self-hosted)
- Unlimited offline capability
- Data sovereignty (host anywhere)
- No vendor lock-in

---

## Migration Considerations

### Pre-Migration Checklist

**Assess your Firebase usage:**

```bash
# Check Firebase usage
firebase projects:list
firebase apps:list
firebase firestore:indexes

# Analyze billing
# Visit Firebase Console → Usage and Billing → View detailed usage
```

**Questions to answer:**

1. **Data volume:** How many documents? Total size?
2. **Read/write patterns:** Reads per day? Writes per day?
3. **Current costs:** Monthly Firebase bill? Is it predictable?
4. **Offline requirements:** Do users need unlimited offline?
5. **Team readiness:** DevOps resources for self-hosting?
6. **Ecosystem usage:** Using Cloud Functions, Storage, Analytics?

### Migration Strategies

#### Strategy 1: Gradual Migration (Recommended)

Run Firebase and SyncKit **side-by-side** during transition:

```typescript
// Hybrid mode: Read from SyncKit, write to both
async function updateTodo(id: string, updates: Partial<Todo>) {
  // Write to both systems
  const doc = sync.document<Todo>(id)
  await doc.init()

  await Promise.all([
    doc.update(updates),  // New system
    firebase.doc(`todos/${id}`).update(updates)  // Old system (backup)
  ])
}

// After migration completes, remove Firebase writes
```

**Timeline:** 2-4 weeks
**Risk:** Low (Firebase as fallback)
**Downtime:** Zero

#### Strategy 2: Big Bang Migration

Migrate all data and code at once:

```bash
# 1. Export Firebase data
firebase firestore:export gs://my-bucket/export

# 2. Transform and import to SyncKit
node scripts/migrate-firebase-to-synckit.js

# 3. Deploy new code with SyncKit
git push production

# 4. Cutover DNS/users
```

**Timeline:** 1 week
**Risk:** High (all or nothing)
**Downtime:** 1-4 hours

#### Strategy 3: Feature-by-Feature

Migrate one feature at a time:

```
Week 1: Migrate todos module
Week 2: Migrate projects module
Week 3: Migrate comments module
...
```

**Timeline:** 4-8 weeks
**Risk:** Medium (complex dual-state management)
**Downtime:** Zero

---

## Data Model Mapping

### Firebase Collection → SyncKit Document

**Firebase:**
```typescript
// Collection structure
todos/
  ├── todo-1
  │   ├── text: "Buy milk"
  │   ├── completed: false
  │   └── createdAt: Timestamp
  └── todo-2
      ├── text: "Buy eggs"
      └── completed: true
```

**SyncKit:**
```typescript
// Document-based structure
sync.document<Todo>('todo-1')
sync.document<Todo>('todo-2')

// Or: Single document with nested structure
sync.document<TodoList>('todos')
// { todos: { 'todo-1': { ... }, 'todo-2': { ... } } }
```

### Firebase onSnapshot → SyncKit subscribe

**Firebase:**
```typescript
const unsubscribe = firebase
  .collection('todos')
  .doc('todo-1')
  .onSnapshot((doc) => {
    console.log('Todo updated:', doc.data())
  })
```

**SyncKit:**
```typescript
const todo = sync.document<Todo>('todo-1')
const unsubscribe = todo.subscribe((data) => {
  console.log('Todo updated:', data)
})
```

### Firebase Transactions → SyncKit Updates

**Firebase:**
```typescript
await firebase.runTransaction(async (transaction) => {
  const todoRef = firebase.collection('todos').doc('todo-1')
  const doc = await transaction.get(todoRef)

  const newCount = doc.data().count + 1
  transaction.update(todoRef, { count: newCount })
})
```

**SyncKit:**
```typescript
const todo = sync.document<Todo>('todo-1')
await todo.init()

const currentData = todo.get()
await todo.update({ count: currentData.count + 1 })

// Note: Uses LWW (Last-Write-Wins) for conflict resolution
```

---

## Code Migration Patterns

### Pattern 1: Real-Time Listener

**Before (Firebase):**
```typescript
import { onSnapshot, doc } from 'firebase/firestore'

function TodoComponent({ id }: { id: string }) {
  const [todo, setTodo] = useState<Todo | null>(null)

  useEffect(() => {
    const todoRef = doc(db, 'todos', id)

    const unsubscribe = onSnapshot(todoRef, (doc) => {
      if (doc.exists()) {
        setTodo({ id: doc.id, ...doc.data() } as Todo)
      }
    })

    return unsubscribe
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

Less code, works offline automatically.

### Pattern 2: Writing Data with Offline Support

**Before (Firebase):**
```typescript
import { doc, setDoc } from 'firebase/firestore'
import { enableIndexedDbPersistence } from 'firebase/firestore'

// Enable offline
await enableIndexedDbPersistence(db)

async function updateTodo(id: string, updates: Partial<Todo>) {
  try {
    await setDoc(
      doc(db, 'todos', id),
      updates,
      { merge: true }
    )
  } catch (error) {
    if (error.code === 'failed-precondition') {
      console.error('Offline persistence failed')
    }
  }
}
```

**After (SyncKit):**
```typescript
// Offline enabled by default
async function updateTodo(id: string, updates: Partial<Todo>) {
  const todo = sync.document<Todo>(id)
  await todo.update(updates)  // Works offline automatically
}
```

Simpler, offline by default.

### Pattern 3: Querying Data

**Before (Firebase):**
```typescript
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'

async function getIncompleteTodos() {
  const q = query(
    collection(db, 'todos'),
    where('completed', '==', false),
    orderBy('createdAt', 'desc'),
    limit(10)
  )

  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
}
```

**After (SyncKit + Your Backend):**
```typescript
// Option 1: Client-side filtering (simple cases)
const todoList = sync.document<TodoList>('todos')
const todos = todoList.get()
const incompleteTodos = Object.values(todos)
  .filter(t => !t.completed)
  .sort((a, b) => b.createdAt - a.createdAt)
  .slice(0, 10)

// Option 2: Server-side queries (complex cases)
// Use your own backend with SQL/NoSQL database
const response = await fetch('/api/todos?completed=false&limit=10')
const todos = await response.json()
```

**Trade-offs:**
- SyncKit doesn't include query language (use your database)
- No Firestore query limitations
- Full SQL power if needed
- Works offline (client-side filtering)

---

## Testing Strategy

### Parallel Testing During Migration

Run Firebase and SyncKit in parallel to verify correctness:

```typescript
describe('Migration parity tests', () => {
  test('Firebase and SyncKit should return same data', async () => {
    const todoId = 'test-todo-1'

    // Read from Firebase
    const firebaseDoc = await firebase
      .collection('todos')
      .doc(todoId)
      .get()
    const firebaseData = firebaseDoc.data()

    // Read from SyncKit
    const synckitDoc = sync.document<Todo>(todoId)
    const synckitData = synckitDoc.get()

    // Should match
    expect(synckitData).toEqual(firebaseData)
  })

  test('Writes should sync to both systems', async () => {
    const todoId = 'test-todo-2'
    const updates = { completed: true }

    // Write to both
    await Promise.all([
      firebase.collection('todos').doc(todoId).update(updates),
      sync.document<Todo>(todoId).update(updates)
    ])

    // Wait for sync
    await new Promise(r => setTimeout(r, 1000))

    // Verify both updated
    const firebaseDoc = await firebase.collection('todos').doc(todoId).get()
    const synckitDoc = sync.document<Todo>(todoId).get()

    expect(firebaseDoc.data().completed).toBe(true)
    expect(synckitDoc.completed).toBe(true)
  })
})
```

### Performance Comparison

```typescript
test('Compare local read performance', async () => {
  // Firebase read
  const firebaseStart = performance.now()
  await firebase.collection('todos').doc('todo-1').get()
  const firebaseDuration = performance.now() - firebaseStart

  // SyncKit read
  const synckitStart = performance.now()
  sync.document<Todo>('todo-1').get()
  const synckitDuration = performance.now() - synckitStart

  console.log(`Firebase: ${firebaseDuration.toFixed(2)}ms`)
  console.log(`SyncKit: ${synckitDuration.toFixed(2)}ms`)
})
```

---

## Deployment Plan

### Phase 1: Dual-Write Setup (Week 1)

**Goal:** Write to both Firebase and SyncKit, read from Firebase

```typescript
// Write to both systems
async function updateTodo(id: string, updates: Partial<Todo>) {
  await Promise.all([
    firebase.collection('todos').doc(id).update(updates),
    sync.document<Todo>(id).update(updates)
  ])
}

// Read from Firebase (existing)
const unsubscribe = firebase
  .collection('todos')
  .doc(id)
  .onSnapshot((doc) => setTodo(doc.data()))
```

**Validation:**
- ✅ SyncKit data matches Firebase
- ✅ No errors in dual-write

### Phase 2: Dual-Read Validation (Week 2)

**Goal:** Read from both, compare results, alert on mismatch

```typescript
async function getTodo(id: string): Promise<Todo> {
  // Get SyncKit data (synchronous)
  const synckitDoc = sync.document<Todo>(id)
  await synckitDoc.init()
  const synckitTodo = synckitDoc.get()

  // Get Firebase data (async)
  const firebaseDoc = await firebase.collection('todos').doc(id).get()
  const firebaseTodo = firebaseDoc.data()

  // Compare
  if (!isEqual(firebaseTodo, synckitTodo)) {
    console.error('Data mismatch!', { firebaseTodo, synckitTodo })
    analytics.track('migration_data_mismatch', { id })
  }

  return firebaseTodo  // Still using Firebase as source of truth
}
```

**Validation:**
- ✅ <1% data mismatches
- ✅ SyncKit performance meets targets

### Phase 3: Cutover to SyncKit (Week 3)

**Goal:** Switch to reading from SyncKit

```typescript
// Read from SyncKit (new)
const [todo, { update }] = useSyncDocument<Todo>(id)

// Write to both (safety)
async function saveTodo(id: string, updates: Partial<Todo>) {
  const doc = sync.document<Todo>(id)
  await doc.init()
  await doc.update(updates)

  // Keep Firebase as backup for 1 week
  await firebase.collection('todos').doc(id).update(updates)
}
```

**Validation:**
- ✅ User experience unchanged
- ✅ Performance improved
- ✅ Offline works correctly

### Phase 4: Cleanup (Week 4)

**Goal:** Remove Firebase dependencies

```typescript
// Remove Firebase writes
async function updateTodo(id: string, updates: Partial<Todo>) {
  await sync.document<Todo>(id).update(updates)
  // Firebase code removed
}

// Uninstall Firebase
npm uninstall firebase
```

**Validation:**
- ✅ No Firebase code remaining
- ✅ Bundle size potentially reduced
- ✅ All features working

---

## Common Challenges

### Challenge 1: Firebase Security Rules → Your Backend Auth

**Firebase:**
```javascript
// Firestore security rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /todos/{todoId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

**SyncKit:**
```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app',
  serverUrl: 'ws://localhost:8080',  // ✅ Enables WebSocket sync
})
await sync.init()

// Implement authentication in your backend API
// SyncKit focuses on sync; you control auth (JWT, sessions, etc.)
```

**Migration approach:**
- Implement authentication in your backend
- SyncKit handles sync, you handle auth

### Challenge 2: Firebase Cloud Functions → Your Backend

**Firebase:**
```typescript
// Cloud Function
exports.onTodoCreate = functions.firestore
  .document('todos/{todoId}')
  .onCreate(async (snap, context) => {
    const todo = snap.data()
    await sendNotification(todo.userId, 'New todo created')
  })
```

**SyncKit:**
```typescript
// Implement in your backend API
app.post('/api/todos', async (req, res) => {
  const todo = req.body

  // Save to your database
  await db.todos.create(todo)

  // Send notification
  await sendNotification(todo.userId, 'New todo created')

  res.json({ success: true })
})
```

**Trade-off:** You manage the backend, but you control the logic.

### Challenge 3: Firebase Hosting → Your Hosting

**Firebase:**
```bash
# Firebase hosting
firebase deploy --only hosting
```

**SyncKit:**
```bash
# Vercel
vercel deploy

# Netlify
netlify deploy

# Or any static hosting
npm run build
aws s3 sync dist/ s3://my-bucket
```

Many excellent alternatives available.

---

## Summary

### What SyncKit v0.2.0 Includes

- **Unlimited offline storage:** IndexedDB-based, not limited cache
- **Collaborative editing:** Rich text with Peritext, undo/redo across tabs
- **Real-time presence:** See who's editing, where they're typing
- **Your infrastructure:** Self-host or deploy anywhere
- **Bundle: 154KB** (Firebase is ~150-200KB, comparable)
- **Cost: Predictable** (self-hosted) vs Firebase's usage-based

### When to Migrate

| Your Situation | Recommendation |
|----------------|----------------|
| **Firebase bill is unpredictable** | Consider SyncKit—fixed infrastructure costs |
| **Need unlimited offline** | Migrate—SyncKit's local-first is unlimited |
| **Data sovereignty required** | Migrate—host anywhere you need |
| **Query limitations blocking you** | Consider SyncKit—use any database |
| **Happy with Firebase** | Stick with it—Firebase is excellent for many use cases |

### Migration Timeline

Most teams complete Firebase migrations in 3-4 weeks:

1. **Week 1:** Set up SyncKit, implement dual-write
2. **Week 2:** Test everything, validate data consistency
3. **Week 3:** Switch traffic to SyncKit
4. **Week 4:** Optional—decommission Firebase

Zero downtime. Gradual rollout. Low risk.

### What You'll Need to Replace

Be realistic about what Firebase provides:

- **Managed infrastructure:** You'll run your own backend
- **Built-in auth:** Use Auth0, Clerk, Supabase Auth, or build your own
- **Cloud Functions:** Move to your backend or edge functions (Vercel, Cloudflare)
- **Firebase Storage:** Use S3, Cloudflare R2, or similar
- **Analytics:** Use your preferred analytics service

If these are critical and working well, maybe Firebase is the right choice. But if costs are unpredictable or you need true offline, SyncKit provides an alternative.

### Next Steps

1. Assess your Firebase usage and costs
2. Try the [Getting Started Guide](./getting-started.md)
3. Set up parallel testing (dual-write)
4. Migrate when ready

---

**Control your infrastructure. Control your costs. 🚀**
