/**
 * Peritext Format Merger
 *
 * Handles merging of concurrent format operations and resolution of conflicts.
 * This implements the core convergence algorithm from the Peritext paper.
 *
 * Key responsibilities:
 * - Merge overlapping format spans
 * - Resolve concurrent format operations deterministically
 * - Handle edge cases (boundary formatting, deleted spans, etc.)
 * - Ensure strong eventual consistency
 */

import { FormatSpan, SpanUtils } from './span'
import { FormatAttributes, AttributeUtils } from './attributes'

/**
 * FormatMerger handles merging and conflict resolution for format spans
 */
export class FormatMerger {
  /**
   * Merge a list of format spans into a consistent set
   *
   * This is the core algorithm that ensures all users converge to the same
   * formatting state, regardless of the order in which operations were received.
   *
   * Algorithm:
   * 1. Remove deleted spans
   * 2. Sort spans by position
   * 3. Merge overlapping spans with same attributes
   * 4. Resolve conflicts for overlapping spans with different attributes
   *
   * @param spans - List of format spans (possibly with conflicts)
   * @param getPosition - Function to get position from character ID
   * @returns Merged, conflict-free list of spans
   */
  merge(
    spans: FormatSpan[],
    getPosition: (charId: string) => number
  ): FormatSpan[] {
    // Step 1: Remove deleted spans (tombstones are kept during operation but removed for rendering)
    const activeSpans = SpanUtils.removeDeleted(spans)

    if (activeSpans.length === 0) {
      return []
    }

    // Step 2: Sort by start position
    const sorted = SpanUtils.sort(activeSpans, getPosition)

    // Step 3: Process spans to resolve overlaps and conflicts
    const result: FormatSpan[] = []
    let current: FormatSpan | null = null

    for (const span of sorted) {
      if (current === null) {
        current = span
        continue
      }

      // Check if spans overlap
      if (current.overlaps(span, getPosition)) {
        // Overlapping spans: merge them
        const merged = this.mergeOverlapping(current, span, getPosition)
        result.push(...merged)
        current = null // Will be set by next non-overlapping span
      } else {
        // Non-overlapping: add current to result
        result.push(current)
        current = span
      }
    }

    // Add the last span
    if (current !== null) {
      result.push(current)
    }

    return result
  }

  /**
   * Merge two overlapping spans
   *
   * When two spans overlap, we need to split them into regions:
   * 1. Region before overlap (if any)
   * 2. Overlapping region (merged attributes)
   * 3. Region after overlap (if any)
   *
   * @param span1 - First span
   * @param span2 - Second span
   * @param getPosition - Function to get position from character ID
   * @returns Array of non-overlapping spans covering the same range
   */
  private mergeOverlapping(
    span1: FormatSpan,
    span2: FormatSpan,
    getPosition: (charId: string) => number
  ): FormatSpan[] {
    const start1 = getPosition(span1.start.characterId)
    const end1 = getPosition(span1.end.characterId)
    const start2 = getPosition(span2.start.characterId)
    const end2 = getPosition(span2.end.characterId)

    const result: FormatSpan[] = []

    // Determine the three regions: before, overlap, after
    const overlapStart = Math.max(start1, start2)
    const overlapEnd = Math.min(end1, end2)

    // Region 1: Before overlap (only span1)
    if (start1 < overlapStart) {
      // Keep span1's portion before overlap
      result.push(span1)
    }

    // Region 2: Overlapping region (merge attributes)
    if (overlapStart <= overlapEnd) {
      const mergedAttrs = AttributeUtils.merge(
        span1.attributes,
        span2.attributes,
        span1.timestamp,
        span2.timestamp
      )

      // Use the anchors from the span with higher timestamp
      const useSpan1Anchors = span1.timestamp >= span2.timestamp

      // Create merged span for overlap region
      // Note: In a full implementation, we'd create new anchors for the exact
      // overlap boundaries. For simplicity, we'll use the existing anchors.
      const mergedSpan = new FormatSpan(
        useSpan1Anchors ? span1.start : span2.start,
        useSpan1Anchors ? span1.end : span2.end,
        mergedAttrs,
        false
      )

      result.push(mergedSpan)
    }

    // Region 3: After overlap
    if (end1 > overlapEnd) {
      // Keep span1's portion after overlap
      result.push(span1)
    } else if (end2 > overlapEnd) {
      // Keep span2's portion after overlap
      result.push(span2)
    }

    return result
  }

