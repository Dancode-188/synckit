/**
 * Peritext FormatSpan Implementation
 *
 * A FormatSpan represents a contiguous range of formatted text.
 * It consists of:
 * - A start StyleAnchor
 * - An end StyleAnchor
 * - A set of format attributes (bold, italic, color, etc.)
 *
 * FormatSpans are the core abstraction in Peritext for rich text formatting.
 */

import { StyleAnchor } from './anchor'
import { FormatAttributes, AttributeUtils } from './attributes'

/**
 * FormatSpan represents a formatted range of text
 *
 * Example:
 * ```
 * Text: "Hello world"
 * Bold span from positions 0-5:
 *   start: Anchor at character 1@client-a
 *   end: Anchor at character 5@client-a
 *   attributes: { bold: true }
 * Result: "**Hello** world"
 * ```
 */
export class FormatSpan {
  /**
   * The start anchor (marks beginning of formatting)
   */
  public readonly start: StyleAnchor

  /**
   * The end anchor (marks end of formatting)
   */
  public readonly end: StyleAnchor

  /**
   * The formatting attributes to apply to this span
   */
  public readonly attributes: FormatAttributes

  /**
   * Whether this span has been deleted (tombstone)
   * Deleted spans are retained to handle concurrent operations correctly
   */
  public readonly deleted: boolean

  /**
   * Create a new FormatSpan
   *
   * @param start - Start anchor
   * @param end - End anchor
   * @param attributes - Format attributes
   * @param deleted - Whether span is deleted (default: false)
   */
  constructor(
    start: StyleAnchor,
    end: StyleAnchor,
    attributes: FormatAttributes,
    deleted: boolean = false
  ) {
    // Validate that start and end anchors form a valid pair
    if (start.opId !== end.opId) {
      throw new Error(
        `Start and end anchors must have same opId. ` +
        `Got start=${start.opId}, end=${end.opId}`
      )
    }

    if (!start.isStart()) {
      throw new Error(`Start anchor must have type='start'. Got type='${start.type}'`)
    }

    if (!end.isEnd()) {
      throw new Error(`End anchor must have type='end'. Got type='${end.type}'`)
    }

    this.start = start
    this.end = end
    this.attributes = attributes
    this.deleted = deleted
  }

  /**
   * Get the operation ID (same for both start and end anchors)
   */
  get opId(): string {
    return this.start.opId
  }

  /**
   * Get the timestamp (use start anchor's timestamp)
   */
  get timestamp(): number {
    return this.start.timestamp
  }

  /**
   * Get the client ID (use start anchor's client ID)
   */
  get clientId(): string {
    return this.start.clientId
  }

  /**
   * Check if a character position is within this span
   *
   * @param characterId - Character ID to check
   * @param getPosition - Function to get position from character ID
   * @returns true if character is within span
   */
  contains(
    characterId: string,
    getPosition: (charId: string) => number
  ): boolean {
    if (this.deleted) {
      return false
    }

    const charPos = getPosition(characterId)
    const startPos = getPosition(this.start.characterId)
    const endPos = getPosition(this.end.characterId)

    return charPos >= startPos && charPos <= endPos
  }

  /**
   * Check if this span overlaps with another span
   *
   * Two spans overlap if they share any character positions.
   *
   * @param other - Another FormatSpan
   * @param getPosition - Function to get position from character ID
   * @returns true if spans overlap
   */
  overlaps(
    other: FormatSpan,
    getPosition: (charId: string) => number
  ): boolean {
    if (this.deleted || other.deleted) {
      return false
    }

    const thisStart = getPosition(this.start.characterId)
    const thisEnd = getPosition(this.end.characterId)
    const otherStart = getPosition(other.start.characterId)
    const otherEnd = getPosition(other.end.characterId)

    return thisStart <= otherEnd && otherStart <= thisEnd
  }

  /**
   * Merge this span with another overlapping span
   *
   * When two spans overlap, their attributes are merged according to
   * the merge strategies defined in AttributeUtils.
   *
   * @param other - Another FormatSpan to merge with
   * @param getPosition - Function to get position from character ID
   * @returns New FormatSpan with merged attributes, or null if no overlap
   */
  merge(
    other: FormatSpan,
    getPosition: (charId: string) => number
  ): FormatSpan | null {
    if (!this.overlaps(other, getPosition)) {
      return null
    }

    // Determine the overlapping range
    const thisStart = getPosition(this.start.characterId)
    const thisEnd = getPosition(this.end.characterId)
    const otherStart = getPosition(other.start.characterId)
    const otherEnd = getPosition(other.end.characterId)

    // Use the span that starts later and ends earlier (intersection)
    const mergedStart = thisStart > otherStart ? this.start : other.start
    const mergedEnd = thisEnd < otherEnd ? this.end : other.end

    // Merge attributes
    const mergedAttributes = AttributeUtils.merge(
      this.attributes,
      other.attributes,
      this.timestamp,
      other.timestamp
    )

    return new FormatSpan(
      mergedStart,
      mergedEnd,
      mergedAttributes,
      false
    )
  }

  /**
   * Mark this span as deleted
   *
   * Creates a new FormatSpan with deleted=true.
   * Deleted spans are kept as tombstones for correctness.
   *
   * @returns New deleted FormatSpan
   */
  markDeleted(): FormatSpan {
    return new FormatSpan(
      this.start,
      this.end,
      this.attributes,
      true
    )
  }

  /**
   * Create a copy of this span with new attributes
   *
   * @param newAttributes - New attributes to apply
   * @returns New FormatSpan with updated attributes
   */
  withAttributes(newAttributes: FormatAttributes): FormatSpan {
    return new FormatSpan(
      this.start,
      this.end,
      newAttributes,
      this.deleted
    )
  }

