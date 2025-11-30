# Testing Guide for SyncKit Applications

Learn how to comprehensively test offline-first applications with distributed sync.

---

## Table of Contents

1. [Introduction to Testing Sync Applications](#introduction-to-testing-sync-applications)
2. [Unit Testing CRDT Operations](#unit-testing-crdt-operations)
3. [Property-Based Testing for CRDTs](#property-based-testing-for-crdts)
4. [Network Condition Testing](#network-condition-testing)
5. [Chaos Engineering](#chaos-engineering)
6. [Multi-Client E2E Testing](#multi-client-e2e-testing)
7. [Performance and Load Testing](#performance-and-load-testing)
8. [Testing State Management Integration](#testing-state-management-integration)
9. [CI/CD Integration](#cicd-integration)
10. [Debugging and Troubleshooting](#debugging-and-troubleshooting)

---

## Introduction to Testing Sync Applications

### Why Testing Sync is Harder

Distributed sync applications have unique challenges:

| Challenge | Example | Impact |
|-----------|---------|--------|
| **Non-determinism** | Network timing varies | Flaky tests |
| **Concurrency** | Multiple clients editing | Race conditions |
| **State explosion** | Many possible sync states | Hard to cover all cases |
| **Time dependencies** | Conflict resolution based on timestamps | Hard to reproduce |
| **Network failures** | Offline, slow, packet loss | Edge cases missed |

**Traditional testing isn't enough.**

### Testing Philosophy

SyncKit testing follows these principles:

1. **Convergence is non-negotiable** - All clients must reach same state
2. **Network conditions define UX** - Test offline, slow, packet loss
3. **Chaos reveals edge cases** - Deliberately inject failures
4. **Multi-client E2E is critical** - Single-client tests miss sync bugs
5. **Property-based testing catches edge cases** - Generate thousands of scenarios

---

## Unit Testing CRDT Operations

### Testing Document Updates

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { SyncKit } from '@synckit-js/sdk'

describe('Document operations', () => {
  let synckit: SyncKit

  beforeEach(async () => {
    // Use in-memory storage for fast tests
    synckit = new SyncKit({
      storage: 'memory',
      name: 'test',
      clientId: 'test-client'
    })
    await synckit.init()
  })

  test('should create and read document', async () => {
    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    await todo.update({
      id: 'todo-1',
      text: 'Buy milk',
      completed: false
    })

    const data = todo.get()

    expect(data.text).toBe('Buy milk')
    expect(data.completed).toBe(false)
  })

  test('should update document fields', async () => {
    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    await todo.update({
      id: 'todo-1',
      text: 'Buy milk',
      completed: false
    })

    await todo.update({ completed: true })

    const data = todo.get()
    expect(data.completed).toBe(true)
    expect(data.text).toBe('Buy milk')  // Other fields unchanged
  })

  test('should handle partial updates', async () => {
    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    await todo.update({
      id: 'todo-1',
      text: 'Buy milk',
      completed: false,
      priority: 'low'
    })

    // Update only one field
    await todo.update({ priority: 'high' })

    const data = todo.get()
    expect(data.priority).toBe('high')
    expect(data.text).toBe('Buy milk')
    expect(data.completed).toBe(false)
  })

  test('should delete document', async () => {
    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    await todo.update({
      id: 'todo-1',
      text: 'Buy milk',
      completed: false
    })

    // Delete the entire document
    await synckit.deleteDocument('todo-1')

    // Verify document is deleted
    const docs = await synckit.listDocuments()
    expect(docs.includes('todo-1')).toBe(false)
  })
})
```

### Testing Subscriptions

```typescript
describe('Document subscriptions', () => {
  test('should receive updates via subscription', async () => {
    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    // Track received updates
    const updates: Todo[] = []
    const unsubscribe = todo.subscribe(data => {
      updates.push(data)
    })

    // Initial set
    await todo.update({
      id: 'todo-1',
      text: 'Buy milk',
      completed: false
    })

    // Update
    await todo.update({ completed: true })

    // Wait for subscription to fire
    await new Promise(resolve => setTimeout(resolve, 10))

    // Should have received multiple updates
    expect(updates.length).toBeGreaterThanOrEqual(2)
    expect(updates[updates.length - 2].completed).toBe(false)
    expect(updates[updates.length - 1].completed).toBe(true)

    unsubscribe()
  })

  test('should unsubscribe correctly', async () => {
    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    let callCount = 0
    const unsubscribe = todo.subscribe(() => {
      callCount++
    })

    await todo.update({ id: 'todo-1', text: 'Test', completed: false })

    // Unsubscribe
    unsubscribe()

    // This update should NOT trigger callback
    await todo.update({ completed: true })

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(callCount).toBe(2)  // Initial subscribe callback + one update
  })
})
```

### Testing Conflict Resolution

```typescript
describe('LWW conflict resolution', () => {
  test('should resolve conflicts with last-write-wins', async () => {
    const syncA = new SyncKit({
      storage: 'memory',
      name: 'client-a',
      clientId: 'client-a'
    })
    const syncB = new SyncKit({
      storage: 'memory',
      name: 'client-b',
      clientId: 'client-b'
    })
    await syncA.init()
    await syncB.init()

    const todoA = syncA.document<Todo>('todo-1')
    const todoB = syncB.document<Todo>('todo-1')
    await todoA.init()
    await todoB.init()

    // Initial state
    await todoA.update({
      id: 'todo-1',
      text: 'Original',
      completed: false
    })

    // Simulate offline conflict
    await todoA.update({ text: 'Version A' })  // Earlier timestamp
    await new Promise(resolve => setTimeout(resolve, 100))  // Wait 100ms
    await todoB.update({ text: 'Version B' })  // Later timestamp

    // Manually sync (merge documents)
    await todoA.merge(todoB)
    await todoB.merge(todoA)

    // Both should converge to Version B (later timestamp)
    const dataA = todoA.get()
    const dataB = todoB.get()

    expect(dataA.text).toBe('Version B')
    expect(dataB.text).toBe('Version B')
  })

  test('should resolve field-level conflicts independently', async () => {
    const syncA = new SyncKit({
      storage: 'memory',
      name: 'client-a',
      clientId: 'client-a'
    })
    const syncB = new SyncKit({
      storage: 'memory',
      name: 'client-b',
      clientId: 'client-b'
    })
    await syncA.init()
    await syncB.init()

    const todoA = syncA.document<Todo>('todo-1')
    const todoB = syncB.document<Todo>('todo-1')
    await todoA.init()
    await todoB.init()

    // Initial state
    await todoA.update({
      id: 'todo-1',
      text: 'Original',
      completed: false,
      priority: 'low'
    })

    // Client A updates text (earlier)
    await todoA.update({ text: 'A text' })

    await new Promise(resolve => setTimeout(resolve, 50))

    // Client B updates both text and priority (later)
    await todoB.update({ text: 'B text', priority: 'high' })

    // Sync (merge documents)
    await todoA.merge(todoB)
    await todoB.merge(todoA)

    const dataA = todoA.get()
    const dataB = todoB.get()

    // text: B wins (later timestamp)
    expect(dataA.text).toBe('B text')
    expect(dataB.text).toBe('B text')

    // priority: B wins (only B set it)
    expect(dataA.priority).toBe('high')
    expect(dataB.priority).toBe('high')
  })
})
```

---

## Property-Based Testing for CRDTs

### What is Property-Based Testing?

Instead of writing specific test cases, define **properties** that should always hold, then generate thousands of random test cases.

**Example property:** "After syncing, all clients must have identical state"

### Using fast-check

```typescript
import { test } from 'vitest'
import * as fc from 'fast-check'

test('convergence property: all clients converge to same state', async () => {
  await fc.assert(
    fc.asyncProperty(
      // Generate random operations
      fc.array(
        fc.record({
          client: fc.integer({ min: 0, max: 2 }),  // 3 clients
          operation: fc.oneof(
            fc.record({
              type: fc.constant('update'),
              field: fc.constantFrom('text', 'completed', 'priority'),
              value: fc.oneof(
                fc.string(),
                fc.boolean(),
                fc.constantFrom('low', 'medium', 'high')
              )
            }),
            fc.record({
              type: fc.constant('delete')
            })
          ),
          delay: fc.integer({ min: 0, max: 100 })  // Random delay
        }),
        { minLength: 1, maxLength: 50 }
      ),
      async (operations) => {
        // Create 3 clients
        const clients = [
          new SyncKit({ storage: 'memory', name: 'client-0', clientId: 'client-0' }),
          new SyncKit({ storage: 'memory', name: 'client-1', clientId: 'client-1' }),
          new SyncKit({ storage: 'memory', name: 'client-2', clientId: 'client-2' })
        ]

        // Initialize all clients
        await Promise.all(clients.map(c => c.init()))

        const docs = clients.map(c => c.document<Todo>('todo-1'))
        await Promise.all(docs.map(d => d.init()))

        // Apply operations
        for (const op of operations) {
          const doc = docs[op.client]

          if (op.operation.type === 'update') {
            await doc.update({
              [op.operation.field]: op.operation.value
            })
          } else {
            // Delete entire document
            await clients[op.client].deleteDocument('todo-1')
          }

          // Random delay to simulate network jitter
          await new Promise(r => setTimeout(r, op.delay))
        }

        // Sync all clients (manually merge all documents)
        for (let i = 0; i < docs.length; i++) {
          for (let j = i + 1; j < docs.length; j++) {
            await docs[i].merge(docs[j])
            await docs[j].merge(docs[i])
          }
        }

        // PROPERTY: All clients must have identical state
        const states = docs.map(d => d.get())

        for (let i = 1; i < states.length; i++) {
          expect(states[i]).toEqual(states[0])
        }
      }
    ),
    { numRuns: 100 }  // Run 100 random scenarios
  )
})
```

### Commutativity Property

Test that operation order doesn't matter:

```typescript
test('commutativity property: operations can be applied in any order', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          field: fc.string(),
          value: fc.anything()
        }),
        { minLength: 2, maxLength: 10 }
      ),
      async (operations) => {
        const sync1 = new SyncKit({
          storage: 'memory',
          name: 'sync1',
          clientId: 'sync1'
        })
        const sync2 = new SyncKit({
          storage: 'memory',
          name: 'sync2',
          clientId: 'sync2'
        })
        await sync1.init()
        await sync2.init()

        // Apply operations in original order
        const doc1 = sync1.document<any>('test-1')
        await doc1.init()
        for (const op of operations) {
          await doc1.update({ [op.field]: op.value })
        }

        // Apply operations in reverse order
        const doc2 = sync2.document<any>('test-2')
        await doc2.init()
        for (const op of [...operations].reverse()) {
          await doc2.update({ [op.field]: op.value })
        }

        // PROPERTY: Final state should be identical (commutativity)
        const state1 = doc1.get()
        const state2 = doc2.get()

        expect(state1).toEqual(state2)
      }
    )
  )
})
```

### Idempotence Property

Test that applying same operation twice has no additional effect:

```typescript
test('idempotence property: applying operation twice = applying once', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        field: fc.string(),
        value: fc.anything()
      }),
      async (operation) => {
        const synckit = new SyncKit({
          storage: 'memory',
          name: 'test',
          clientId: 'test'
        })
        await synckit.init()
        const doc = synckit.document<any>('test-1')
        await doc.init()

        // Apply once
        await doc.update({ [operation.field]: operation.value })
        const stateAfterOne = doc.get()

        // Apply again
        await doc.update({ [operation.field]: operation.value })
        const stateAfterTwo = doc.get()

        // PROPERTY: State should be identical
        expect(stateAfterTwo).toEqual(stateAfterOne)
      }
    )
  )
})
```

---

## Network Condition Testing

### Testing Network Sync

Test that documents sync correctly with a server:

```typescript
import { SyncKit } from '@synckit-js/sdk'