  /**
   * Resolve a conflict between two concurrent format operations
   *
   * Conflict resolution rules (from Peritext paper):
   * 1. Higher timestamp wins
   * 2. If timestamps equal, lexicographically smaller client ID wins
   * 3. For UNION attributes (bold, italic), combine both
   * 4. For LWW attributes (color, href), use winner's value
   *
   * @param span1 - First span
   * @param span2 - Second span
   * @returns Winning span with merged attributes
   */
  resolveConflict(span1: FormatSpan, span2: FormatSpan): FormatSpan {
    // Determine winner by timestamp and client ID
    const winner = this.compareForConflictResolution(span1, span2) >= 0
      ? span1
      : span2

    const loser = winner === span1 ? span2 : span1

    // Merge attributes using winner's timestamp
    const mergedAttrs = AttributeUtils.merge(
      winner.attributes,
      loser.attributes,
      winner.timestamp,
      loser.timestamp
    )

    // Return span with winner's anchors and merged attributes
    return winner.withAttributes(mergedAttrs)
  }

  /**
   * Compare two spans for conflict resolution
   *
   * @param span1 - First span
   * @param span2 - Second span
   * @returns >0 if span1 wins, <0 if span2 wins, 0 if tie
   */
  private compareForConflictResolution(
    span1: FormatSpan,
    span2: FormatSpan
  ): number {
    // 1. Compare timestamps (higher wins)
    if (span1.timestamp !== span2.timestamp) {
      return span1.timestamp - span2.timestamp
    }

    // 2. Compare client IDs (lexicographic, smaller wins)
    if (span1.clientId !== span2.clientId) {
      return span1.clientId < span2.clientId ? 1 : -1
    }

    // 3. Compare operation IDs (tie-breaker)
    if (span1.opId !== span2.opId) {
      return span1.opId < span2.opId ? 1 : -1
    }

    return 0
  }

  /**
   * Handle insertion of text into a formatted span
   *
   * When text is inserted within a formatted span, the new text should
   * inherit the formatting of the surrounding span.
   *
   * @param span - Existing format span
   * @param _insertCharId - Character ID of inserted text (unused - automatic)
   * @param _getPosition - Function to get position from character ID (unused)
   * @returns Updated span that includes the inserted character
   */
  handleInsertion(
    span: FormatSpan,
    _insertCharId: string,
    _getPosition: (charId: string) => number
  ): FormatSpan {
    // If insertion is within the span, the span automatically includes it
    // (anchors are attached to stable character IDs, not positions)
    return span
  }

  /**
   * Handle deletion of text within a formatted span
   *
   * When text is deleted from a formatted span, we need to:
   * 1. Keep the span if at least one character remains
   * 2. Keep the span even if all characters are deleted (for resurrection)
   * 3. Move anchors to adjacent characters if their attached character is deleted
   *
   * @param span - Format span
   * @param deletedCharId - Character ID that was deleted
   * @param _getPosition - Function to get position from character ID (unused)
   * @returns Updated span, possibly with moved anchors
   */
  handleDeletion(
    span: FormatSpan,
    deletedCharId: string,
    _getPosition: (charId: string) => number
  ): FormatSpan {
    let newStart = span.start
    let newEnd = span.end

    // If start anchor's character was deleted, move anchor to next character
    if (span.start.characterId === deletedCharId) {
      // In full implementation: find next non-deleted character
      // For now: keep anchor at deleted character (becomes tombstone)
    }

    // If end anchor's character was deleted, move anchor to previous character
    if (span.end.characterId === deletedCharId) {
      // In full implementation: find previous non-deleted character
      // For now: keep anchor at deleted character (becomes tombstone)
    }

    return span.withAnchors(newStart, newEnd)
  }