  /**
   * Create a copy of this span with new anchors
   *
   * This is used when characters are deleted and anchors need to be moved.
   *
   * @param newStart - New start anchor
   * @param newEnd - New end anchor
   * @returns New FormatSpan with updated anchors
   */
  withAnchors(newStart: StyleAnchor, newEnd: StyleAnchor): FormatSpan {
    return new FormatSpan(
      newStart,
      newEnd,
      this.attributes,
      this.deleted
    )
  }

  /**
   * Serialize span to JSON for network transmission
   */
  toJSON(): SpanJSON {
    return {
      s: this.start.toJSON(),
      e: this.end.toJSON(),
      a: AttributeUtils.toJSON(this.attributes),
      d: this.deleted ? 1 : undefined
    }
  }

  /**
   * Deserialize span from JSON
   */
  static fromJSON(json: SpanJSON): FormatSpan {
    return new FormatSpan(
      StyleAnchor.fromJSON(json.s),
      StyleAnchor.fromJSON(json.e),
      AttributeUtils.fromJSON(json.a),
      json.d === 1
    )
  }

  /**
   * Create a human-readable string representation
   */
  toString(): string {
    const deletedStr = this.deleted ? ' [DELETED]' : ''
    return (
      `Span(${this.start.characterId}→${this.end.characterId}, ` +
      `${AttributeUtils.toString(this.attributes)}${deletedStr})`
    )
  }

  /**
   * Check equality with another span
   */
  equals(other: FormatSpan): boolean {
    return (
      this.start.equals(other.start) &&
      this.end.equals(other.end) &&
      AttributeUtils.equals(this.attributes, other.attributes) &&
      this.deleted === other.deleted
    )
  }

  /**
   * Clone this span
   */
  clone(): FormatSpan {
    return new FormatSpan(
      this.start.clone(),
      this.end.clone(),
      AttributeUtils.clone(this.attributes),
      this.deleted
    )
  }

  /**
   * Get the length of this span in characters
   *
   * @param getPosition - Function to get position from character ID
   * @returns Number of characters in this span
   */
  getLength(getPosition: (charId: string) => number): number {
    const startPos = getPosition(this.start.characterId)
    const endPos = getPosition(this.end.characterId)
    return Math.max(0, endPos - startPos + 1)
  }

  /**
   * Check if this span is empty (zero length)
   *
   * @param getPosition - Function to get position from character ID
   * @returns true if span has zero length
   */
  isEmpty(getPosition: (charId: string) => number): boolean {
    return this.getLength(getPosition) === 0
  }
}

/**
 * Compact JSON representation for network efficiency
 */
export interface SpanJSON {
  /** Start anchor */
  s: any
  /** End anchor */
  e: any
  /** Attributes */
  a: any
  /** Deleted flag (1 if deleted, undefined otherwise) */
  d?: 1
}

/**
 * Utilities for working with FormatSpans
 */
export const SpanUtils = {
  /**
   * Sort spans by their start position
   *
   * @param spans - Spans to sort
   * @param getPosition - Function to get position from character ID
   * @returns Sorted spans
   */
  sort(
    spans: FormatSpan[],
    getPosition: (charId: string) => number
  ): FormatSpan[] {
    return [...spans].sort((a, b) => {
      const aPos = getPosition(a.start.characterId)
      const bPos = getPosition(b.start.characterId)
      return aPos - bPos
    })
  },

  /**
   * Filter out deleted spans
   *
   * @param spans - Spans to filter
   * @returns Only non-deleted spans
   */
  removeDeleted(spans: FormatSpan[]): FormatSpan[] {
    return spans.filter(span => !span.deleted)
  },

  /**
   * Find all spans that contain a specific character
   *
   * @param characterId - Character ID to search for
   * @param spans - Spans to search
   * @param getPosition - Function to get position from character ID
   * @returns Spans containing the character
   */
  findContaining(
    characterId: string,
    spans: FormatSpan[],
    getPosition: (charId: string) => number
  ): FormatSpan[] {
    return spans.filter(span => span.contains(characterId, getPosition))
  },

  /**
   * Find all spans that overlap with a given range
   *
   * @param startPos - Start position
   * @param endPos - End position
   * @param spans - Spans to search
   * @param getPosition - Function to get position from character ID
   * @returns Overlapping spans
   */
  findOverlapping(
    startPos: number,
    endPos: number,
    spans: FormatSpan[],
    getPosition: (charId: string) => number
  ): FormatSpan[] {
    return spans.filter(span => {
      const spanStart = getPosition(span.start.characterId)
      const spanEnd = getPosition(span.end.characterId)
      return spanStart <= endPos && startPos <= spanEnd
    })
  },

  /**
   * Merge all overlapping spans at a specific position
   *
   * This computes the combined formatting at a given character position
   * by merging all spans that contain that position.
   *
   * @param characterId - Character ID to get formats for
   * @param spans - All format spans
   * @param getPosition - Function to get position from character ID
   * @returns Merged attributes at this position
   */
  getFormatsAt(
    characterId: string,
    spans: FormatSpan[],
    getPosition: (charId: string) => number
  ): FormatAttributes {
    const containingSpans = SpanUtils.findContaining(
      characterId,
      spans,
      getPosition
    )

    if (containingSpans.length === 0) {
      return {}
    }

    // Sort by timestamp (earlier spans first)
    const sorted = [...containingSpans].sort((a, b) => a.timestamp - b.timestamp)

    // Merge attributes in timestamp order
    let result: FormatAttributes = {}
    for (const span of sorted) {
      result = AttributeUtils.merge(
        result,
        span.attributes,
        0, // Not used since we're applying in order
        1  // Not used since we're applying in order
      )
    }

    return result
  }
}