describe('Network sync', () => {
  test('should sync changes to server', async () => {
    const synckit = new SyncKit({
      storage: 'memory',
      serverUrl: 'ws://localhost:8080',
      clientId: 'test-client'
    })
    await synckit.init()

    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    // Track network status
    const statuses: NetworkStatus[] = []
    synckit.onNetworkStatusChange?.((status) => {
      statuses.push(status)
    })

    // Make changes
    await todo.update({
      id: 'todo-1',
      text: 'Buy milk',
      completed: false
    })

    // Wait for sync
    await waitForSync(synckit, 'todo-1')

    // Check sync state
    const syncState = synckit.getSyncState('todo-1')
    expect(syncState).not.toBeNull()
    expect(syncState?.state).toBe('synced')
  })

  test('should queue operations when offline', async () => {
    const synckit = new SyncKit({
      storage: 'memory',
      serverUrl: 'ws://localhost:8080',
      clientId: 'test-client'
    })
    await synckit.init()

    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    // Make changes (may queue if offline)
    await todo.update({ completed: true })
    await todo.update({ text: 'Updated' })

    // Check network status
    const status = synckit.getNetworkStatus()
    if (status) {
      // Queue size depends on network state
      expect(status.queueSize).toBeGreaterThanOrEqual(0)
      console.log('Queued operations:', status.queueSize)
    }
  })
})

