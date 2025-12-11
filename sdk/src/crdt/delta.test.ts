/**
 * Delta Format Tests
 *
 * Tests for Quill Delta import/export functionality, including conversion
 * between RichText CRDT and Delta format, round-trip conversion, and
 * attribute mapping.
 */

import { describe, it, expect } from 'vitest'
import { DeltaUtils, type Delta } from './delta'
import type { FormatRange } from './delta'

describe('Delta - Basic Operations', () => {
  it('should create an empty Delta', () => {
    const delta = DeltaUtils.empty()
    expect(delta.ops).toEqual([])
    expect(DeltaUtils.isEmpty(delta)).toBe(true)
  })

  it('should detect non-empty Delta', () => {
    const delta: Delta = {
      ops: [{ insert: 'Hello' }]
    }
    expect(DeltaUtils.isEmpty(delta)).toBe(false)
  })

  it('should calculate Delta length', () => {
    const delta: Delta = {
      ops: [
        { insert: 'Hello' },
        { insert: ' World' }
      ]
    }
    expect(DeltaUtils.length(delta)).toBe(11)
  })

  it('should convert Delta to plain text', () => {
    const delta: Delta = {
      ops: [
        { insert: 'Hello ', attributes: { bold: true } },
        { insert: 'World', attributes: { italic: true } }
      ]
    }
    expect(DeltaUtils.toPlainText(delta)).toBe('Hello World')
  })

  it('should clone a Delta', () => {
    const original: Delta = {
      ops: [{ insert: 'Hello', attributes: { bold: true } }]
    }
    const cloned = DeltaUtils.clone(original)

    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned.ops[0]).not.toBe(original.ops[0])
  })
})

describe('Delta - Validation', () => {
  it('should validate well-formed Delta', () => {
    const delta: Delta = {
      ops: [
        { insert: 'Hello', attributes: { bold: true } },
        { retain: 5, attributes: { italic: true } },
        { delete: 3 }
      ]
    }
    expect(DeltaUtils.validate(delta)).toBeUndefined()
  })

  it('should reject non-object Delta', () => {
    const error = DeltaUtils.validate(null as any)
    expect(error).toBeDefined()
    expect(error).toContain('must be an object')
  })

  it('should reject Delta without ops array', () => {
    const error = DeltaUtils.validate({ ops: 'not an array' } as any)
    expect(error).toBeDefined()
    expect(error).toContain('ops must be an array')
  })

  it('should reject operation with multiple keys', () => {
    const delta: Delta = {
      ops: [{ insert: 'Hello', delete: 5 } as any]
    }
    const error = DeltaUtils.validate(delta)
    expect(error).toBeDefined()
    expect(error).toContain('exactly one of insert/delete/retain')
  })

  it('should reject insert with non-string value', () => {
    const delta: Delta = {
      ops: [{ insert: 123 } as any]
    }
    const error = DeltaUtils.validate(delta)
    expect(error).toBeDefined()
    expect(error).toContain('insert must be a string')
  })

  it('should reject delete with invalid number', () => {
    const delta: Delta = {
      ops: [{ delete: -5 }]
    }
    const error = DeltaUtils.validate(delta)
    expect(error).toBeDefined()
    expect(error).toContain('delete must be a positive number')
  })

  it('should reject retain with zero', () => {
    const delta: Delta = {
      ops: [{ retain: 0 }]
    }
    const error = DeltaUtils.validate(delta)
    expect(error).toBeDefined()
    expect(error).toContain('retain must be a positive number')
  })

  it('should reject invalid attributes type', () => {
    const delta: Delta = {
      ops: [{ insert: 'Hello', attributes: 'not an object' as any }]
    }
    const error = DeltaUtils.validate(delta)
    expect(error).toBeDefined()
    expect(error).toContain('attributes must be an object')
  })
})

describe('Delta - Attribute Conversion', () => {
  it('should convert FormatAttributes to Delta attributes', () => {
    const attrs = {
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      color: '#FF0000',
      background: '#00FF00',
      href: 'https://example.com'
    }

    const deltaAttrs = DeltaUtils.formatAttributesToDeltaAttrs(attrs)

    expect(deltaAttrs.bold).toBe(true)
    expect(deltaAttrs.italic).toBe(true)
    expect(deltaAttrs.underline).toBe(true)
    expect(deltaAttrs.strike).toBe(true) // strikethrough → strike
    expect(deltaAttrs.color).toBe('#FF0000')
    expect(deltaAttrs.background).toBe('#00FF00')
    expect(deltaAttrs.link).toBe('https://example.com') // href → link
  })

  it('should convert Delta attributes to FormatAttributes', () => {
    const deltaAttrs = {
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      color: '#FF0000',
      background: '#00FF00',
      link: 'https://example.com'
    }

    const attrs = DeltaUtils.deltaAttrsToFormatAttributes(deltaAttrs)

    expect(attrs.bold).toBe(true)
    expect(attrs.italic).toBe(true)
    expect(attrs.underline).toBe(true)
    expect(attrs.strikethrough).toBe(true) // strike → strikethrough
    expect(attrs.color).toBe('#FF0000')
    expect(attrs.background).toBe('#00FF00')
    expect(attrs.href).toBe('https://example.com') // link → href
  })

  it('should preserve custom attributes', () => {
    const attrs = {
      bold: true,
      customAttr: 'value',
      anotherCustom: 123
    }

    const deltaAttrs = DeltaUtils.formatAttributesToDeltaAttrs(attrs)
    expect(deltaAttrs.customAttr).toBe('value')
    expect(deltaAttrs.anotherCustom).toBe(123)

    const restored = DeltaUtils.deltaAttrsToFormatAttributes(deltaAttrs)
    expect(restored.customAttr).toBe('value')
    expect(restored.anotherCustom).toBe(123)
  })

  it('should handle empty attributes', () => {
    const attrs = {}
    const deltaAttrs = DeltaUtils.formatAttributesToDeltaAttrs(attrs)
    expect(Object.keys(deltaAttrs).length).toBe(0)
  })
})

