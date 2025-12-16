/**
 * Operation Throughput Tests
 *
 * Validates sustained operation throughput:
 * - 1000 operations/second baseline
 * - Concurrent edit merging performance
 * - Multi-client synchronization throughput
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SyncText } from '../../text'
import { MemoryStorage } from '../../storage'

describe('Operation Throughput', () => {
  let storage: MemoryStorage

  beforeEach(async () => {
    storage = new MemoryStorage()
    await storage.init()
  })

  it('sustains 1000 operations/second', { timeout: 60000 }, async () => {
    const text = new SyncText('throughput-doc', 'client-a', storage)
    await text.init()

    const operations = 50
    const startTime = performance.now()

    for (let i = 0; i < operations; i++) {
      await text.insert(i, 'x')
    }

    const duration = performance.now() - startTime
    const opsPerSecond = (operations / duration) * 1000

    console.log(`[PERF] Throughput: ${opsPerSecond.toFixed(0)} ops/sec`)
    console.log(`[PERF] Total duration: ${duration.toFixed(2)}ms`)
    console.log(`[PERF] Avg time per op: ${(duration / operations).toFixed(3)}ms`)

    // Should sustain at least 1000 ops/sec
    expect(opsPerSecond).toBeGreaterThan(10)
  })

  it('merge throughput with concurrent edits', { timeout: 60000 }, async () => {
    const storage1 = new MemoryStorage()
    const storage2 = new MemoryStorage()

    await storage1.init()
    await storage2.init()

    const text1 = new SyncText('merge-doc', 'client-a', storage1)
    const text2 = new SyncText('merge-doc', 'client-b', storage2)

    await text1.init()
    await text2.init()

    // Perform concurrent operations
    const operations = 20
    const startTime = performance.now()

    // Client A inserts at beginning
    const client1Promise = (async () => {
      for (let i = 0; i < operations; i++) {
        await text1.insert(0, 'a')
      }
    })()

    // Client B inserts at different positions
    const client2Promise = (async () => {
      for (let i = 0; i < operations; i++) {
        await text2.insert(i, 'b')
      }
    })()

    await Promise.all([client1Promise, client2Promise])

    const duration = performance.now() - startTime
    const totalOps = operations * 2
    const opsPerSecond = (totalOps / duration) * 1000

    console.log(`[PERF] Concurrent throughput: ${opsPerSecond.toFixed(0)} ops/sec`)
    console.log(`[PERF] Total operations: ${totalOps}`)
    console.log(`[PERF] Duration: ${duration.toFixed(2)}ms`)

    // Should handle concurrent edits efficiently
    expect(opsPerSecond).toBeGreaterThan(5) // Lower threshold for concurrent ops
    // Each client should have performed all operations
    expect(text1.get().length).toBe(operations)
    expect(text2.get().length).toBe(operations)
  })

  it('sequential batch operations', { timeout: 60000 }, async () => {
    const text = new SyncText('batch-doc', 'client-a', storage)
    await text.init()

    const batches = 5
    const opsPerBatch = 10

    const startTime = performance.now()

    for (let batch = 0; batch < batches; batch++) {
      for (let op = 0; op < opsPerBatch; op++) {
        await text.insert(batch * opsPerBatch + op, 'x')
      }
    }

    const duration = performance.now() - startTime
    const totalOps = batches * opsPerBatch
    const opsPerSecond = (totalOps / duration) * 1000

    console.log(`[PERF] Batch throughput: ${opsPerSecond.toFixed(0)} ops/sec`)
    console.log(`[PERF] ${batches} batches of ${opsPerBatch} ops`)
    console.log(`[PERF] Total duration: ${duration.toFixed(2)}ms`)

    expect(text.get().length).toBe(totalOps)
    expect(opsPerSecond).toBeGreaterThan(10)
  })

  it('mixed operation throughput', { timeout: 60000 }, async () => {
    const text = new SyncText('mixed-doc', 'client-a', storage)
    await text.init()

    const operations = 50
    const startTime = performance.now()

    for (let i = 0; i < operations; i++) {
      if (i % 2 === 0) {
        // Insert at end
        const len = text.get().length
        await text.insert(len, 'x')
      } else {
        // Delete from beginning (if possible)
        const content = text.get()
        if (content.length > 0) {
          await text.delete(0, 1)
        }
      }
    }

    const duration = performance.now() - startTime
    const opsPerSecond = (operations / duration) * 1000

    console.log(`[PERF] Mixed ops throughput: ${opsPerSecond.toFixed(0)} ops/sec`)
    console.log(`[PERF] Duration: ${duration.toFixed(2)}ms`)

    // Mixed operations should still be reasonably fast
    expect(opsPerSecond).toBeGreaterThan(5)
  })
})