// Helper function to wait for sync
async function waitForSync(
  synckit: SyncKit,
  documentId: string,
  timeout = 5000
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    const state = synckit.getSyncState(documentId)
    if (state && state.state === 'synced') {
      return
    }
    await new Promise(r => setTimeout(r, 100))
  }

  throw new Error(`Timeout waiting for document ${documentId} to sync`)
}

// Helper function to wait for queue to empty
async function waitForQueueEmpty(
  synckit: SyncKit,
  timeout = 5000
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    const status = synckit.getNetworkStatus()
    if (!status || status.queueSize === 0) {
      return
    }
    await new Promise(r => setTimeout(r, 100))
  }

  throw new Error('Timeout waiting for queue to empty')
}
```

### Network Status Monitoring

Test network status change notifications:

```typescript
describe('Network status monitoring', () => {
  test('should track network status changes', async () => {
    const synckit = new SyncKit({
      storage: 'memory',
      serverUrl: 'ws://localhost:8080',
      clientId: 'test-client'
    })
    await synckit.init()

    const statuses: NetworkStatus[] = []

    const unsubscribe = synckit.onNetworkStatusChange?.((status) => {
      statuses.push(status)
      console.log('Network status:', {
        connectionState: status.connectionState,
        queueSize: status.queueSize,
        failedOperations: status.failedOperations
      })
    })

    // Make some operations
    const todo = synckit.document<Todo>('todo-1')
    await todo.init()
    await todo.update({ text: 'Test', completed: false })

    // Wait for status updates
    await new Promise(r => setTimeout(r, 1000))

    // Should have received status updates
    expect(statuses.length).toBeGreaterThan(0)

    unsubscribe?.()
  })

  test('should monitor document sync state', async () => {
    const synckit = new SyncKit({
      storage: 'memory',
      serverUrl: 'ws://localhost:8080',
      clientId: 'test-client'
    })
    await synckit.init()

    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    const syncStates: DocumentSyncState[] = []

    const unsubscribe = synckit.onSyncStateChange?.('todo-1', (state) => {
      syncStates.push(state)
      console.log('Sync state:', state.state)
    })

    // Make changes
    await todo.update({ text: 'Test', completed: false })

    // Wait for sync state changes
    await new Promise(r => setTimeout(r, 1000))

    // Should have received sync state updates
    expect(syncStates.length).toBeGreaterThan(0)

    unsubscribe?.()
  })
})
```

### Network Throttling with Playwright

```typescript
import { chromium } from 'playwright'