describe('Delta - Range Conversion', () => {
  it('should convert ranges to Delta', () => {
    const ranges: FormatRange[] = [
      { text: 'Hello ', attributes: { bold: true } },
      { text: 'World', attributes: { italic: true } }
    ]

    const delta = DeltaUtils.fromRanges(ranges)

    expect(delta.ops.length).toBe(2)
    expect(delta.ops[0]).toEqual({ insert: 'Hello ', attributes: { bold: true } })
    expect(delta.ops[1]).toEqual({ insert: 'World', attributes: { italic: true } })
  })

  it('should convert Delta to ranges', () => {
    const delta: Delta = {
      ops: [
        { insert: 'Hello ', attributes: { bold: true } },
        { insert: 'World', attributes: { italic: true } }
      ]
    }

    const ranges = DeltaUtils.toRanges(delta)

    expect(ranges.length).toBe(2)
    expect(ranges[0]).toEqual({ text: 'Hello ', attributes: { bold: true } })
    expect(ranges[1]).toEqual({ text: 'World', attributes: { italic: true } })
  })

  it('should handle plain text without attributes', () => {
    const ranges: FormatRange[] = [
      { text: 'Plain text', attributes: {} }
    ]

    const delta = DeltaUtils.fromRanges(ranges)

    expect(delta.ops.length).toBe(1)
    expect(delta.ops[0]).toEqual({ insert: 'Plain text' })
  })

  it('should skip empty ranges', () => {
    const ranges: FormatRange[] = [
      { text: 'Hello', attributes: { bold: true } },
      { text: '', attributes: { italic: true } },
      { text: 'World', attributes: {} }
    ]

    const delta = DeltaUtils.fromRanges(ranges)

    expect(delta.ops.length).toBe(2)
    expect('insert' in delta.ops[0]! && delta.ops[0].insert).toBe('Hello')
    expect('insert' in delta.ops[1]! && delta.ops[1].insert).toBe('World')
  })

  it('should handle delete and retain ops in Delta to ranges', () => {
    const delta: Delta = {
      ops: [
        { insert: 'Hello' },
        { delete: 5 },
        { retain: 10 },
        { insert: 'World' }
      ]
    }

    const ranges = DeltaUtils.toRanges(delta)

    // Only insert ops are converted to ranges
    expect(ranges.length).toBe(2)
    expect(ranges[0]?.text).toBe('Hello')
    expect(ranges[1]?.text).toBe('World')
  })
})

describe('Delta - Round-trip Conversion', () => {
  it('should preserve data in round-trip conversion', () => {
    const original: FormatRange[] = [
      { text: 'Bold text', attributes: { bold: true } },
      { text: ' normal ', attributes: {} },
      { text: 'italic', attributes: { italic: true, color: '#FF0000' } }
    ]

    const delta = DeltaUtils.fromRanges(original)
    const restored = DeltaUtils.toRanges(delta)

    expect(restored.length).toBe(3)
    expect(restored[0]?.text).toBe('Bold text')
    expect(restored[0]?.attributes.bold).toBe(true)
    expect(restored[1]?.text).toBe(' normal ')
    expect(restored[2]?.text).toBe('italic')
    expect(restored[2]?.attributes.italic).toBe(true)
    expect(restored[2]?.attributes.color).toBe('#FF0000')
  })

  it('should handle complex formatting round-trip', () => {
    const original: FormatRange[] = [
      {
        text: 'Link text',
        attributes: {
          bold: true,
          underline: true,
          href: 'https://example.com',
          color: '#0000FF'
        }
      }
    ]

    const delta = DeltaUtils.fromRanges(original)
    const restored = DeltaUtils.toRanges(delta)

    expect(restored.length).toBe(1)
    expect(restored[0]?.attributes.bold).toBe(true)
    expect(restored[0]?.attributes.underline).toBe(true)
    expect(restored[0]?.attributes.href).toBe('https://example.com')
    expect(restored[0]?.attributes.color).toBe('#0000FF')
  })

  it('should handle empty content', () => {
    const original: FormatRange[] = []
    const delta = DeltaUtils.fromRanges(original)
    const restored = DeltaUtils.toRanges(delta)

    expect(DeltaUtils.isEmpty(delta)).toBe(true)
    expect(restored.length).toBe(0)
  })
})

describe('Delta - Composition', () => {
  it('should compose simple Deltas', () => {
    const a: Delta = {
      ops: [{ insert: 'Hello' }]
    }

    const b: Delta = {
      ops: [{ retain: 5 }, { insert: ' World' }]
    }

    const composed = DeltaUtils.compose(a, b)

    // Simplified composition
    expect(composed.ops.length).toBeGreaterThan(0)
  })

  it('should handle insert operations in composition', () => {
    const a: Delta = { ops: [{ insert: 'AB' }] }
    const b: Delta = { ops: [{ insert: 'X' }] }

    const composed = DeltaUtils.compose(a, b)

    expect(composed.ops.some(op => 'insert' in op && op.insert === 'X')).toBe(true)
  })
})
