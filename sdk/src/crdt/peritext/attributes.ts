/**
 * Peritext Format Attributes
 *
 * Defines the formatting attributes that can be applied to text spans.
 * Attributes are extensible - custom attributes can be added for
 * domain-specific use cases.
 */

/**
 * Base format attributes supported by Peritext
 *
 * These cover the most common rich text formatting needs:
 * - Text styles (bold, italic, underline, strikethrough)
 * - Colors (text color, background color)
 * - Links (href attribute)
 *
 * All attributes are optional. When an attribute is undefined,
 * it means "no formatting applied" for that attribute.
 */
export interface FormatAttributes {
  /** Bold text */
  bold?: boolean

  /** Italic text */
  italic?: boolean

  /** Underlined text */
  underline?: boolean

  /** Strikethrough text */
  strikethrough?: boolean

  /** Text color (hex format: #RRGGBB) */
  color?: string

  /** Background color (hex format: #RRGGBB) */
  background?: string

  /** Link URL (makes text a hyperlink) */
  href?: string

  /**
   * Extensible: Custom attributes for domain-specific formatting
   *
   * Examples:
   * - 'font-family': 'Arial'
   * - 'font-size': '14px'
   * - 'data-user-id': '123'
   * - 'comment-id': 'comment-456'
   */
  [key: string]: any
}

/**
 * Compact JSON representation for network efficiency
 */
export interface AttributesJSON {
  /** Bold */
  b?: 1
  /** Italic */
  i?: 1
  /** Underline */
  u?: 1
  /** Strikethrough */
  s?: 1
  /** Color */
  c?: string
  /** Background */
  bg?: string
  /** Href */
  h?: string
  /** Custom attributes */
  x?: Record<string, any>
}

/**
 * Attribute merge strategies
 *
 * When multiple formatting spans overlap, we need to merge their attributes.
 * Different attributes have different merge behaviors.
 */
export enum MergeStrategy {
  /**
   * UNION: Combine all truthy values
   * Used for: bold, italic, underline, strikethrough
   * Example: bold=true + italic=true = { bold: true, italic: true }
   */
  UNION = 'union',

  /**
   * LAST_WRITE_WINS: Most recent timestamp wins
   * Used for: color, background, href
   * Example: color='red'@t1 + color='blue'@t2 = color='blue'
   */
  LAST_WRITE_WINS = 'lww',

  /**
   * CUSTOM: Domain-specific merge logic
   * Used for: Custom attributes that need special handling
   */
  CUSTOM = 'custom'
}

/**
 * Metadata about how each attribute should be merged
 */
const ATTRIBUTE_METADATA: Record<string, MergeStrategy> = {
  bold: MergeStrategy.UNION,
  italic: MergeStrategy.UNION,
  underline: MergeStrategy.UNION,
  strikethrough: MergeStrategy.UNION,
  color: MergeStrategy.LAST_WRITE_WINS,
  background: MergeStrategy.LAST_WRITE_WINS,
  href: MergeStrategy.LAST_WRITE_WINS
}

/**
 * Utilities for working with format attributes
 */