test('should handle slow 3G network', async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext()

  // Emulate slow 3G
  await context.route('**/*', route => {
    setTimeout(() => route.continue(), 500)  // 500ms delay
  })

  const page = await context.newPage()
  await page.goto('http://localhost:3000')

  // Perform operations
  await page.click('[data-testid="add-todo"]')
  await page.fill('[data-testid="todo-input"]', 'Test todo')
  await page.click('[data-testid="save"]')

  // Should still work, just slower
  await page.waitForSelector('[data-testid="todo-item"]', { timeout: 10000 })

  await browser.close()
})
```

### Packet Loss Simulation

```typescript
test('should handle 10% packet loss', async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext()

  // Drop 10% of requests randomly
  await context.route('**/*', route => {
    if (Math.random() < 0.1) {
      route.abort()  // Drop packet
    } else {
      route.continue()
    }
  })

  const page = await context.newPage()
  await page.goto('http://localhost:3000')

  // Make 100 updates
  for (let i = 0; i < 100; i++) {
    await page.click(`[data-testid="todo-${i}"]`)
  }

  // All updates should eventually succeed (with retries)
  await page.waitForFunction(() => {
    return document.querySelectorAll('[data-testid*="todo"]').length === 100
  }, { timeout: 30000 })

  await browser.close()
})
```

---

## Chaos Engineering

### Random Failure Injection

Test system resilience with random failures:

```typescript
describe('Chaos engineering', () => {
  test('should handle random network conditions', async () => {
    const synckit = new SyncKit({
      storage: 'memory',
      serverUrl: 'ws://localhost:8080',
      clientId: 'chaos-test'
    })
    await synckit.init()

    const todo = synckit.document<Todo>('todo-1')
    await todo.init()

    // Track all states
    const states: Todo[] = []
    todo.subscribe(data => states.push(data))

    // Perform 100 operations with random delays
    for (let i = 0; i < 100; i++) {
      await todo.update({ counter: i })
      // Random delay to simulate jitter
      await new Promise(r => setTimeout(r, Math.random() * 50))
    }

    // Wait for stabilization
    await new Promise(r => setTimeout(r, 2000))

    // PROPERTY: Final state should be consistent
    const finalState = todo.get()
    expect(finalState.counter).toBe(99)
  })

  test('should handle concurrent updates from multiple clients', async () => {
    // Create 3 clients
    const clients = [
      new SyncKit({
        storage: 'memory',
        serverUrl: 'ws://localhost:8080',
        clientId: 'client-0'
      }),
      new SyncKit({
        storage: 'memory',
        serverUrl: 'ws://localhost:8080',
        clientId: 'client-1'
      }),
      new SyncKit({
        storage: 'memory',
        serverUrl: 'ws://localhost:8080',
        clientId: 'client-2'
      })
    ]

    await Promise.all(clients.map(c => c.init()))

    const docs = clients.map(c => c.document<Todo>('todo-1'))
    await Promise.all(docs.map(d => d.init()))

    // Each client makes rapid updates
    await Promise.all(
      docs.map(async (doc, i) => {
        for (let j = 0; j < 50; j++) {
          await doc.update({ [`client${i}_counter`]: j })
          await new Promise(r => setTimeout(r, Math.random() * 20))
        }
      })
    )

    // Wait for sync
    await new Promise(r => setTimeout(r, 3000))

    // PROPERTY: All clients should converge
    const states = docs.map(d => d.get())

    for (let i = 1; i < states.length; i++) {
      expect(states[i]).toEqual(states[0])
    }
  })
})
```

### Network Partition Testing

Test behavior during network partitions:

```typescript
test('should handle network partition and healing', async () => {
  // Simulate network partition: two groups can't communicate initially
  const groupA = [
    new SyncKit({
      storage: 'memory',
      serverUrl: 'ws://server-a:8080',
      clientId: 'a1'
    }),
    new SyncKit({
      storage: 'memory',
      serverUrl: 'ws://server-a:8080',
      clientId: 'a2'
    })
  ]

  const groupB = [
    new SyncKit({
      storage: 'memory',
      serverUrl: 'ws://server-b:8080',
      clientId: 'b1'
    }),
    new SyncKit({
      storage: 'memory',
      serverUrl: 'ws://server-b:8080',
      clientId: 'b2'
    })
  ]

  await Promise.all([...groupA, ...groupB].map(s => s.init()))

  const docsA = groupA.map(s => s.document<Todo>('todo-1'))
  const docsB = groupB.map(s => s.document<Todo>('todo-1'))
  await Promise.all([...docsA, ...docsB].map(d => d.init()))

  // Both groups make conflicting changes
  await docsA[0].update({ text: 'Group A', priority: 'high' })
  await docsB[0].update({ text: 'Group B', completed: true })

  // Manually sync within groups (simulating partition)
  await docsA[0].merge(docsA[1])
  await docsA[1].merge(docsA[0])
  await docsB[0].merge(docsB[1])
  await docsB[1].merge(docsB[0])

  // Heal partition - merge across groups
  for (const docA of docsA) {
    for (const docB of docsB) {
      await docA.merge(docB)
      await docB.merge(docA)
    }
  }

  // PROPERTY: All clients converge to same state after healing
  const allDocs = [...docsA, ...docsB]
  const states = allDocs.map(d => d.get())

  for (let i = 1; i < states.length; i++) {
    expect(states[i]).toEqual(states[0])
  }
})
```

---

## Multi-Client E2E Testing

### Using Playwright for Multi-Client Tests

```typescript
import { test, chromium } from '@playwright/test'

