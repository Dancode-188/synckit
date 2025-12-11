/**
 * Quill Delta Format Support
 *
 * Provides utilities for converting between RichText CRDT and Quill Delta format.
 * Delta is a simple yet expressive format for describing rich text documents
 * and changes to them.
 *
 * Delta format consists of operations:
 * - insert: { insert: "text", attributes: {...} }
 * - delete: { delete: length }
 * - retain: { retain: length, attributes: {...} } (for formatting)
 *
 * @see https://quilljs.com/docs/delta/
 */

import type { FormatAttributes } from './peritext/attributes'

/**
 * Delta operation types
 */
export type DeltaInsertOp = {
  insert: string
  attributes?: Record<string, any>
}

export type DeltaDeleteOp = {
  delete: number
}

export type DeltaRetainOp = {
  retain: number
  attributes?: Record<string, any>
}

export type DeltaOp = DeltaInsertOp | DeltaDeleteOp | DeltaRetainOp

/**
 * Delta document representation
 */
export interface Delta {
  ops: DeltaOp[]
}

/**
 * Formatted text range (internal representation)
 */
export interface FormatRange {
  text: string
  attributes: FormatAttributes
}

/**
 * Delta utilities for conversion
 */
export const DeltaUtils = {
  /**
   * Convert formatted ranges to Delta format
   *
   * Takes an array of text ranges with their formatting and converts
   * to a Delta document. This is the primary export format.
   *
   * @param ranges - Array of formatted text ranges
   * @returns Delta document
   */
  fromRanges(ranges: FormatRange[]): Delta {
    const ops: DeltaOp[] = []

    for (const range of ranges) {
      if (range.text.length === 0) {
        continue // Skip empty ranges
      }

      const attributes = DeltaUtils.formatAttributesToDeltaAttrs(range.attributes)

      if (Object.keys(attributes).length > 0) {
        ops.push({
          insert: range.text,
          attributes
        })
      } else {
        ops.push({
          insert: range.text
        })
      }
    }

    return { ops }
  },

  /**
   * Convert Delta to an array of formatted ranges
   *
   * Takes a Delta document and extracts text with formatting information.
   * This is used for importing Delta content into RichText.
   *
   * @param delta - Delta document
   * @returns Array of formatted ranges
   */
  toRanges(delta: Delta): FormatRange[] {
    const ranges: FormatRange[] = []

    for (const op of delta.ops) {
      if ('insert' in op && typeof op.insert === 'string') {
        const attributes = DeltaUtils.deltaAttrsToFormatAttributes(
          op.attributes || {}
        )

        ranges.push({
          text: op.insert,
          attributes
        })
      }
      // Skip delete and retain ops in document representation
    }

    return ranges
  },

  /**
   * Convert FormatAttributes to Delta attributes
   *
   * Maps our internal attribute format to Quill Delta attribute format.
   * Handles boolean attributes, color values, and links.
   *
   * @param attrs - Internal format attributes
   * @returns Delta-compatible attributes
   */
  formatAttributesToDeltaAttrs(attrs: FormatAttributes): Record<string, any> {
    const delta: Record<string, any> = {}

    if (attrs.bold) delta.bold = true
    if (attrs.italic) delta.italic = true
    if (attrs.underline) delta.underline = true
    if (attrs.strikethrough) delta.strike = true

    if (attrs.color) delta.color = attrs.color
    if (attrs.background) delta.background = attrs.background

    if (attrs.href) delta.link = attrs.href

    // Pass through any custom attributes
    for (const key of Object.keys(attrs)) {
      if (
        !['bold', 'italic', 'underline', 'strikethrough', 'color', 'background', 'href'].includes(
          key
        )
      ) {
        delta[key] = attrs[key as keyof FormatAttributes]
      }
    }

    return delta
  },

  /**
   * Convert Delta attributes to FormatAttributes
   *
   * Maps Quill Delta attribute format to our internal format.
   * Handles attribute name differences (strike → strikethrough, link → href).
   *
   * @param deltaAttrs - Delta attributes
   * @returns Internal format attributes
   */
  deltaAttrsToFormatAttributes(deltaAttrs: Record<string, any>): FormatAttributes {
    const attrs: FormatAttributes = {}

    if (deltaAttrs.bold) attrs.bold = true
    if (deltaAttrs.italic) attrs.italic = true
    if (deltaAttrs.underline) attrs.underline = true
    if (deltaAttrs.strike) attrs.strikethrough = true

    if (deltaAttrs.color) attrs.color = deltaAttrs.color
    if (deltaAttrs.background) attrs.background = deltaAttrs.background

    if (deltaAttrs.link) attrs.href = deltaAttrs.link

    // Pass through any custom attributes
    for (const key of Object.keys(deltaAttrs)) {
      if (
        !['bold', 'italic', 'underline', 'strike', 'color', 'background', 'link'].includes(key)
      ) {
        attrs[key as keyof FormatAttributes] = deltaAttrs[key]
      }
    }

    return attrs
  },

  /**
   * Create an empty Delta document
   */
  empty(): Delta {
    return { ops: [] }
  },

  /**
   * Check if Delta is empty
   */
  isEmpty(delta: Delta): boolean {
    return delta.ops.length === 0
  },

  /**
   * Get the length of a Delta document (character count)
   */
  length(delta: Delta): number {
    let len = 0

    for (const op of delta.ops) {
      if ('insert' in op && typeof op.insert === 'string') {
        len += op.insert.length
      } else if ('retain' in op) {
        len += op.retain
      }
      // Delete ops don't affect document length
    }

    return len
  },

  /**
   * Compose two Deltas (apply changes)
   *
   * Applies a change Delta to a document Delta, producing a new document.
   * This is useful for applying incremental changes.
   *
   * @param a - Base Delta (document)
   * @param b - Change Delta (operations to apply)
   * @returns New composed Delta
   */
  compose(a: Delta, b: Delta): Delta {
    // Simplified composition - for full implementation would need
    // to handle interleaving of operations properly
    const ops: DeltaOp[] = []
    let aIndex = 0
    let bIndex = 0

    while (aIndex < a.ops.length || bIndex < b.ops.length) {
      const aOp = a.ops[aIndex]
      const bOp = b.ops[bIndex]

      if (!bOp) {
        // No more b ops, append remaining a ops
        if (aOp) ops.push(aOp)
        aIndex++
      } else if ('insert' in bOp) {
        // Insert from b
        ops.push(bOp)
        bIndex++
      } else if (!aOp) {
        // No more a ops, b ops are invalid (can't retain/delete nothing)
        bIndex++
      } else {
        // Complex case: retain/delete from b applied to a
        // For now, just advance
        if ('retain' in bOp) {
          ops.push(aOp)
        }
        // If delete, skip aOp
        aIndex++
        bIndex++
      }
    }

    return { ops }
  },

  /**
   * Clone a Delta
   */
  clone(delta: Delta): Delta {
    return {
      ops: delta.ops.map(op => ({ ...op }))
    }
  },

  /**
   * Convert Delta to plain text (strip formatting)
   */
  toPlainText(delta: Delta): string {
    let text = ''

    for (const op of delta.ops) {
      if ('insert' in op && typeof op.insert === 'string') {
        text += op.insert
      }
    }

    return text
  },

  /**
   * Validate Delta structure
   *
   * Checks if a Delta object is well-formed.
   * Returns error message if invalid, undefined if valid.
   */
  validate(delta: Delta): string | undefined {
    if (!delta || typeof delta !== 'object') {
      return 'Delta must be an object'
    }

    if (!Array.isArray(delta.ops)) {
      return 'Delta.ops must be an array'
    }

    for (let i = 0; i < delta.ops.length; i++) {
      const op = delta.ops[i]

      if (!op || typeof op !== 'object') {
        return `Operation at index ${i} must be an object`
      }

      const hasInsert = 'insert' in op
      const hasDelete = 'delete' in op
      const hasRetain = 'retain' in op

      const opCount = [hasInsert, hasDelete, hasRetain].filter(Boolean).length

      if (opCount !== 1) {
        return `Operation at index ${i} must have exactly one of insert/delete/retain`
      }

      if (hasInsert && typeof op.insert !== 'string') {
        return `Operation at index ${i}: insert must be a string`
      }

      if (hasDelete && (typeof op.delete !== 'number' || op.delete <= 0)) {
        return `Operation at index ${i}: delete must be a positive number`
      }

      if (hasRetain && (typeof op.retain !== 'number' || op.retain <= 0)) {
        return `Operation at index ${i}: retain must be a positive number`
      }

      // Check attributes (only valid for insert and retain ops)
      if ('attributes' in op && op.attributes && typeof op.attributes !== 'object') {
        return `Operation at index ${i}: attributes must be an object`
      }
    }

    return undefined
  }
}
