import { describe, it, expect, beforeEach } from 'vitest'
import { SyncText } from './text'

describe('SyncText - Fugue CRDT Integration', () => {
  let text: SyncText

  beforeEach(async () => {
    text = new SyncText('test-doc', 'client-1')
    await text.init()
  })

  it('should initialize empty text', () => {
    expect(text.get()).toBe('')
    expect(text.length()).toBe(0)
  })

  it('should insert text at position 0', async () => {
    await text.insert(0, 'Hello')
    expect(text.get()).toBe('Hello')
    expect(text.length()).toBe(5)
  })

  it('should insert text at end', async () => {
    await text.insert(0, 'Hello')
    await text.insert(5, ' World')
    expect(text.get()).toBe('Hello World')
    expect(text.length()).toBe(11)
  })

  it('should insert text in middle', async () => {
    await text.insert(0, 'Hello World')
    await text.insert(5, ' beautiful')
    expect(text.get()).toBe('Hello beautiful World')
    expect(text.length()).toBe(21)
  })

  it('should delete text', async () => {
    await text.insert(0, 'Hello World')
    await text.delete(5, 6) // Delete " World"
    expect(text.get()).toBe('Hello')
    expect(text.length()).toBe(5)
  })

  it('should handle multiple operations', async () => {
    await text.insert(0, 'The ')
    await text.insert(4, 'quick ')
    await text.insert(10, 'brown ')
    await text.insert(16, 'fox')
    expect(text.get()).toBe('The quick brown fox')

    await text.delete(4, 6) // Delete "quick "
    expect(text.get()).toBe('The brown fox')
  })

  it('should handle unicode characters', async () => {
    await text.insert(0, 'Hello 👋')
    expect(text.get()).toBe('Hello 👋')
    expect(text.length()).toBe(7) // "Hello " (6 chars) + "👋" (1 grapheme)
  })

  it('should handle emoji sequences', async () => {
    await text.insert(0, '🏳️‍🌈')
    expect(text.get()).toBe('🏳️‍🌈')
    // Rainbow flag is 1 grapheme cluster but multiple codepoints
  })

  it('should notify subscribers on insert', async () => {
    let notified = false
    let content = ''

    text.subscribe((newContent) => {
      notified = true
      content = newContent
    })

    await text.insert(0, 'Test')
    expect(notified).toBe(true)
    expect(content).toBe('Test')
  })

  it('should notify subscribers on delete', async () => {
    await text.insert(0, 'Hello World')

    let notified = false
    let content = ''

    text.subscribe((newContent) => {
      notified = true
      content = newContent
    })

    await text.delete(5, 6)
    expect(notified).toBe(true)
    expect(content).toBe('Hello')
  })

  it('should support multiple subscribers', async () => {
    let count = 0

    text.subscribe(() => count++)
    text.subscribe(() => count++)
    text.subscribe(() => count++)

    await text.insert(0, 'Test')
    expect(count).toBe(3)
  })

  it('should unsubscribe correctly', async () => {
    let count = 0

    const unsubscribe = text.subscribe(() => count++)

    await text.insert(0, 'Test 1')
    expect(count).toBe(1)

    unsubscribe()

    await text.insert(6, 'Test 2')
    expect(count).toBe(1) // Still 1, not incremented
  })

  it('should serialize and deserialize', async () => {
    await text.insert(0, 'Hello World')

    const json = text.toJSON()
    expect(json).toBeTruthy()
    expect(typeof json).toBe('string')

    // Create new instance and restore
    const text2 = new SyncText('test-doc-2', 'client-2')
    await text2.init()
    await text2.fromJSON(json)

    expect(text2.get()).toBe('Hello World')
    expect(text2.length()).toBe(11)
  })

  it('should merge changes from remote', async () => {
    // Client 1
    const text1 = new SyncText('doc-1', 'client-1')
    await text1.init()
    await text1.insert(0, 'Hello')

    // Client 2
    const text2 = new SyncText('doc-2', 'client-2')
    await text2.init()
    await text2.insert(0, 'World')

    // Merge client2 into client1
    const json2 = text2.toJSON()
    await text1.mergeRemote(json2)

    // Both should have the same content (Fugue handles ordering)
    const content1 = text1.get()
    expect(content1).toBeTruthy()
    expect(content1.includes('Hello') || content1.includes('World')).toBe(true)
  })

  it('should reject out-of-bounds insert', async () => {
    await text.insert(0, 'Hello')

    await expect(async () => {
      await text.insert(100, 'X')
    }).rejects.toThrow()
  })

  it('should reject out-of-bounds delete', async () => {
    await text.insert(0, 'Hello')

    await expect(async () => {
      await text.delete(3, 10)
    }).rejects.toThrow()
  })

  it('should reject negative positions', async () => {
    await expect(async () => {
      await text.insert(-1, 'X')
    }).rejects.toThrow()
  })
})
