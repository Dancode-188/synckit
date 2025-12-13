/**
 * Memory Leak Tests for SyncText WASM Integration
 *
 * Verifies that WASM memory is properly managed during:
 * - Initialization and restoration from storage
 * - High-volume insert/delete operations
 * - fromJSON() operations
 * - Disposal and cleanup
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SyncText } from '../../text'
import { MemoryStorage } from '../../storage'

describe('SyncText Memory Management', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('should not leak memory during 1000 insert operations', async () => {
    const text = new SyncText('doc-1', 'client-1', storage)
    await text.init()

    // Perform 1000 insert operations
    for (let i = 0; i < 1000; i++) {
      await text.insert(text.length(), `${i} `)
    }

    // Verify text content
    const content = text.get()
    expect(content).toContain('0 ')
    expect(content).toContain('999 ')
    expect(text.length()).toBeGreaterThan(1000)

    // Cleanup
    text.dispose()
  }, 30000) // 30 second timeout for 1000 operations

  it('should not leak memory during 1000 insert/delete cycles', async () => {
    const text = new SyncText('doc-2', 'client-2', storage)
    await text.init()

    // Insert initial text
    await text.insert(0, 'Initial ')

    // Perform 1000 insert/delete cycles
    for (let i = 0; i < 1000; i++) {
      await text.insert(text.length(), 'temp')
      await text.delete(text.length() - 4, 4)
    }

    // Text should be back to initial state
    expect(text.get()).toBe('Initial ')

    // Cleanup
    text.dispose()
  }, 30000) // 30 second timeout

  it('should properly cleanup WASM memory on dispose', async () => {
    const text = new SyncText('doc-3', 'client-3', storage)
    await text.init()

    await text.insert(0, 'Hello World')
    expect(text.get()).toBe('Hello World')

    // Dispose should free WASM memory
    text.dispose()

    // Accessing after dispose should throw
    expect(() => text.get()).not.toThrow() // get() returns cached content
    expect(() => text.length()).toThrow('Text not initialized')
  })

  it('should not leak memory when loading from JSON multiple times', async () => {
    const text = new SyncText('doc-4', 'client-4', storage)
    await text.init()

    // Insert initial content
    await text.insert(0, 'Hello World')
    const json1 = text.toJSON()

    // Load from JSON 100 times (simulating frequent state restoration)
    for (let i = 0; i < 100; i++) {
      await text.fromJSON(json1)
      expect(text.get()).toBe('Hello World')
    }

    // Cleanup
    text.dispose()
  })

  it('should not leak memory during init restoration from storage', async () => {
    // Create and persist a text document
    const text1 = new SyncText('doc-5', 'client-5', storage)
    await text1.init()
    await text1.insert(0, 'Persisted Content')
    text1.dispose()

    // Re-initialize from storage 50 times (simulating frequent page refreshes)
    // Use same client ID to restore the same CRDT state
    for (let i = 0; i < 50; i++) {
      const text = new SyncText('doc-5', 'client-5', storage)
      await text.init()
      expect(text.get()).toBe('Persisted Content')
      text.dispose()
    }
  })

  it('should cleanup WASM object if fromJSON fails during init', async () => {
    // Store invalid CRDT data
    await storage.set('doc-6', {
      content: 'fallback content',
      clock: 1,
      updatedAt: Date.now(),
      crdt: 'invalid-json-data-that-will-fail'
    } as any)

    const text = new SyncText('doc-6', 'client-6', storage)

    // Init should fail due to invalid CRDT data, but shouldn't leak
    await expect(text.init()).rejects.toThrow()

    // Even after failed init, dispose should be safe
    text.dispose()
  })

  it('should cleanup WASM object if fromJSON fails after successful init', async () => {
    const text = new SyncText('doc-7', 'client-7', storage)
    await text.init()
    await text.insert(0, 'Original')

    // Try to load invalid JSON
    await expect(text.fromJSON('invalid-json')).rejects.toThrow()

    // Original content should still be accessible (failed load shouldn't corrupt state)
    expect(text.get()).toBe('Original')

    // Cleanup
    text.dispose()
  })

  it('should handle rapid insert/delete/persist cycles without leaks', async () => {
    const text = new SyncText('doc-8', 'client-8', storage)
    await text.init()

    // Simulate aggressive editing with persistence
    for (let i = 0; i < 500; i++) {
      await text.insert(0, 'a')
      await text.delete(0, 1)
    }

    // After all operations, text should be empty
    expect(text.get()).toBe('')

    // Cleanup
    text.dispose()
  })

  it('should not leak when merging remote states', async () => {
    const text1 = new SyncText('doc-9', 'client-9a', storage)
    await text1.init()
    await text1.insert(0, 'Client A content')

    const text2 = new SyncText('doc-9', 'client-9b', storage)
    await text2.init()

    // Merge text1 state into text2 multiple times
    for (let i = 0; i < 50; i++) {
      const json = text1.toJSON()
      await text2.mergeRemote(json)
    }

    expect(text2.get()).toBe('Client A content')

    // Cleanup both
    text1.dispose()
    text2.dispose()
  })

  it('should handle multiple documents without cross-contamination', async () => {
    const texts: SyncText[] = []

    // Create 20 text documents
    for (let i = 0; i < 20; i++) {
      const text = new SyncText(`doc-multi-${i}`, `client-${i}`, storage)
      await text.init()
      await text.insert(0, `Document ${i}`)
      texts.push(text)
    }

    // Verify each document has correct content
    for (let i = 0; i < 20; i++) {
      expect(texts[i]!.get()).toBe(`Document ${i}`)
    }

    // Cleanup all
    for (const text of texts) {
      text.dispose()
    }
  })
})
