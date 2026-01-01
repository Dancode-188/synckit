# Conflict Resolution in SyncKit

**v0.2.0 Production Status**

SyncKit v0.2.0 provides complete conflict resolution for all data types:

**Available Now:**
- ✅ **LWW (Last-Write-Wins)** - Automatic conflict resolution for document fields
- ✅ **Text CRDT (Fugue)** - Character-level conflict-free text editing
- ✅ **Rich Text (Peritext)** - Formatting conflicts resolved automatically
- ✅ **PN-Counter** - Distributed counter with conflict-free increment/decrement
- ✅ **OR-Set** - Conflict-free set operations (add/remove)
- ✅ **Network sync** - Real-time conflict resolution across clients
- ✅ **Offline queue** - Conflicts resolve automatically when reconnected
- ✅ **Cross-tab sync** - Conflicts resolved across browser tabs

Learn how SyncKit handles conflicts automatically across all CRDT types.

---

## Table of Contents

1. [What Are Conflicts?](#what-are-conflicts)
2. [Understanding SyncKit's Strategy](#understanding-synckits-strategy)
3. [Common Conflict Scenarios](#common-conflict-scenarios)
4. [Working with Conflicts](#working-with-conflicts)
5. [Text Editing with CRDTs](#text-editing-with-crdts)
6. [Best Practices](#best-practices)
7. [Advanced Topics](#advanced-topics)
8. [Troubleshooting](#troubleshooting)

---

## What Are Conflicts?

A **conflict** occurs when two or more clients make different changes to the same data while disconnected, then sync.

**Note:** In v0.1.0, network sync IS fully available with WebSocket support. The conflict scenarios below demonstrate LWW conflict resolution that happens automatically when clients sync through a server. You can also test conflict resolution manually using `doc.merge()`.

### Visual Example

```
Time →

Client A (Offline):  Task: "Buy milk" → "Buy organic milk"
                                          ↓ (writes locally)

Client B (Offline):  Task: "Buy milk" → "Buy almond milk"
                                          ↓ (writes locally)

Both clients come online and sync...

❓ Which value wins: "Buy organic milk" or "Buy almond milk"?
```

This is a **conflict**—two clients editing the same field with different values.

---

## Understanding SyncKit's Strategy

### Last-Write-Wins (LWW)

SyncKit uses **Last-Write-Wins (LWW)** as the default conflict resolution strategy.

**How it works:**
1. Every update includes a **timestamp** (milliseconds since epoch)
2. When syncing conflicting changes, the **most recent timestamp wins**
3. All clients converge to the same state automatically

```typescript
// Client A updates at 10:00:01.500
await task.update({
  title: 'Buy organic milk'
})  // Timestamp: 1732147201500

// Client B updates at 10:00:02.000 (500ms later)
await task.update({
  title: 'Buy almond milk'
})  // Timestamp: 1732147202000

// After sync: "Buy almond milk" wins (more recent timestamp)
```

### Why LWW?

**Advantages:**
- ✅ **Simple** - Easy to understand and predict
- ✅ **Automatic** - No manual intervention needed
- ✅ **Fast** - O(1) merge complexity
- ✅ **Convergent** - All clients reach same state
- ✅ **No user interruption** - Silent resolution

**Disadvantages:**
- ⚠️ **Data loss possible** - Earlier writes discarded
- ⚠️ **Clock dependency** - Requires synchronized clocks
- ⚠️ **Semantic unaware** - Doesn't understand intent

**When LWW works well:**
- User profile updates
- Task status changes
- Settings and preferences
- UI state (filters, sorting)
- **~95% of real-world conflicts**

**When LWW doesn't work:**
- **Text editing** - Use `sync.text()` (Fugue CRDT) or `sync.richText()` (Peritext) instead
- **Counters** - Use `sync.counter()` (PN-Counter) for distributed counting
- **Sets** - Use `sync.set()` (OR-Set) for add/remove operations
- **Financial calculations** - Need custom logic for precision
- **Cumulative data** - Logs and analytics need append-only structures

---

## Common Conflict Scenarios

### Scenario 1: Simple Field Update

**Most common** - Two users update different fields.

```typescript
interface Task extends Record<string, unknown> {
  id: string
  title: string
  assignee: string
  dueDate: string
}

// Client A (offline)
await task.update({ title: 'New title' })

// Client B (offline)
await task.update({ assignee: 'Bob' })

// After sync: No conflict! Different fields merge automatically
// Result: { title: 'New title', assignee: 'Bob', ... }
```

**Outcome:** ✅ No conflict - Different fields don't conflict

### Scenario 2: Same Field Update

**Conflict** - Two users update the same field.

```typescript
// Client A at 10:00:00
await task.update({ title: 'Buy milk' })

// Client B at 10:00:01
await task.update({ title: 'Buy eggs' })

// After sync: Client B wins (LWW)
// Result: { title: 'Buy eggs', ... }
```

**Outcome:** ⚠️ Conflict resolved by LWW - Client B's value wins

### Scenario 3: Field-Level Granularity

SyncKit resolves conflicts at **field level**, not document level.

```typescript
// Client A (offline)
await task.update({
  title: 'Buy milk',      // gets clock value N
  priority: 'high'        // gets clock value N+1
})
// Note: Each field in update() gets its own incrementing clock value

// Client B (offline, later)
await task.update({
  title: 'Buy eggs',      // gets clock value M (where M > N+1)
  assignee: 'Bob'         // gets clock value M+1
})

// After sync (field-level merge):
// Result: {
//   title: 'Buy eggs',        // Client B wins (M > N)
//   priority: 'high',         // Client A (no conflict with title)
//   assignee: 'Bob'           // Client B (no conflict)
// }
```

**Outcome:** ✅ Only `title` conflicts - other fields merge independently

**Note:** When calling `update()` with multiple fields, each field receives a separate incrementing timestamp internally.

### Scenario 4: Delete vs Update

```typescript
// Client A deletes field
await task.update({ dueDate: null })  // timestamp: 10:00:00

// Client B updates field
await task.update({ dueDate: '2025-12-01' })  // timestamp: 10:00:01

// After sync: Client B wins
// Result: { dueDate: '2025-12-01', ... }
```

**Outcome:** ⚠️ Update wins over delete (LWW)

### Scenario 5: Document Delete vs Update

```typescript
// Client A deletes document (must use sync.deleteDocument())
await sync.deleteDocument('task-123')  // timestamp: 10:00:00

// Client B updates document
const task = sync.document<Task>('task-123')
await task.update({ title: 'Updated' })  // timestamp: 10:00:01

// Note: This scenario demonstrates automatic network sync behavior
// When both clients are connected to the same server, conflicts resolve automatically via LWW
```

**Outcome:** Update wins over delete (LWW). Client B's update at 10:00:01 is newer than Client A's delete at 10:00:00, so the field is restored with "Updated".

**Note:** `doc.delete(field)` deletes a **field**, not the document. Use `sync.deleteDocument(id)` to delete entire documents.

---

## Working with Conflicts

### Default Behavior (Automatic)

By default, SyncKit handles conflicts automatically with LWW:

```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app'
})
await sync.init()  // Required!

const task = sync.document<Task>('task-123')

// All conflicts resolve automatically with LWW - no configuration needed
await task.update({ title: 'New title' })
```

**When to use:** 95% of applications - simple data, clear ownership

**Note:** LWW is built-in and automatic. There is no `conflictResolution` config option in v0.1.0.

### Detecting Conflicts (Future Enhancement)

**Note:** This feature is planned for a future version.

Proposed API for getting notified when conflicts occur:

```typescript
// Proposed API for future version
const task = sync.document<Task>('task-123')

// Subscribe to conflict events
task.onConflict((conflict) => {
  console.log('Conflict detected!')
  console.log('Local value:', conflict.local)
  console.log('Remote value:', conflict.remote)
  console.log('Resolved to:', conflict.resolved)
})
```

**Proposed Conflict object:**
```typescript
// Planned interface for future version
interface Conflict<T> {
  field: keyof T           // Field that conflicted
  local: any               // Your local value
  remote: any              // Remote value from another client
  resolved: any            // Final value after resolution
  localTimestamp: number   // Your timestamp
  remoteTimestamp: number  // Remote timestamp
}
```

### Logging Conflicts (Future Enhancement)

**Note:** This feature is planned for a future version.

Proposed API for tracking conflicts for debugging or analytics:

```typescript
// Proposed API for future version
const conflicts: Conflict[] = []

task.onConflict((conflict) => {
  conflicts.push(conflict)

  // Log to analytics
  analytics.track('conflict_occurred', {
    field: conflict.field,
    documentId: task.getId(),  // Use getId() method
    resolution: 'lww'
  })
})

// Review conflicts
console.log(`${conflicts.length} conflicts in last hour`)
```

### Custom Conflict Handlers (Future Enhancement)

**Note:** This feature is planned for a future version.

Proposed API for implementing custom resolution logic for specific fields:

```typescript
// Proposed API for future version
const task = sync.document<Task>('task-123', {
  conflictHandlers: {
    // Custom handler for priority field
    priority: (local, remote, localTime, remoteTime) => {
      // Always prefer 'critical' priority
      if (local === 'critical' || remote === 'critical') {
        return 'critical'
      }

      // Otherwise use LWW
      return localTime > remoteTime ? local : remote
    },

    // Custom handler for assignee field
    assignee: (local, remote, localTime, remoteTime) => {
      // Never allow unassigning (null)
      if (local === null) return remote
      if (remote === null) return local

      // Otherwise LWW
      return localTime > remoteTime ? local : remote
    }
  }
})
```

**Current workaround:** Conflicts resolve automatically with LWW. For custom logic, implement it in your application code before calling `update()`.

### Manual Conflict Resolution (Future Enhancement)

**Note:** This feature is planned for a future version.

Proposed API for resolving conflicts manually in complex scenarios:

```typescript
// ❌ NOT IMPLEMENTED - This code will NOT work in v0.1.0
task.onConflict(async (conflict) => {  // ❌ onConflict() doesn't exist
  if (conflict.field === 'description') {
    // Show UI for user to choose
    const userChoice = await showConflictDialog({
      local: conflict.local,
      remote: conflict.remote
    })

    // Apply user's choice
    await task.update({
      [conflict.field]: userChoice
    })
  }
})
```

**Current v0.1.0 capability:** You can manually merge documents using `doc.merge(otherDoc)`:

```typescript
// ✅ WORKS IN v0.1.0 - Manual document merging
// Need two separate SyncKit instances to simulate different clients
const syncA = new SyncKit({ storage: 'memory', name: 'client-a' })
const syncB = new SyncKit({ storage: 'memory', name: 'client-b' })
await syncA.init()
await syncB.init()

const docA = syncA.document<Task>('task-123')
const docB = syncB.document<Task>('task-123')

// Make changes to both documents
await docA.update({ title: 'Version A' })
await docB.update({ priority: 'high' })

// Merge docB into docA (LWW resolution applied automatically)
await docA.merge(docB)

console.log(docA.get())  // Has both changes merged
```

---

## Text Editing with CRDTs ✅ AVAILABLE

For **collaborative text editing**, LWW doesn't work—you need a **Text CRDT**. SyncKit v0.2.0 includes both Fugue (plain text) and Peritext (rich text).

### Why LWW Fails for Text

```typescript
// Document: "Hello World"

// Client A inserts at position 6
"Hello World" → "Hello Brave World"

// Client B inserts at position 6
"Hello World" → "Hello Beautiful World"

// LWW result: One insertion lost! ❌
```

### SyncKit Text CRDT (Fugue)

```typescript
// Use Text CRDT for collaborative editing
const doc = sync.text('document-123')

// Subscribe to changes
doc.subscribe((content) => {
  editor.setValue(content)
})

// Both clients insert at position 6
// Client A
await doc.insert(6, 'Brave ')

// Client B
await doc.insert(6, 'Beautiful ')

// Both inserts preserved: "Hello Brave Beautiful World" ✅
```

### Rich Text with Peritext

```typescript
// Use Peritext for formatted text
const doc = sync.richText('document-123')

// Insert formatted text
await doc.insert(0, 'Hello', { bold: true })
await doc.insert(5, ' World', { italic: true })

// Formatting conflicts resolved automatically
```

**Text CRDT guarantees:**
- ✅ **All edits preserved** - No character loss
- ✅ **Conflict-free** - Automatic merge
- ✅ **Convergence** - All clients reach same state
- ✅ **Intention preserved** - Character positions maintained

**[Learn more about Text CRDTs →](rich-text-editing.md)** | **[Counter & Set API →](../api/COUNTER_SET_API.md)**

---

## Best Practices

### 1. Design to Avoid Conflicts

**Minimize conflict surface area:**

```typescript
// ❌ Bad: Single shared description field
interface Task extends Record<string, unknown> {
  id: string
  description: string  // Multiple users editing = conflicts
}

// ✅ Good: Separate comment thread
interface Task extends Record<string, unknown> {
  id: string
  description: string  // Owner only
  comments: Comment[]  // Multiple users can add without conflict
}

interface Comment {
  id: string
  author: string
  text: string
  timestamp: number
}
```

### 2. Use Field-Level Ownership

Assign **ownership** to reduce conflicts:

```typescript
interface Task extends Record<string, unknown> {
  id: string
  title: string        // Creator only
  assignee: string     // Manager only
  status: string       // Assignee only
  notes: string        // Anyone (expect conflicts)
}
```

### 3. Use Timestamps for Ordering

Track when changes happened:

```typescript
interface Task extends Record<string, unknown> {
  id: string
  title: string
  lastEditedBy: string
  lastEditedAt: number  // Helps users understand why value changed
}

await task.update({
  title: 'New title',
  lastEditedBy: currentUser.id,
  lastEditedAt: Date.now()
})
```

### 4. Test Offline Scenarios

**Network sync IS implemented in v0.1.0**, but manual disconnect/reconnect controls are not exposed.

Most conflicts occur when users work offline. Testing approaches:

**Option A: Natural offline testing** (network sync handles automatically):

```typescript
// ✅ WORKS - Network sync with automatic reconnection
async function testConflict() {
  // Both clients connected to same server
  const syncA = new SyncKit({
    serverUrl: 'ws://localhost:8080',
    clientId: 'client-a'
  })
  const syncB = new SyncKit({
    serverUrl: 'ws://localhost:8080',
    clientId: 'client-b'
  })
  await syncA.init()
  await syncB.init()

  const taskA = syncA.document<Task>('task-1')
  const taskB = syncB.document<Task>('task-1')
  await taskA.init()
  await taskB.init()

  // Simulate offline by killing network or server
  // (In real testing: disable WiFi, stop server, or use network throttling)
  // WebSocket will automatically detect disconnection

  // Make conflicting changes while offline
  await taskA.update({ title: 'Version A' })
  await taskB.update({ title: 'Version B' })

  // When network returns, WebSocket automatically reconnects
  // and conflicts resolve via LWW

  // Wait for sync (monitor with syncA.getNetworkStatus())
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Both should converge to same value (LWW)
  const finalA = taskA.get()
  const finalB = taskB.get()

  console.assert(finalA.title === finalB.title, 'Conflict resolution failed')
}
```

**Option B: Manual merge testing** (offline-only, no server needed):

```typescript
// ✅ WORKS IN v0.1.0 - Test manual document merging
async function testMerge() {
  // Create two separate SyncKit instances to simulate different clients
  const syncA = new SyncKit({ storage: 'memory', name: 'client-a' })
  const syncB = new SyncKit({ storage: 'memory', name: 'client-b' })
  await syncA.init()
  await syncB.init()

  const taskA = syncA.document<Task>('task-1')
  const taskB = syncB.document<Task>('task-1')

  // Make conflicting changes
  await taskA.update({ title: 'Version A' })
  await taskB.update({ title: 'Version B' })

  // Manually merge B into A
  await taskA.merge(taskB)

  // Check LWW resolution (later timestamp wins)
  const result = taskA.get()
  console.log('Merged title:', result.title)  // Will be 'Version B' (later timestamp)
}
```

### 5. Show Conflict Indicators (Future Enhancement)

**⚠️ Conflict detection callbacks are not yet implemented in v0.1.0.**

Proposed approach for letting users know when conflicts occurred:

```tsx
// ❌ NOT IMPLEMENTED - This code will NOT work in v0.1.0
function TaskItem({ taskId }: { taskId: string }) {
  const sync = useSyncKit()  // Get SyncKit from context
  const [task, { update }] = useSyncDocument<Task>(taskId)
  const [conflicted, setConflicted] = useState(false)

  useEffect(() => {
    const doc = sync.document<Task>(taskId)
    const unsubscribe = doc.onConflict(() => {  // ❌ onConflict() doesn't exist
      setConflicted(true)
      setTimeout(() => setConflicted(false), 3000)
    })
    return unsubscribe
  }, [taskId, sync])

  return (
    <div className={conflicted ? 'conflicted' : ''}>
      {conflicted && <span>⚠️ Merged with changes from another user</span>}
      <input
        value={task.title || ''}
        onChange={(e) => update({ title: e.target.value })}
      />
    </div>
  )
}
```

**Current v0.1.0 approach:** Conflicts resolve silently with LWW. To show updates, use the `subscribe()` callback:

```tsx
// ✅ WORKS IN v0.1.0 - Show when document updates
function TaskItem({ taskId }: { taskId: string }) {
  const [task, { update }] = useSyncDocument<Task>(taskId)
  const [justUpdated, setJustUpdated] = useState(false)
  const [updateCount, setUpdateCount] = useState(0)

  useEffect(() => {
    // useSyncDocument internally uses subscribe(), so task changes trigger this effect
    // Increment counter on each task change to show update indicator
    if (updateCount > 0) {  // Skip first render
      setJustUpdated(true)
      const timer = setTimeout(() => setJustUpdated(false), 2000)
      return () => clearTimeout(timer)
    }
    setUpdateCount(prev => prev + 1)
  }, [task.title, task.completed, task.assignee])  // Track specific fields that matter

  return (
    <div className={justUpdated ? 'updated' : ''}>
      {justUpdated && <span>✓ Updated</span>}
      <input
        value={task.title || ''}
        onChange={(e) => update({ title: e.target.value })}
      />
    </div>
  )
}
```

---

## Advanced Topics

### Clock Skew Handling

**✅ Network sync is available in v0.1.0**, but uses client-side timestamps.

LWW depends on accurate timestamps. v0.1.0 uses local client clocks, which can have skew:

```typescript
// ✅ WORKS IN v0.1.0 - Uses client timestamps
// Client A: Local time 10:00:00 (clock 5s ahead of actual time)
await task.update({ title: 'A' })  // Timestamp: 10:00:00 (from client's clock)

// Client B: Local time 09:59:55 (clock accurate)
await task.update({ title: 'B' })  // Timestamp: 09:59:55

// Result: Client A wins (has later timestamp due to clock skew)
```

**Current v0.1.0 behavior:**
- Uses local client timestamps via `Date.now()`
- Network sync transmits client timestamps as-is
- Clock skew between clients can affect conflict resolution
- For most applications, this is acceptable (clock skew is usually <1 second)

**Future enhancement (v0.2+):** Server-based timestamp adjustment to eliminate clock skew issues.

### Vector Clocks ✅ IMPLEMENTED IN v0.1.0

**Vector clocks are already implemented** and used internally for causality tracking:

```typescript
// ✅ WORKS IN v0.1.0 - Vector clocks used automatically
// Every operation includes a vector clock for causality tracking

interface VectorClock {
  [clientId: string]: number  // Logical timestamp per client
}

// Example operation:
{
  type: 'set',
  documentId: 'task-123',
  field: 'title',
  value: 'New title',
  clock: { 'client-a': 5, 'client-b': 3 },  // Vector clock
  clientId: 'client-a',
  timestamp: 1732147201500  // Physical timestamp for LWW
}
```

**How it works in v0.1.0:**
- Each client maintains a vector clock (logical timestamps per client)
- Vector clocks track causality relationships between operations
- LWW uses physical timestamps, but vector clocks provide additional metadata
- Used internally for conflict detection and operation ordering

**Note:** While vector clocks are implemented, the conflict resolution algorithm uses LWW (physical timestamps). The vector clock data is available but not exposed in the public API yet.

### Custom CRDT Types

Implement custom CRDTs for specific use cases:

```typescript
// Example: Sum counter (additions never conflict)
class SumCounter {
  private deltas: Map<string, number> = new Map()

  add(clientId: string, amount: number) {
    const current = this.deltas.get(clientId) || 0
    this.deltas.set(clientId, current + amount)
  }

  get value(): number {
    return Array.from(this.deltas.values()).reduce((a, b) => a + b, 0)
  }

  merge(other: SumCounter) {
    // Merge is commutative and associative
    for (const [clientId, delta] of other.deltas) {
      const current = this.deltas.get(clientId) || 0
      this.deltas.set(clientId, Math.max(current, delta))
    }
  }
}
```

---

## Troubleshooting

### Issue: "My changes keep getting overwritten"

**Cause:** Another client editing same field with later timestamp

**Solutions:**
1. **Use field-level ownership** - Assign specific fields to specific users
2. **Implement custom handler** - Preserve important data (planned for future version)
3. **Use optimistic locking** - Warn users about concurrent edits (example below)

```typescript
// ✅ WORKS IN v0.1.0 - Optimistic locking pattern
interface Task extends Record<string, unknown> {
  id: string
  title: string
  version: number  // Increment on every update
}

async function updateTask(sync: SyncKit, task: Task, updates: Partial<Task>) {
  const current = sync.document<Task>(task.id).get()

  if (current.version !== task.version) {
    throw new Error('Task was modified by another user. Please refresh.')
  }

  await sync.document<Task>(task.id).update({
    ...updates,
    version: task.version + 1
  })
}
```

### Issue: "Conflicts not detected" (Future Feature)

**⚠️ Conflict detection callbacks are not yet implemented in v0.1.0.**

**Proposed solution (for future version):**
```typescript
// ❌ NOT IMPLEMENTED - onConflict() doesn't exist in v0.1.0
// Subscribe before making changes
const task = sync.document<Task>('task-123')
task.onConflict((conflict) => {  // ❌ onConflict() doesn't exist
  console.log('Conflict:', conflict)
})

// Now make changes
await task.update({ title: 'New' })
```

**Current v0.1.0:** Conflicts resolve automatically with LWW. Use `doc.subscribe()` to monitor all changes (not just conflicts):
```typescript
// ✅ WORKS IN v0.1.0 - Monitor all document changes
const task = sync.document<Task>('task-123')
task.subscribe((data) => {
  console.log('Document updated:', data)
})
```

### Issue: "Text editing loses characters"

**Cause:** Using LWW for text fields instead of Text CRDT

**Solution:** Use `sync.text()` (Fugue) or `sync.richText()` (Peritext) for collaborative text editing.

**Proposed solution (for future version):**
```typescript
// ❌ Don't use document.update() for collaborative text
await task.update({ description: newText })

// ✅ Use Text CRDT for collaborative editing (NOT YET AVAILABLE)
const description = sync.text('task-123-description')  // ❌ text() doesn't exist
await description.insert(position, newText)
```

**Current v0.1.0 limitations:**
- LWW documents will lose concurrent text edits (last write wins)
- For single-user text editing, LWW is fine
- For collaborative text editing, consider using Yjs or Automerge alongside SyncKit until Text CRDT is implemented

---

## Summary

**Key Takeaways for v0.1.0:**

1. **LWW is automatic** - Conflicts resolve automatically with Last-Write-Wins (built-in, no configuration needed)
2. **Field-level granularity** - Different fields can be updated independently without conflicts
3. **Manual merging available** - Use `doc.merge(otherDoc)` to manually merge documents with LWW resolution
4. **Design to avoid conflicts** - Field-level ownership, separate comment threads
5. **Future features coming** - Conflict callbacks, custom handlers, Text CRDT in later versions

**Key Takeaways for Future Versions:**

3. **Test offline scenarios** - Most conflicts occur when users work offline (requires network sync)
4. **Text is special** - Use Text CRDT for collaborative editing (`sync.text()` or `sync.richText()`)
5. **Know when to intervene** - Custom handlers for business logic (future enhancement)
6. **Show users what happened** - Conflict indicators build trust (requires onConflict callbacks)

**Conflict Resolution Decision Tree:**

```
Is it collaborative text editing?
  → YES: Use sync.text() (Fugue) or sync.richText() (Peritext)
  → NO: Continue

Is it a counter or set?
  → YES: Use sync.counter() (PN-Counter) or sync.set() (OR-Set)
  → NO: Continue

Is data additive (logs, comments)?
  → YES: No conflicts possible (append-only)
  → NO: Continue

Do different users own different fields?
  → YES: No conflicts likely (separate ownership)
  → NO: Continue

Are conflicts acceptable (last write wins)?
  → YES: Use default LWW (automatic with sync.document())
  → NO: Implement custom logic in app code or wait for custom handlers (future version)
```

**Next Steps:**

- Learn about [Performance Optimization](./performance.md)
- Explore [Testing Conflict Scenarios](./testing.md)
- See [Collaborative Editor Example](../../examples/collaborative-editor/)

---

**Conflicts resolved! 🎉**
