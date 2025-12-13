/**
 * Text Persistence Tests
 *
 * Tests for storage persistence and restoration, particularly
 * focusing on clock serialization (BigInt to number conversion)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SyncText } from '../../text'
import { MemoryStorage } from '../../storage'

describe('Text Persistence', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('should persist and restore text content across instances', async () => {
    // Create and persist a text document
    const text1 = new SyncText('doc-test', 'client-test', storage)
    await text1.init()
    await text1.insert(0, 'Hello World')

    // Verify content and clock
    expect(text1.get()).toBe('Hello World')
    expect(text1.getClock()).toBeGreaterThan(0)

    const clock1 = text1.getClock()
    text1.dispose()

    // Create new instance with same IDs - should restore from storage
    const text2 = new SyncText('doc-test', 'client-test', storage)
    await text2.init()

    // Content should be restored
    expect(text2.get()).toBe('Hello World')
    expect(text2.getClock()).toBe(clock1)
  })

  it('should serialize clock as number in storage (not BigInt)', async () => {
    const text = new SyncText('doc-clock', 'client-clock', storage)
    await text.init()
    await text.insert(0, 'Test')

    // Check what was actually stored
    const stored = await storage.get('doc-clock')
    expect(stored).toBeDefined()

    // Clock should be a number, not a BigInt
    const data = stored as any
    expect(typeof data.clock).toBe('number')
    expect(data.clock).toBeGreaterThan(0)

    // Should be JSON-serializable (this would throw if clock was BigInt)
    expect(() => JSON.stringify(stored)).not.toThrow()
  })

  it('should handle multiple persist/restore cycles', async () => {
    // First instance
    const text1 = new SyncText('doc-multi', 'client-multi', storage)
    await text1.init()
    await text1.insert(0, 'First')
    text1.dispose()

    // Second instance - restore and add more
    const text2 = new SyncText('doc-multi', 'client-multi', storage)
    await text2.init()
    expect(text2.get()).toBe('First')
    await text2.insert(text2.length(), ' Second')
    text2.dispose()

    // Third instance - verify all content persisted
    const text3 = new SyncText('doc-multi', 'client-multi', storage)
    await text3.init()
    expect(text3.get()).toBe('First Second')
  })

  it('should restore CRDT state correctly via fromJSON', async () => {
    const text1 = new SyncText('doc-json', 'client-json', storage)
    await text1.init()
    await text1.insert(0, 'Test content')

    const json = text1.toJSON()

    // Create new instance and restore from JSON
    const text2 = new SyncText('doc-json2', 'client-json2', storage)
    await text2.init()
    await text2.fromJSON(json)

    expect(text2.get()).toBe('Test content')
  })
})