export const AttributeUtils = {
  /**
   * Merge two attribute objects
   *
   * Applies appropriate merge strategy for each attribute.
   * Timestamps are used to resolve conflicts for LWW attributes.
   *
   * @param attrs1 - First attribute set
   * @param attrs2 - Second attribute set
   * @param timestamp1 - Timestamp of first attributes
   * @param timestamp2 - Timestamp of second attributes
   * @returns Merged attributes
   */
  merge(
    attrs1: FormatAttributes,
    attrs2: FormatAttributes,
    timestamp1: number,
    timestamp2: number
  ): FormatAttributes {
    const result: FormatAttributes = {}

    // Merge attrs1
    for (const [key, value] of Object.entries(attrs1)) {
      if (value !== undefined && value !== null) {
        result[key] = value
      }
    }

    // Merge attrs2
    for (const [key, value] of Object.entries(attrs2)) {
      if (value === undefined || value === null) {
        continue
      }

      const strategy = ATTRIBUTE_METADATA[key] || MergeStrategy.LAST_WRITE_WINS

      if (strategy === MergeStrategy.UNION) {
        // UNION: Combine truthy values
        result[key] = result[key] || value
      } else if (strategy === MergeStrategy.LAST_WRITE_WINS) {
        // LWW: Higher timestamp wins
        if (timestamp2 > timestamp1 || result[key] === undefined) {
          result[key] = value
        }
      } else {
        // CUSTOM or unknown: default to LWW
        if (timestamp2 > timestamp1 || result[key] === undefined) {
          result[key] = value
        }
      }
    }

    return result
  },

  /**
   * Check if two attribute sets are equal
   */
  equals(attrs1: FormatAttributes, attrs2: FormatAttributes): boolean {
    const keys1 = Object.keys(attrs1).filter(k => attrs1[k] !== undefined)
    const keys2 = Object.keys(attrs2).filter(k => attrs2[k] !== undefined)

    if (keys1.length !== keys2.length) {
      return false
    }

    for (const key of keys1) {
      if (attrs1[key] !== attrs2[key]) {
        return false
      }
    }

    return true
  },

  /**
   * Check if attribute set is empty (no formatting)
   */
  isEmpty(attrs: FormatAttributes): boolean {
    return Object.keys(attrs).every(k => attrs[k] === undefined || attrs[k] === null)
  },

  /**
   * Remove specific attributes from an attribute set
   *
   * @param attrs - Attributes to modify
   * @param toRemove - Attributes to remove
   * @returns New attribute set with specified attributes removed
   */
  remove(attrs: FormatAttributes, toRemove: FormatAttributes): FormatAttributes {
    const result: FormatAttributes = { ...attrs }

    for (const key of Object.keys(toRemove)) {
      if (toRemove[key] !== undefined && toRemove[key] !== null) {
        delete result[key]
      }
    }

    return result
  },

  /**
   * Apply new attributes on top of existing ones
   *
   * @param base - Base attributes
   * @param overlay - Attributes to apply on top
   * @returns New attribute set with overlay applied
   */
  apply(base: FormatAttributes, overlay: FormatAttributes): FormatAttributes {
    return { ...base, ...overlay }
  },

  /**
   * Convert attributes to compact JSON for network transmission
   */
  toJSON(attrs: FormatAttributes): AttributesJSON {
    const json: AttributesJSON = {}

    if (attrs.bold) json.b = 1
    if (attrs.italic) json.i = 1
    if (attrs.underline) json.u = 1
    if (attrs.strikethrough) json.s = 1
    if (attrs.color) json.c = attrs.color
    if (attrs.background) json.bg = attrs.background
    if (attrs.href) json.h = attrs.href

    // Custom attributes
    const customKeys = Object.keys(attrs).filter(
      k => !['bold', 'italic', 'underline', 'strikethrough', 'color', 'background', 'href'].includes(k)
    )

    if (customKeys.length > 0) {
      json.x = {}
      for (const key of customKeys) {
        json.x[key] = attrs[key]
      }
    }

    return json
  },

  /**
   * Convert compact JSON back to attributes
   */
  fromJSON(json: AttributesJSON): FormatAttributes {
    const attrs: FormatAttributes = {}

    if (json.b) attrs.bold = true
    if (json.i) attrs.italic = true
    if (json.u) attrs.underline = true
    if (json.s) attrs.strikethrough = true
    if (json.c) attrs.color = json.c
    if (json.bg) attrs.background = json.bg
    if (json.h) attrs.href = json.h

    // Custom attributes
    if (json.x) {
      Object.assign(attrs, json.x)
    }

    return attrs
  },

  /**
   * Create a human-readable string representation
   */
  toString(attrs: FormatAttributes): string {
    const parts: string[] = []

    if (attrs.bold) parts.push('bold')
    if (attrs.italic) parts.push('italic')
    if (attrs.underline) parts.push('underline')
    if (attrs.strikethrough) parts.push('strikethrough')
    if (attrs.color) parts.push(`color:${attrs.color}`)
    if (attrs.background) parts.push(`bg:${attrs.background}`)
    if (attrs.href) parts.push(`link:${attrs.href}`)

    const customKeys = Object.keys(attrs).filter(
      k => !['bold', 'italic', 'underline', 'strikethrough', 'color', 'background', 'href'].includes(k)
    )
    for (const key of customKeys) {
      parts.push(`${key}:${attrs[key]}`)
    }

    return parts.length > 0 ? `[${parts.join(', ')}]` : '[none]'
  },

  /**
   * Validate attribute values
   *
   * Ensures color values are valid hex colors, etc.
   * Returns error message if invalid, undefined if valid.
   */
  validate(attrs: FormatAttributes): string | undefined {
    // Validate colors (should be hex format)
    if (attrs.color && !AttributeUtils.isValidHexColor(attrs.color)) {
      return `Invalid color: ${attrs.color}. Expected hex format (#RRGGBB)`
    }

    if (attrs.background && !AttributeUtils.isValidHexColor(attrs.background)) {
      return `Invalid background: ${attrs.background}. Expected hex format (#RRGGBB)`
    }

    // Validate href (should be a string)
    if (attrs.href !== undefined && typeof attrs.href !== 'string') {
      return `Invalid href: ${attrs.href}. Expected string`
    }

    return undefined
  },

  /**
   * Check if a string is a valid hex color
   */
  isValidHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color)
  },

  /**
   * Clone an attribute set
   */
  clone(attrs: FormatAttributes): FormatAttributes {
    return { ...attrs }
  }
}

/**
 * Preset attribute combinations for common use cases
 */
export const AttributePresets = {
  /** No formatting */
  NONE: {} as FormatAttributes,

  /** Bold text */
  BOLD: { bold: true } as FormatAttributes,

  /** Italic text */
  ITALIC: { italic: true } as FormatAttributes,

  /** Underlined text */
  UNDERLINE: { underline: true } as FormatAttributes,

  /** Strikethrough text */
  STRIKETHROUGH: { strikethrough: true } as FormatAttributes,

  /** Bold + Italic */
  BOLD_ITALIC: { bold: true, italic: true } as FormatAttributes,

  /**
   * Create a color attribute
   */
  color(hex: string): FormatAttributes {
    return { color: hex }
  },

  /**
   * Create a background color attribute
   */
  background(hex: string): FormatAttributes {
    return { background: hex }
  },

  /**
   * Create a link attribute
   */
  link(url: string): FormatAttributes {
    return { href: url }
  }
}
