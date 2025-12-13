/**
 * Integration tests for RichText Character ID stability fix (Bug #1)
 *
 * Tests verify that format spans use stable NodeIds from the Fugue CRDT
 * instead of position-based IDs that shift when text is edited.
 *
 * Bug: Format spans were using `${position}@${clientId}` which caused
 * format ranges to shift incorrectly when text before them was edited.
 *
 * Fix: Format spans now use stable NodeIds with format: `${client_id}@${clock}:${offset}`
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RichText } from '../../crdt/richtext'
import { MemoryStorage } from '../../storage/memory'
import type { FormatSpan } from '../../crdt/peritext'

describe('RichText - Character ID Stability', () => {
  let richText: RichText
  let storage: MemoryStorage

  beforeEach(async () => {
    storage = new MemoryStorage()
    richText = new RichText('test-doc', 'client1', storage)
    await richText.init()
  })

  it('should use stable NodeIds for format spans (not position-based IDs)', async () => {
    // Insert text
    await richText.insert(0, 'Hello World')

    // Format "World" (positions 6-11) as bold
    await richText.format(6, 11, { bold: true })

    // Get the format spans
    const spans = (richText as any).spans as Map<string, FormatSpan>
    const spanArray = Array.from(spans.values())

    expect(spanArray).toHaveLength(1)
    const span = spanArray[0] as FormatSpan

    // Verify NodeId format: client_id@clock:offset (NOT position@clientId)
    expect(span.start.characterId).toMatch(/^client1@\d+:\d+$/)
    expect(span.end.characterId).toMatch(/^client1@\d+:\d+$/)

    // Should NOT be position-based format
    expect(span.start.characterId).not.toMatch(/^6@client1$/)
    expect(span.end.characterId).not.toMatch(/^10@client1$/)
  })

  it('should maintain format when text is inserted before formatted range', async () => {
    // Insert "World"
    await richText.insert(0, 'World')

    // Format "World" as bold (positions 0-5)
    await richText.format(0, 5, { bold: true })

    // Insert "Hello " before "World"
    await richText.insert(0, 'Hello ')

    // Text should now be "Hello World"
    expect(richText.get()).toBe('Hello World')

    // Get formatted ranges
    const ranges = richText.getRanges()

    // "World" should still be bold (now at positions 6-11)
    expect(ranges).toHaveLength(2)
    expect(ranges[0]?.text).toBe('Hello ')
    expect(ranges[0]?.attributes).toEqual({})
    expect(ranges[1]?.text).toBe('World')
    expect(ranges[1]?.attributes).toEqual({ bold: true })
  })

  it('should maintain format when text is deleted before formatted range', async () => {
    // Block splitting is now implemented with per-character clock allocation!
    // This test verifies that format spans remain attached to the correct
    // characters even when text is partially deleted.

    // Insert "Hello Beautiful World"
    await richText.insert(0, 'Hello Beautiful World')

    // Format "World" as italic (positions 16-21)
    await richText.format(16, 21, { italic: true })

    // Delete "Beautiful " (positions 6-16)
    await richText.delete(6, 10)

    // Text should now be "Hello World"
    expect(richText.get()).toBe('Hello World')

    // Get formatted ranges
    const ranges = richText.getRanges()

    // "World" should still be italic (now at positions 6-11)
    expect(ranges).toHaveLength(2)
    expect(ranges[0]?.text).toBe('Hello ')
    expect(ranges[0]?.attributes).toEqual({})
    expect(ranges[1]?.text).toBe('World')
    expect(ranges[1]?.attributes).toEqual({ italic: true })
  })

  it('should handle multiple format spans with stable NodeIds', async () => {
    // DEBUG: Investigating insertion corruption
    // Insert "The quick brown fox"
    await richText.insert(0, 'The quick brown fox')

    // Format "quick" as bold (positions 4-9)
    await richText.format(4, 9, { bold: true })

    // Format "brown" as italic (positions 10-15)
    await richText.format(10, 15, { italic: true })

    // Insert "very " before "quick" (at position 4)
    await richText.insert(4, 'very ')

    // Text should now be "The very quick brown fox"
    expect(richText.get()).toBe('The very quick brown fox')

    // Get formatted ranges
    const ranges = richText.getRanges()

    // Verify format preservation:
    // - "The " (unformatted)
    // - "very " (unformatted)
    // - "quick" (bold)
    // - " " (unformatted)
    // - "brown" (italic)
    // - " fox" (unformatted)

    const boldRange = ranges.find(r => r.attributes.bold === true)
    const italicRange = ranges.find(r => r.attributes.italic === true)

    expect(boldRange).toBeDefined()
    expect(boldRange?.text).toBe('quick')
    expect(italicRange).toBeDefined()
    expect(italicRange?.text).toBe('brown')
  })

  it('should use NodeIds with clock values for characters (per-character allocation)', async () => {
    // Insert "Hello" in one operation (single block with RLE)
    // With per-character clocks, "Hello" allocates clocks [1, 2, 3, 4, 5]
    await richText.insert(0, 'Hello')

    // Format first 'l' (position 2) as bold
    await richText.format(2, 3, { bold: true })

    // Get the format span
    const spans = (richText as any).spans as Map<string, FormatSpan>
    const spanArray = Array.from(spans.values())
    const span = spanArray[0] as FormatSpan

    // Parse NodeId format: client_id@clock:offset
    const startMatch = span.start.characterId.match(/^([^@]+)@(\d+):(\d+)$/)
    const endMatch = span.end.characterId.match(/^([^@]+)@(\d+):(\d+)$/)

    expect(startMatch).toBeTruthy()
    expect(endMatch).toBeTruthy()

    if (!startMatch || !endMatch) {
      throw new Error('NodeId format did not match expected pattern')
    }

    // With per-character clocks, position 2 ('l') has clock 3, offset 0
    expect(startMatch[1]).toBe('client1') // client_id
    expect(startMatch[2]).toBe('3')       // clock (third character has clock 3)
    expect(startMatch[3]).toBe('0')       // offset (always 0 with per-character clocks)

    expect(endMatch[1]).toBe('client1')
    expect(endMatch[2]).toBe('3')         // clock (same character)
    expect(endMatch[3]).toBe('0')         // offset (always 0)
  })

  it('should handle format spans across multiple blocks', async () => {
    // Insert "Hello" (allocates clocks 1-5)
    await richText.insert(0, 'Hello')

    // Insert " World" (allocates clocks 6-11)
    await richText.insert(5, ' World')

    // Format "o W" (spans across both blocks, positions 4-7)
    await richText.format(4, 7, { underline: true })

    // Get the format span
    const spans = (richText as any).spans as Map<string, FormatSpan>
    const spanArray = Array.from(spans.values())
    const span = spanArray[0] as FormatSpan

    // Parse NodeIds
    const startMatch = span.start.characterId.match(/^([^@]+)@(\d+):(\d+)$/)
    const endMatch = span.end.characterId.match(/^([^@]+)@(\d+):(\d+)$/)

    expect(startMatch).toBeTruthy()
    expect(endMatch).toBeTruthy()

    if (!startMatch || !endMatch) {
      throw new Error('NodeId format did not match expected pattern')
    }

    // With per-character clocks:
    // "Hello" = clocks [1,2,3,4,5], position 4 ('o') = clock 5
    expect(startMatch[2]).toBe('5') // clock 5 (fifth character of "Hello")
    expect(startMatch[3]).toBe('0') // offset 0

    // " World" = clocks [6,7,8,9,10,11], position 7 ('W') = clock 7
    expect(endMatch[2]).toBe('7')   // clock 7 (second character of " World")
    expect(endMatch[3]).toBe('0')   // offset 0
  })
})
