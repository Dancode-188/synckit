import { describe, it, expect, beforeEach } from 'vitest'
import { SyncCounter } from './counter'

describe('SyncCounter - PN-Counter CRDT Integration', () => {
  let counter: SyncCounter

  beforeEach(async () => {
    counter = new SyncCounter('test-counter', 'client-1')
    await counter.init()
  })

  // ====================
  // Initialization Tests
  // ====================

  it('should initialize with value 0', () => {
    expect(counter.value).toBe(0)
  })

  // ====================
  // Increment Tests
  // ====================

  it('should increment by 1 (default)', async () => {
    await counter.increment()
    expect(counter.value).toBe(1)
  })

  it('should increment by custom amount', async () => {
    await counter.increment(5)
    expect(counter.value).toBe(5)
  })

  it('should handle multiple increments', async () => {
    await counter.increment(3)
    await counter.increment(7)
    await counter.increment(2)
    expect(counter.value).toBe(12)
  })

  it('should increment by 0 (no-op)', async () => {
    await counter.increment(0)
    expect(counter.value).toBe(0)
  })

  it('should throw error on negative increment', async () => {
    await expect(counter.increment(-5)).rejects.toThrow(
      'Increment amount must be non-negative'
    )
  })

  // ====================
  // Decrement Tests
  // ====================

  it('should decrement by 1 (default)', async () => {
    await counter.increment(10)
    await counter.decrement()
    expect(counter.value).toBe(9)
  })

  it('should decrement by custom amount', async () => {
    await counter.increment(10)
    await counter.decrement(3)
    expect(counter.value).toBe(7)
  })

  it('should handle negative values', async () => {
    await counter.decrement(5)
    expect(counter.value).toBe(-5)
  })

  it('should decrement by 0 (no-op)', async () => {
    await counter.increment(10)
    await counter.decrement(0)
    expect(counter.value).toBe(10)
  })

  it('should throw error on negative decrement', async () => {
    await expect(counter.decrement(-5)).rejects.toThrow(
      'Decrement amount must be non-negative'
    )
  })

  // ====================
  // Combined Operations Tests
  // ====================

  it('should handle mixed increment and decrement', async () => {
    await counter.increment(10)
    await counter.decrement(3)
    await counter.increment(5)
    await counter.decrement(2)
    expect(counter.value).toBe(10)
  })

  it('should handle sequential operations correctly', async () => {
    await counter.increment()
    await counter.increment()
    await counter.increment()
    await counter.decrement()
    await counter.decrement()
    expect(counter.value).toBe(1)
  })

  // ====================
  // Subscription Tests
  // ====================

  it('should notify subscribers on increment', async () => {
    const values: number[] = []
    counter.subscribe((value) => values.push(value))

    await counter.increment(5)
    await counter.increment(3)

    expect(values).toEqual([5, 8])
  })

  it('should notify subscribers on decrement', async () => {
    const values: number[] = []
    counter.subscribe((value) => values.push(value))

    await counter.increment(10)
    await counter.decrement(3)
    await counter.decrement(2)

    expect(values).toEqual([10, 7, 5])
  })

  it('should allow multiple subscribers', async () => {
    const values1: number[] = []
    const values2: number[] = []

    counter.subscribe((value) => values1.push(value))
    counter.subscribe((value) => values2.push(value))

    await counter.increment(5)

    expect(values1).toEqual([5])
    expect(values2).toEqual([5])
  })

  it('should unsubscribe correctly', async () => {
    const values: number[] = []
    const unsubscribe = counter.subscribe((value) => values.push(value))

    await counter.increment(5)
    unsubscribe()
    await counter.increment(3)

    expect(values).toEqual([5]) // Only first increment
  })

  // ====================
  // Merge Tests
  // ====================

  it('should merge with another counter (different replicas)', async () => {
    const counter2 = new SyncCounter('test-counter', 'client-2')
    await counter2.init()

    await counter.increment(5)
    await counter2.increment(3)

    const json2 = counter2.toJSON()
    await counter.mergeRemote(json2)

    expect(counter.value).toBe(8) // 5 + 3
  })

  it('should merge with decrements', async () => {
    const counter2 = new SyncCounter('test-counter', 'client-2')
    await counter2.init()

    await counter.increment(10)
    await counter.decrement(2)

    await counter2.increment(5)
    await counter2.decrement(3)

    const json2 = counter2.toJSON()
    await counter.mergeRemote(json2)

    // (10 - 2) + (5 - 3) = 8 + 2 = 10
    expect(counter.value).toBe(10)
  })

  it('should handle idempotent merge', async () => {
    const counter2 = new SyncCounter('test-counter', 'client-2')
    await counter2.init()

    await counter.increment(5)
    await counter2.increment(3)

    const json2 = counter2.toJSON()
    await counter.mergeRemote(json2)
    const value1 = counter.value

    await counter.mergeRemote(json2)
    const value2 = counter.value

    expect(value1).toBe(value2) // Merging same state twice = no change
  })

  // ====================
  // Serialization Tests
  // ====================

  it('should serialize to JSON', async () => {
    await counter.increment(5)
    const json = counter.toJSON()

    expect(json).toBeTruthy()
    expect(typeof json).toBe('string')
  })

  it('should deserialize from JSON', async () => {
    await counter.increment(10)
    await counter.decrement(3)
    const json = counter.toJSON()

    const counter2 = new SyncCounter('test-counter-2', 'client-2')
    await counter2.init()
    await counter2.fromJSON(json)

    expect(counter2.value).toBe(7)
  })

  // ====================
  // Reset Tests
  // ====================

  it('should reset to zero', async () => {
    await counter.increment(10)
    await counter.decrement(3)
    await counter.reset()

    expect(counter.value).toBe(0)
  })

  it('should notify subscribers on reset', async () => {
    const values: number[] = []
    counter.subscribe((value) => values.push(value))

    await counter.increment(10)
    await counter.reset()

    expect(values).toEqual([10, 0])
  })

  // ====================
  // Error Handling Tests
  // ====================

  it('should throw error if not initialized', async () => {
    const uninitCounter = new SyncCounter('uninit', 'client-1')

    await expect(uninitCounter.increment()).rejects.toThrow('not initialized')
  })

  it('should handle dispose correctly', async () => {
    await counter.increment(5)
    counter.dispose()

    // After dispose, counter should not work
    await expect(counter.increment()).rejects.toThrow()
  })
})