test('should sync between multiple clients', async () => {
  const browser = await chromium.launch()

  // Create 3 clients
  const clients = await Promise.all([
    browser.newPage(),
    browser.newPage(),
    browser.newPage()
  ])

  // Open app in all clients
  await Promise.all(
    clients.map(page => page.goto('http://localhost:3000'))
  )

  // Client 1: Add a todo
  await clients[0].click('[data-testid="add-todo"]')
  await clients[0].fill('[data-testid="todo-input"]', 'Buy milk')
  await clients[0].click('[data-testid="save"]')

  // Client 2 & 3: Should see the todo appear
  await clients[1].waitForSelector('text=Buy milk', { timeout: 5000 })
  await clients[2].waitForSelector('text=Buy milk', { timeout: 5000 })

  // Client 2: Mark as completed
  await clients[1].click('[data-testid="todo-checkbox"]')

  // Client 1 & 3: Should see completion
  await clients[0].waitForSelector('[data-testid="todo-completed"]', { timeout: 5000 })
  await clients[2].waitForSelector('[data-testid="todo-completed"]', { timeout: 5000 })

  // Client 3: Delete todo
  await clients[2].click('[data-testid="delete-todo"]')

  // Client 1 & 2: Todo should disappear
  await clients[0].waitForSelector('text=Buy milk', { state: 'detached', timeout: 5000 })
  await clients[1].waitForSelector('text=Buy milk', { state: 'detached', timeout: 5000 })

  await browser.close()
})
```

### Concurrent Edit Testing

```typescript
test('should handle concurrent edits gracefully', async () => {
  const browser = await chromium.launch()

  const [client1, client2] = await Promise.all([
    browser.newPage(),
    browser.newPage()
  ])

  await Promise.all([
    client1.goto('http://localhost:3000'),
    client2.goto('http://localhost:3000')
  ])

  // Both clients edit the same field concurrently
  await Promise.all([
    client1.fill('[data-testid="todo-title"]', 'Version 1'),
    client2.fill('[data-testid="todo-title"]', 'Version 2')
  ])

  // Wait for sync
  await new Promise(r => setTimeout(r, 1000))

  // Both should converge to same value (LWW)
  const title1 = await client1.textContent('[data-testid="todo-title"]')
  const title2 = await client2.textContent('[data-testid="todo-title"]')

  expect(title1).toBe(title2)

  await browser.close()
})
```

---

## Performance and Load Testing

### Load Testing with Multiple Clients

```typescript
import { chromium, Page } from 'playwright'