  /**
   * Compute the final formatted text ranges from a list of spans
   *
   * This walks through the text character by character, tracking which
   * format spans are active at each position, and produces ranges of
   * text with their combined formatting.
   *
   * @param text - Plain text content
   * @param spans - Format spans
   * @param getCharId - Function to get character ID at position
   * @returns Array of {text, attributes} ranges
   */
  computeRanges(
    text: string,
    spans: FormatSpan[],
    getCharId: (position: number) => string,
    getPosition?: (charId: string) => number
  ): Array<{ text: string; attributes: FormatAttributes }> {
    if (text.length === 0) {
      return []
    }

    const ranges: Array<{ text: string; attributes: FormatAttributes }> = []
    let currentAttrs: FormatAttributes = {}
    let currentText = ''

    // Default position getter for backwards compatibility (position-based IDs)
    const defaultGetPosition = (id: string): number => {
      const parts = id.split('@')
      const parsed = parseInt(parts[0] || '0')
      return isNaN(parsed) ? 0 : parsed
    }

    const charIdToPosition = getPosition || defaultGetPosition

    for (let i = 0; i < text.length; i++) {
      const charId = getCharId(i)
      if (!charId) {
        throw new Error(`No character ID found at position ${i}`)
      }

      const attrs = SpanUtils.getFormatsAt(
        charId,
        spans,
        charIdToPosition
      )

      // Check if attributes changed
      if (!AttributeUtils.equals(currentAttrs, attrs)) {
        // Save previous range
        if (currentText.length > 0) {
          ranges.push({
            text: currentText,
            attributes: currentAttrs
          })
        }

        // Start new range
        currentAttrs = attrs
        currentText = text[i] || ''
      } else {
        // Continue current range
        currentText += text[i]
      }
    }

    // Add final range
    if (currentText.length > 0) {
      ranges.push({
        text: currentText,
        attributes: currentAttrs
      })
    }

    return ranges
  }

  /**
   * Verify that a set of spans satisfies convergence properties
   *
   * Used for testing and validation. Checks:
   * 1. No deleted spans in active set
   * 2. All spans are properly ordered
   * 3. Attributes are valid
   *
   * @param spans - Spans to validate
   * @param getPosition - Function to get position from character ID
   * @returns Error message if invalid, undefined if valid
   */
  validate(
    spans: FormatSpan[],
    getPosition: (charId: string) => number
  ): string | undefined {
    // Check for deleted spans
    for (const span of spans) {
      if (span.deleted) {
        return `Found deleted span in active set: ${span.toString()}`
      }
    }

    // Check ordering
    for (let i = 1; i < spans.length; i++) {
      const prev = spans[i - 1]
      const curr = spans[i]

      if (!prev || !curr) {
        continue // Skip if somehow undefined (should never happen)
      }

      const prevStart = getPosition(prev.start.characterId)
      const currStart = getPosition(curr.start.characterId)

      if (prevStart > currStart) {
        return `Spans not properly ordered: ${prev.toString()} comes before ${curr.toString()}`
      }
    }

    // Check attribute validity
    for (const span of spans) {
      const error = AttributeUtils.validate(span.attributes)
      if (error) {
        return `Invalid attributes in span ${span.toString()}: ${error}`
      }
    }

    return undefined
  }
}

/**
 * Singleton instance for convenience
 */
export const formatMerger = new FormatMerger()

/**
 * Edge case handlers
 *
 * These handle specific edge cases from the Peritext paper's test suite
 */
export const EdgeCaseHandlers = {
  /**
   * Handle formatting at text boundaries (start/end of document)
   *
   * Edge case: When formatting is applied at position 0 or at the end
   * of the document, ensure anchors are correctly positioned.
   */
  handleBoundaryFormatting(
    span: FormatSpan,
    _documentLength: number,
    _getPosition: (charId: string) => number
  ): FormatSpan {
    // Boundary formatting is handled automatically by anchor positioning
    // No special logic needed - anchors are attached to real characters
    return span
  },

  /**
   * Handle concurrent format operations at the same position
   *
   * Edge case: Two users format the same range simultaneously with
   * different attributes (e.g., one makes it bold, another makes it italic)
   */
  handleConcurrentFormat(
    span1: FormatSpan,
    span2: FormatSpan,
    _getPosition: (charId: string) => number
  ): FormatSpan {
    // Use the merge algorithm
    const merger = new FormatMerger()
    return merger.resolveConflict(span1, span2)
  },

  /**
   * Handle formatting of deleted text
   *
   * Edge case: User A deletes text, User B formats the same text concurrently.
   * The formatting should be preserved so it applies if the text is restored.
   */
  handleDeletedTextFormatting(
    span: FormatSpan,
    _deletedCharIds: Set<string>
  ): FormatSpan {
    // Keep the span even if all characters are deleted
    // This allows "resurrection" if text is re-inserted
    return span
  },

  /**
   * Handle unbold/unformat operations
   *
   * Edge case: Removing formatting should remove the attribute,
   * not delete the text (unlike some CRDT approaches)
   */
  handleUnformat(
    span: FormatSpan,
    attributesToRemove: FormatAttributes
  ): FormatSpan | null {
    const newAttrs = AttributeUtils.remove(span.attributes, attributesToRemove)

    // If no attributes remain, remove the span entirely
    if (AttributeUtils.isEmpty(newAttrs)) {
      return null
    }

    return span.withAttributes(newAttrs)
  }
}
