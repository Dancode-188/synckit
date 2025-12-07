import { describe, it, expect, beforeEach } from 'vitest'
import { SyncSet } from './set'

describe('SyncSet - OR-Set CRDT Integration', () => {
  let set: SyncSet<string>

  beforeEach(async () => {
    set = new SyncSet<string>('test-set', 'client-1')
    await set.init()
  })

  // ====================
  // Initialization Tests
  // ====================

  it('should initialize empty', () => {
    expect(set.size).toBe(0)
    expect(set.isEmpty).toBe(true)
    expect(Array.from(set.values())).toEqual([])
  })

  // ====================
  // Add Tests
  // ====================

  it('should add a single element', async () => {
    await set.add('apple')
    expect(set.size).toBe(1)
    expect(set.has('apple')).toBe(true)
    expect(set.isEmpty).toBe(false)
  })

  it('should add multiple elements', async () => {
    await set.add('apple')
    await set.add('banana')
    await set.add('cherry')
    expect(set.size).toBe(3)
    expect(set.has('apple')).toBe(true)
    expect(set.has('banana')).toBe(true)
    expect(set.has('cherry')).toBe(true)
  })

  it('should handle adding duplicate elements', async () => {
    await set.add('apple')
    await set.add('apple')
    expect(set.size).toBe(1) // Only one 'apple'
  })

  it('should add empty string', async () => {
    await set.add('')
    expect(set.size).toBe(1)
    expect(set.has('')).toBe(true)
  })

  // ====================
  // Remove Tests
  // ====================

  it('should remove an element', async () => {
    await set.add('apple')
    await set.add('banana')
    await set.remove('apple')
    expect(set.size).toBe(1)
    expect(set.has('apple')).toBe(false)
    expect(set.has('banana')).toBe(true)
  })

  it('should handle removing non-existent element', async () => {
    await set.add('apple')
    await set.remove('banana') // Doesn't exist
    expect(set.size).toBe(1)
    expect(set.has('apple')).toBe(true)
  })

  it('should remove all elements', async () => {
    await set.add('apple')
    await set.add('banana')
    await set.add('cherry')
    await set.remove('apple')
    await set.remove('banana')
    await set.remove('cherry')
    expect(set.size).toBe(0)
    expect(set.isEmpty).toBe(true)
  })

  // ====================
  // Add-After-Remove Tests (Add-Wins Semantics)
  // ====================

  it('should support add after remove (add-wins)', async () => {
    await set.add('apple')
    await set.remove('apple')
    await set.add('apple') // Re-add after removal
    expect(set.has('apple')).toBe(true)
    expect(set.size).toBe(1)
  })

  it('should handle multiple add-remove cycles', async () => {
    await set.add('apple')
    await set.remove('apple')
    await set.add('apple')
    await set.remove('apple')
    await set.add('apple')
    expect(set.has('apple')).toBe(true)
  })

  // ====================
  // Contains/Has Tests
  // ====================

  it('should check if element exists', async () => {
    await set.add('apple')
    expect(set.has('apple')).toBe(true)
    expect(set.has('banana')).toBe(false)
  })

  it('should return false for removed element', async () => {
    await set.add('apple')
    await set.remove('apple')
    expect(set.has('apple')).toBe(false)
  })

  // ====================
  // Values/Iterator Tests
  // ====================

  it('should iterate over values', async () => {
    await set.add('apple')
    await set.add('banana')
    await set.add('cherry')

    const values = Array.from(set.values()).sort()
    expect(values).toEqual(['apple', 'banana', 'cherry'])
  })

  it('should iterate over empty set', () => {
    const values = Array.from(set.values())
    expect(values).toEqual([])
  })

  // ====================
  // Clear Tests
  // ====================

  it('should clear all elements', async () => {
    await set.add('apple')
    await set.add('banana')
    await set.add('cherry')
    await set.clear()
    expect(set.size).toBe(0)
    expect(set.isEmpty).toBe(true)
  })

  it('should allow adding after clear', async () => {
    await set.add('apple')
    await set.clear()
    await set.add('banana')
    expect(set.size).toBe(1)
    expect(set.has('banana')).toBe(true)
  })

  // ====================
  // Subscription Tests
  // ====================

  it('should notify subscribers on add', async () => {
    const snapshots: string[][] = []
    set.subscribe((values) => {
      snapshots.push(Array.from(values).sort())
    })

    await set.add('apple')
    await set.add('banana')

    expect(snapshots).toEqual([['apple'], ['apple', 'banana']])
  })

  it('should notify subscribers on remove', async () => {
    const snapshots: string[][] = []

    await set.add('apple')
    await set.add('banana')

    set.subscribe((values) => {
      snapshots.push(Array.from(values).sort())
    })

    await set.remove('apple')
    await set.remove('banana')

    expect(snapshots).toEqual([['banana'], []])
  })

  it('should notify subscribers on clear', async () => {
    const snapshots: string[][] = []

    await set.add('apple')
    await set.add('banana')

    set.subscribe((values) => {
      snapshots.push(Array.from(values).sort())
    })

    await set.clear()

    expect(snapshots).toEqual([[]])
  })

  it('should allow multiple subscribers', async () => {
    const snapshots1: string[][] = []
    const snapshots2: string[][] = []

    set.subscribe((values) => snapshots1.push(Array.from(values)))
    set.subscribe((values) => snapshots2.push(Array.from(values)))

    await set.add('apple')

    expect(snapshots1.length).toBe(1)
    expect(snapshots2.length).toBe(1)
  })

  it('should unsubscribe correctly', async () => {
    const snapshots: string[][] = []
    const unsubscribe = set.subscribe((values) => {
      snapshots.push(Array.from(values))
    })

    await set.add('apple')
    unsubscribe()
    await set.add('banana')

    expect(snapshots.length).toBe(1) // Only first add
  })

  // ====================
  // Merge Tests
  // ====================

  it('should merge with another set (different replicas)', async () => {
    const set2 = new SyncSet<string>('test-set', 'client-2')
    await set2.init()

    await set.add('apple')
    await set2.add('banana')

    const json2 = set2.toJSON()
    await set.mergeRemote(json2)

    expect(set.size).toBe(2)
    expect(set.has('apple')).toBe(true)
    expect(set.has('banana')).toBe(true)
  })

  it('should merge with removes', async () => {
    const set2 = new SyncSet<string>('test-set', 'client-2')
    await set2.init()

    // Both add apple
    await set.add('apple')
    await set2.add('apple')

    // set2 removes it
    await set2.remove('apple')

    // set adds banana
    await set.add('banana')

    const json2 = set2.toJSON()
    await set.mergeRemote(json2)

    // After merge, set should still have banana, but apple survives (add-wins)
    expect(set.has('banana')).toBe(true)
    expect(set.has('apple')).toBe(true) // Add-wins semantics
  })

  it('should handle idempotent merge', async () => {
    const set2 = new SyncSet<string>('test-set', 'client-2')
    await set2.init()

    await set.add('apple')
    await set2.add('banana')

    const json2 = set2.toJSON()
    await set.mergeRemote(json2)
    const size1 = set.size

    await set.mergeRemote(json2)
    const size2 = set.size

    expect(size1).toBe(size2) // Merging same state twice = no change
  })

  // ====================
  // Serialization Tests
  // ====================

  it('should serialize to JSON', async () => {
    await set.add('apple')
    await set.add('banana')
    const json = set.toJSON()

    expect(json).toBeTruthy()
    expect(typeof json).toBe('string')
  })

  it('should deserialize from JSON', async () => {
    await set.add('apple')
    await set.add('banana')
    await set.add('cherry')
    const json = set.toJSON()

    const set2 = new SyncSet<string>('test-set-2', 'client-2')
    await set2.init()
    await set2.fromJSON(json)

    expect(set2.size).toBe(3)
    expect(set2.has('apple')).toBe(true)
    expect(set2.has('banana')).toBe(true)
    expect(set2.has('cherry')).toBe(true)
  })

  // ====================
  // Error Handling Tests
  // ====================

  it('should throw error if not initialized', async () => {
    const uninitSet = new SyncSet<string>('uninit', 'client-1')

    await expect(uninitSet.add('apple')).rejects.toThrow('not initialized')
  })

  it('should handle dispose correctly', async () => {
    await set.add('apple')
    set.dispose()

    // After dispose, set should not work
    await expect(set.add('banana')).rejects.toThrow()
  })

  // ====================
  // Edge Cases
  // ====================

  it('should handle special characters', async () => {
    await set.add('hello world')
    await set.add('tab\ttab')
    await set.add('newline\nnewline')
    expect(set.size).toBe(3)
  })

  it('should handle unicode strings', async () => {
    await set.add('😀')
    await set.add('🎉')
    await set.add('你好')
    expect(set.size).toBe(3)
    expect(set.has('😀')).toBe(true)
  })

  it('should handle very long strings', async () => {
    const longString = 'a'.repeat(10000)
    await set.add(longString)
    expect(set.has(longString)).toBe(true)
  })
})