test('should handle 50 concurrent clients', async () => {
  const browser = await chromium.launch()
  const clients: Page[] = []

  // Spawn 50 clients
  for (let i = 0; i < 50; i++) {
    const page = await browser.newPage()
    await page.goto('http://localhost:3000')
    clients.push(page)
  }

  // Each client adds a todo
  await Promise.all(
    clients.map((page, i) =>
      page.evaluate(async (index) => {
        // Assuming synckit is exposed globally or via window
        const synckit = (window as any).synckit
        const doc = synckit.document(`todo-${index}`)
        await doc.init()
        await doc.update({
          id: `todo-${index}`,
          text: `Todo ${index}`,
          completed: false
        })
      }, i)
    )
  )

  // Verify all clients eventually see all todos
  for (const client of clients.slice(0, 5)) {  // Check first 5 clients
    await client.waitForFunction(() => {
      return document.querySelectorAll('[data-testid^="todo-"]').length >= 50
    }, { timeout: 30000 })
  }

  await browser.close()
}, { timeout: 120000 })
```

### Stress Testing

```typescript
test('should handle rapid updates', async () => {
  const synckit = new SyncKit({
    storage: 'memory',
    name: 'stress-test',
    clientId: 'stress-test'
  })
  await synckit.init()

  const todo = synckit.document<Todo>('todo-1')
  await todo.init()

  await todo.update({
    id: 'todo-1',
    text: 'Test',
    completed: false,
    counter: 0
  })

  // 10,000 updates as fast as possible
  const start = performance.now()

  for (let i = 0; i < 10000; i++) {
    await todo.update({ counter: i })
  }

  const duration = performance.now() - start

  console.log(`10,000 updates in ${duration.toFixed(2)}ms`)
  console.log(`${(10000 / duration * 1000).toFixed(0)} ops/sec`)

  // Verify final state
  const data = todo.get()
  expect(data.counter).toBe(9999)

  // Should complete in reasonable time
  expect(duration).toBeLessThan(10000)
})
```

---

## Testing State Management Integration

### Testing with React

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { useSyncDocument } from '@synckit-js/sdk'
import userEvent from '@testing-library/user-event'

test('should sync state to React component', async () => {
  function TodoComponent() {
    const [todo, { update }] = useSyncDocument<Todo>('todo-1')

    if (!todo) return <div>Loading...</div>

    return (
      <div>
        <span data-testid="todo-text">{todo.text}</span>
        <button onClick={() => update({ completed: !todo.completed })}>
          Toggle
        </button>
      </div>
    )
  }

  // Initial setup
  const synckit = new SyncKit({
    storage: 'memory',
    name: 'test',
    clientId: 'test'
  })
  await synckit.init()

  const doc = synckit.document<Todo>('todo-1')
  await doc.init()
  await doc.update({
    id: 'todo-1',
    text: 'Buy milk',
    completed: false
  })

  render(<TodoComponent />)

  // Should display initial state
  await waitFor(() => {
    expect(screen.getByTestId('todo-text')).toHaveTextContent('Buy milk')
  })

  // Click toggle button
  await userEvent.click(screen.getByText('Toggle'))

  // Update should propagate
  await waitFor(() => {
    const data = doc.get()
    expect(data.completed).toBe(true)
  })
})
```

### Testing with Network Status Hooks

```typescript
import { useNetworkStatus, useSyncState } from '@synckit-js/sdk'

test('should track network status in React', async () => {
  function NetworkMonitor() {
    const status = useNetworkStatus()
    const syncState = useSyncState('todo-1')

    if (!status) return <div>Offline mode</div>

    return (
      <div>
        <div data-testid="connection">{status.connectionState}</div>
        <div data-testid="queue">{status.queueSize}</div>
        <div data-testid="sync-state">{syncState?.state || 'unknown'}</div>
      </div>
    )
  }

  const synckit = new SyncKit({
    storage: 'memory',
    serverUrl: 'ws://localhost:8080',
    clientId: 'test'
  })
  await synckit.init()

  render(<NetworkMonitor />)

  // Should display network status
  await waitFor(() => {
    expect(screen.getByTestId('connection')).toBeInTheDocument()
  })
})
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - name: Start server
        run: npm run server &
      - name: Wait for server
        run: npx wait-on http://localhost:8080
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - name: Install Playwright
        run: npx playwright install --with-deps
      - name: Start app
        run: npm run dev &
      - name: Wait for app
        run: npx wait-on http://localhost:3000
      - run: npm run test:e2e

  property-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - name: Run property-based tests
        run: npm run test:property
        env:
          FAST_CHECK_NUM_RUNS: 1000
```

---

## Debugging and Troubleshooting

### Inspecting State

```typescript
// Get current document state
const state = todo.get()
console.log('Current state:', JSON.stringify(state, null, 2))

// List all documents
const docIds = await synckit.listDocuments()
console.log('All documents:', docIds)

// Get client ID
const clientId = synckit.getClientId()
console.log('Client ID:', clientId)

// Check if initialized
console.log('Initialized:', synckit.isInitialized())
```

### Network Status Debugging

```typescript
// Get network status
const status = synckit.getNetworkStatus()
if (status) {
  console.log('Network Status:', {
    networkState: status.networkState,
    connectionState: status.connectionState,
    queueSize: status.queueSize,
    failedOperations: status.failedOperations,
    oldestOperation: status.oldestOperation
      ? new Date(status.oldestOperation).toISOString()
      : null
  })
} else {
  console.log('Network layer not initialized (offline-only mode)')
}

// Get sync state for a document
const syncState = synckit.getSyncState('todo-1')
if (syncState) {
  console.log('Sync State:', {
    state: syncState.state,
    pendingOperations: syncState.pendingOperations,
    lastSyncedAt: syncState.lastSyncedAt
      ? new Date(syncState.lastSyncedAt).toISOString()
      : null,
    error: syncState.error
  })
}
```

### Manual Logging for Debugging

Since `logLevel` is not available in v0.1.0, use manual logging:

```typescript
const todo = synckit.document<Todo>('todo-1')
await todo.init()

console.log('Before update:', todo.get())

await todo.update({ completed: true })

console.log('After update:', todo.get())

// Monitor all changes
const unsubscribe = todo.subscribe((data) => {
  console.log('Document changed:', data)
})
```

### Common Test Failures

**"Test is flaky"**
- **Cause:** Not waiting for async operations
- **Fix:** Use `await` consistently, add proper waits for network operations

**"Convergence test fails"**
- **Cause:** Clients not fully synced
- **Fix:** Use `waitForSync()` or `waitForQueueEmpty()` helpers before asserting

**"Timeout in E2E test"**
- **Cause:** Network delays, server not ready
- **Fix:** Increase timeout, use `waitFor` patterns, check server is running

**"Network status is null"**
- **Cause:** No `serverUrl` provided
- **Fix:** Ensure `serverUrl` is configured when testing network features

---

## Summary

**Key Testing Strategies:**

1. **Unit tests** - Test CRDT operations in isolation (merge, update, conflict resolution)
2. **Property-based tests** - Verify CRDT properties (convergence, commutativity, idempotence)
3. **Network tests** - Test sync with server, queue behavior, network status monitoring
4. **Chaos tests** - Inject random failures, test partition healing
5. **Multi-client E2E** - Test real-world collaboration scenarios with Playwright
6. **Performance tests** - Verify scalability and load handling

**Essential Test Checklist:**

- ✅ Convergence: All clients reach same state after merge
- ✅ Offline: Operations work without network (local storage)
- ✅ Network sync: Changes sync to server when connected
- ✅ Conflicts: LWW resolves correctly based on timestamps
- ✅ Multi-client: Real-time sync works with multiple clients
- ✅ Performance: Meets latency/throughput targets
- ✅ Edge cases: Network failures, rapid edits, concurrent updates

**Testing Network Features:**

- ✅ Use `getNetworkStatus()` to check queue size and connection state
- ✅ Use `onNetworkStatusChange()` to monitor network changes
- ✅ Use `getSyncState()` to track document sync state
- ✅ Use `onSyncStateChange()` to monitor sync progress
- ✅ Use helper functions like `waitForSync()` and `waitForQueueEmpty()`

**Next Steps:**

- Set up [CI/CD](#cicd-integration) for continuous testing
- Implement [property-based tests](#property-based-testing-for-crdts) for critical paths
- Add [chaos testing](#chaos-engineering) to catch edge cases
- Test with multiple clients using [Playwright](#multi-client-e2e-testing)

---

**Testing is your safety net! 🎯**
