/**
 * RichText CRDT - Collaborative rich text editing with Peritext formatting
 *
 * Extends SyncText with rich text formatting capabilities using the Peritext
 * algorithm. Provides deterministic conflict resolution for concurrent format
 * operations while maintaining correctness across all edge cases.
 *
 * @module richtext
 */

import { SyncText } from '../text'
import type { StorageAdapter } from '../storage'
import type { SyncManager } from '../sync/manager'
import type { CrossTabSync } from '../sync/cross-tab'
import {
  StyleAnchor,
  FormatSpan,
  FormatAttributes,
  FormatMerger,
  formatMerger,
  SpanUtils,
  AttributeUtils
} from './peritext'
import { DeltaUtils, type Delta } from './delta'

/**
 * Storage data for RichText (extends TextStorageData)
 */
export interface RichTextStorageData {
  content: string
  clock: number
  updatedAt: number
  crdt?: string  // Serialized Fugue text state
  spans?: string  // Serialized Peritext format spans (JSON)
}

/**
 * Format range result for rendering
 */
export interface FormatRange {
  text: string
  attributes: FormatAttributes
}

/**
 * Subscription callback for format changes
 */
export type FormatChangeCallback = (ranges: FormatRange[]) => void

/**
 * RichText - Collaborative rich text CRDT
 *
 * Combines Fugue text CRDT (from SyncText) with Peritext formatting spans
 * to provide a complete rich text editing solution.
 *
 * Features:
 * - All SyncText features (insert, delete, sync, persistence)
 * - Rich text formatting (bold, italic, color, links, etc.)
 * - Correct handling of concurrent format operations
 * - Edge case correctness (boundary formatting, overlapping spans, etc.)
 * - Observable format changes
 * - Network sync integration
 *
 * @example
 * ```typescript
 * const richText = new RichText('doc-123', 'client-a', storage, syncManager)
 * await richText.init()
 *
 * // Insert text
 * await richText.insert(0, 'Hello World')
 *
 * // Format text
 * await richText.format(0, 5, { bold: true })  // "Hello" is bold
 * await richText.format(6, 11, { italic: true, color: '#FF0000' })  // "World" is italic and red
 *
 * // Get formats at position
 * const formats = richText.getFormats(3)  // { bold: true }
 *
 * // Get formatted ranges for rendering
 * const ranges = richText.getRanges()
 * // [
 * //   { text: 'Hello', attributes: { bold: true } },
 * //   { text: ' ', attributes: {} },
 * //   { text: 'World', attributes: { italic: true, color: '#FF0000' } }
 * // ]
 * ```
 */
export class RichText extends SyncText {
  /**
   * Format spans (Peritext)
   * Maps opId -> FormatSpan
   */
  private spans: Map<string, FormatSpan> = new Map()

  /**
   * Format change subscribers
   */
  private formatSubscribers = new Set<FormatChangeCallback>()

  /**
   * Operation ID counter for generating unique operation IDs
   */
  private opIdCounter = 0

  /**
   * Format merger for conflict resolution
   */
  private merger: FormatMerger = formatMerger

  /**
   * Create a new RichText instance
   *
   * @param id - Document ID
   * @param clientId - Client ID
   * @param storage - Optional storage adapter
   * @param syncManager - Optional sync manager
   */
  constructor(
    id: string,
    clientId: string,
    storage?: StorageAdapter,
    syncManager?: SyncManager,
    crossTabSync?: CrossTabSync
  ) {
    super(id, clientId, storage, syncManager, crossTabSync)
  }

  /**
   * Initialize the rich text CRDT
   * Loads both text content and format spans from storage
   */
  async init(): Promise<void> {
    // Initialize base text CRDT
    await super.init()

    // Load format spans from storage
    if ((this as any).storage) {
      const stored = await (this as any).storage.get((this as any).id)
      if (stored && this.isRichTextStorageData(stored)) {
        if (stored.spans) {
          try {
            const spanData = JSON.parse(stored.spans)
            for (const spanJson of spanData) {
              const span = FormatSpan.fromJSON(spanJson)
              this.spans.set(span.opId, span)
            }
          } catch (error) {
            console.error('Failed to parse format spans:', error)
          }
        }
      }
    }

    // Register CrossTabSync handlers for format operations
    const crossTabSync = (this as any).crossTabSync
    if (crossTabSync) {
      // Handle format operations from other tabs
      crossTabSync.on('richtext-format', async (message: any) => {
        if (message.documentId !== (this as any).id) return

        // Create format span from the received data
        const startAnchor = new StyleAnchor(
          message.startCharId,
          'start',
          message.opId,
          message.timestamp,
          message.from
        )

        const endAnchor = new StyleAnchor(
          message.endCharId,
          'end',
          message.opId,
          message.timestamp,
          message.from
        )

        const span = new FormatSpan(startAnchor, endAnchor, message.attributes)

        // Apply the span
        this.spans.set(message.opId, span)
        await this.persistSpans()
        this.notifyFormatSubscribers()
      })

      // Handle unformat operations from other tabs
      crossTabSync.on('richtext-unformat', async (message: any) => {
        if (message.documentId !== (this as any).id) return

        const { start, end, attributes } = message

        // Find and update overlapping spans (same logic as local unformat)
        const overlappingSpans = Array.from(this.spans.values()).filter(span => {
          const spanStart = this.getPosition(span.start.characterId)
          const spanEnd = this.getPosition(span.end.characterId)
          return spanStart < end && start < spanEnd
        })

        for (const span of overlappingSpans) {
          const newAttrs = AttributeUtils.remove(span.attributes, attributes)

          if (AttributeUtils.isEmpty(newAttrs)) {
            this.spans.delete(span.opId)
          } else {
            const updatedSpan = span.withAttributes(newAttrs)
            this.spans.set(span.opId, updatedSpan)
          }
        }

        await this.persistSpans()
        this.notifyFormatSubscribers()
      })
    }
  }

  /**
   * Apply formatting to a character range
   *
   * Creates a new FormatSpan with the specified attributes and broadcasts
   * the format operation to other replicas.
   *
   * @param start - Start position (inclusive, 0-based)
   * @param end - End position (exclusive)
   * @param attributes - Format attributes to apply
   *
   * @example
   * ```typescript
   * // Make characters 0-5 bold
   * await richText.format(0, 5, { bold: true })
   *
   * // Make characters 10-20 red and italic
   * await richText.format(10, 20, { italic: true, color: '#FF0000' })
   * ```
   */
  async format(
    start: number,
    end: number,
    attributes: FormatAttributes
  ): Promise<void> {
    // Validate range
    const length = this.length()
    if (start < 0 || end > length || start >= end) {
      throw new Error(
        `Invalid format range [${start}, ${end}) for text of length ${length}`
      )
    }

    // Validate attributes
    const error = AttributeUtils.validate(attributes)
    if (error) {
      throw new Error(`Invalid attributes: ${error}`)
    }

    // Generate unique operation ID
    const opId = this.generateOpId()
    const timestamp = Number(this.getClock()) + 1

    // Create anchors at start and end positions using stable NodeIds
    // Get stable character IDs from Fugue CRDT (not position-based!)
    const startNodeId = this.getNodeIdAtPosition(start)
    const endNodeId = this.getNodeIdAtPosition(end - 1)

    // Format NodeIds as strings: client_id@clock:offset
    const startCharId = `${startNodeId.client_id}@${startNodeId.clock}:${startNodeId.offset}`
    const endCharId = `${endNodeId.client_id}@${endNodeId.clock}:${endNodeId.offset}`

    const startAnchor = new StyleAnchor(
      startCharId,
      'start',
      opId,
      timestamp,
      (this as any).clientId
    )

    const endAnchor = new StyleAnchor(
      endCharId,
      'end',
      opId,
      timestamp,
      (this as any).clientId
    )

    // Create format span
    const span = new FormatSpan(startAnchor, endAnchor, attributes)

    // Store span
    this.spans.set(opId, span)

    // Persist
    await this.persistSpans()

    // Notify format subscribers
    this.notifyFormatSubscribers()

    // Broadcast to other tabs via CrossTabSync
    const crossTabSync = (this as any).crossTabSync
    if (crossTabSync) {
      crossTabSync.broadcast({
        type: 'richtext-format',
        documentId: (this as any).id,
        opId,
        startCharId: startCharId,
        endCharId: endCharId,
        attributes,
        timestamp
      })
    }

    // Sync (if sync manager available)
    if ((this as any).syncManager) {
      await (this as any).syncManager.pushOperation({
        type: 'richtext' as any,
        operation: 'format',
        documentId: (this as any).id,
        clientId: (this as any).clientId,
        timestamp: Date.now(),
        opId,
        start,
        end,
        attributes,
        clock: { ...(this as any).vectorClock }
      } as any)
    }
  }

  /**
   * Remove formatting from a character range
   *
   * Removes the specified attributes from the given range. If a span
   * loses all its attributes, it is removed entirely.
   *
   * @param start - Start position (inclusive)
   * @param end - End position (exclusive)
   * @param attributes - Attributes to remove
   *
   * @example
   * ```typescript
   * // Remove bold formatting from characters 0-5
   * await richText.unformat(0, 5, { bold: true })
   *
   * // Remove all formatting from characters 10-20
   * await richText.clearFormats(10, 20)
   * ```
   */
  async unformat(
    start: number,
    end: number,
    attributes: FormatAttributes
  ): Promise<void> {
    // Find spans that overlap with this range
    const overlappingSpans = Array.from(this.spans.values()).filter(span => {
      const spanStart = this.getPosition(span.start.characterId)
      const spanEnd = this.getPosition(span.end.characterId)
      return spanStart < end && start < spanEnd
    })

    // Remove specified attributes from overlapping spans
    for (const span of overlappingSpans) {
      const newAttrs = AttributeUtils.remove(span.attributes, attributes)

      if (AttributeUtils.isEmpty(newAttrs)) {
        // No attributes left, remove span entirely
        this.spans.delete(span.opId)
      } else {
        // Update span with new attributes
        const updatedSpan = span.withAttributes(newAttrs)
        this.spans.set(span.opId, updatedSpan)
      }
    }

    // Persist
    await this.persistSpans()

    // Notify subscribers
    this.notifyFormatSubscribers()

    // Broadcast to other tabs via CrossTabSync
    const crossTabSync = (this as any).crossTabSync
    if (crossTabSync) {
      crossTabSync.broadcast({
        type: 'richtext-unformat',
        documentId: (this as any).id,
        start,
        end,
        attributes
      })
    }
  }

  /**
   * Remove all formatting from a character range
   *
   * @param start - Start position (inclusive)
   * @param end - End position (exclusive)
   */
  async clearFormats(start: number, end: number): Promise<void> {
    // Find all spans that overlap with this range and remove them
    const toRemove: string[] = []

    for (const [opId, span] of this.spans.entries()) {
      const spanStart = this.getPosition(span.start.characterId)
      const spanEnd = this.getPosition(span.end.characterId)

      if (spanStart < end && start < spanEnd) {
        toRemove.push(opId)
      }
    }

    // Remove spans
    for (const opId of toRemove) {
      this.spans.delete(opId)
    }

    // Persist and notify
    await this.persistSpans()
    this.notifyFormatSubscribers()
  }

  /**
   * Get format attributes at a specific position
   *
   * Returns the combined formatting from all spans that contain this position.
   * Attributes are merged according to Peritext merge rules.
   *
   * @param position - Character position
   * @returns Format attributes at this position
   *
   * @example
   * ```typescript
   * const formats = richText.getFormats(5)
   * if (formats.bold) {
   *   console.log('Position 5 is bold')
   * }
   * ```
   */
  getFormats(position: number): FormatAttributes {
    const charId = `${position}@${(this as any).clientId}`
    const spans = Array.from(this.spans.values())

    return SpanUtils.getFormatsAt(
      charId,
      spans,
      (id) => this.getPosition(id)
    )
  }

  /**
   * Get formatted text ranges for rendering
   *
   * Walks through the text and returns ranges with their combined formatting.
   * This is the primary method for rendering rich text in a UI.
   *
   * @returns Array of text ranges with attributes
   *
   * @example
   * ```typescript
   * const ranges = richText.getRanges()
   * for (const range of ranges) {
   *   // Render range.text with range.attributes
   *   console.log(range.text, range.attributes)
   * }
   * ```
   */
  getRanges(): FormatRange[] {
    const text = this.get()
    if (text.length === 0) {
      return []
    }

    const spans = Array.from(this.spans.values())
    const mergedSpans = this.merger.merge(
      spans,
      (id) => this.getPosition(id)
    )

    // Convert positions to stable NodeIds
    const positionToCharId = (position: number): string => {
      const nodeId = this.getNodeIdAtPosition(position)
      return `${nodeId.client_id}@${nodeId.clock}:${nodeId.offset}`
    }

    // Pass both converters: position→NodeId and NodeId→position
    return this.merger.computeRanges(
      text,
      mergedSpans,
      positionToCharId,
      (charId) => this.getPosition(charId)
    )
  }

  /**
   * Subscribe to format changes
   *
   * Callback is called whenever formatting changes (format/unformat operations).
   *
   * @param callback - Called with updated format ranges
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = richText.subscribeFormats((ranges) => {
   *   console.log('Formatting changed:', ranges)
   *   renderRichText(ranges)
   * })
   *
   * // Later: stop listening
   * unsubscribe()
   * ```
   */
  subscribeFormats(callback: FormatChangeCallback): () => void {
    this.formatSubscribers.add(callback)

    return () => {
      this.formatSubscribers.delete(callback)
    }
  }

  /**
   * Override dispose to clean up format subscribers
   */
  dispose(): void {
    this.formatSubscribers.clear()
    super.dispose()
  }

  /**
   * Export format spans to JSON
   * Used for persistence and network sync
   */
  getSpansJSON(): string {
    const spanArray = Array.from(this.spans.values()).map(span => span.toJSON())
    return JSON.stringify(spanArray)
  }

  /**
   * Import format spans from JSON
   * Used when receiving remote format operations
   */
  setSpansFromJSON(json: string): void {
    try {
      const spanData = JSON.parse(json)
      this.spans.clear()

      for (const spanJson of spanData) {
        const span = FormatSpan.fromJSON(spanJson)
        this.spans.set(span.opId, span)
      }

      this.notifyFormatSubscribers()
    } catch (error) {
      console.error('Failed to parse format spans JSON:', error)
      throw error
    }
  }

  // ====================
  // Private helpers
  // ====================

  /**
   * Generate unique operation ID
   */
  private generateOpId(): string {
    return `fmt-${(this as any).clientId}-${this.opIdCounter++}-${Date.now()}`
  }

  /**
   * Get position from character ID (NodeId)
   *
   * Parses NodeId format: client_id@clock:offset
   * Queries the Fugue CRDT to get the current position of the character.
   * Returns 0 if character was deleted.
   */
  private getPosition(characterId: string): number {
    const wasmText = (this as any).wasmText
    if (!wasmText) {
      return 0
    }

    // Parse NodeId format: client_id@clock:offset
    const match = characterId.match(/^([^@]+)@(\d+):(\d+)$/)
    if (!match) {
      console.warn(`Invalid NodeId format: ${characterId}`)
      return 0
    }

    const clientId = match[1]
    const clockStr = match[2]
    const offsetStr = match[3]

    if (!clientId || !clockStr || !offsetStr) {
      return 0
    }

    const nodeIdJson = JSON.stringify({
      client_id: clientId,
      clock: parseInt(clockStr),
      offset: parseInt(offsetStr)
    })

    const position = wasmText.getPositionOfNodeId(nodeIdJson)
    return position === -1 ? 0 : position  // Return 0 if character was deleted
  }

  /**
   * Persist format spans to storage
   */
  private async persistSpans(): Promise<void> {
    if (!(this as any).storage) return

    const data: RichTextStorageData = {
      content: this.get(),
      clock: this.getClock(),
      updatedAt: Date.now(),
      crdt: this.toJSON(),
      spans: this.getSpansJSON()
    }

    await (this as any).storage.set((this as any).id, data as any)
  }

  /**
   * Notify format subscribers of changes
   */
  private notifyFormatSubscribers(): void {
    const ranges = this.getRanges()
    this.formatSubscribers.forEach(callback => {
      try {
        callback(ranges)
      } catch (error) {
        console.error('Error in format subscription callback:', error)
      }
    })
  }

  /**
   * Type guard for RichTextStorageData
   */
  private isRichTextStorageData(data: any): data is RichTextStorageData {
    return (
      typeof data === 'object' &&
      typeof data.content === 'string' &&
      typeof data.clock === 'number'
    )
  }

  // ====================
  // Delta Import/Export
  // ====================

  /**
   * Export RichText content as Quill Delta
   *
   * Converts the current document state to Delta format, which can be used
   * with Quill editors or for data interchange. The Delta includes text
   * content and all formatting information.
   *
   * @returns Delta representation of document
   *
   * @example
   * ```ts
   * const delta = richText.toDelta()
   * console.log(delta)
   * // { ops: [
   * //   { insert: "Hello ", attributes: { bold: true } },
   * //   { insert: "World" }
   * // ]}
   * ```
   */
  toDelta(): Delta {
    const ranges = this.getRanges()
    return DeltaUtils.fromRanges(ranges)
  }

  /**
   * Import content from Quill Delta
   *
   * Replaces the current document content with content from a Delta.
   * This clears all existing text and formatting, then applies the Delta.
   *
   * Useful for:
   * - Loading content from external sources
   * - Importing documents from other editors
   * - Initializing document state
   *
   * @param delta - Delta to import
   *
   * @example
   * ```ts
   * const delta = {
   *   ops: [
   *     { insert: "Hello ", attributes: { bold: true } },
   *     { insert: "World", attributes: { italic: true } }
   *   ]
   * }
   *
   * await richText.fromDelta(delta)
   * // Document now contains "Hello World" with formatting
   * ```
   */
  async fromDelta(delta: Delta): Promise<void> {
    // Validate Delta structure
    const error = DeltaUtils.validate(delta)
    if (error) {
      throw new Error(`Invalid Delta: ${error}`)
    }

    // Clear existing content
    const currentLength = this.length()
    if (currentLength > 0) {
      await this.delete(0, currentLength)
    }

    // Clear existing format spans
    this.spans.clear()

    // Convert Delta to ranges
    const ranges = DeltaUtils.toRanges(delta)

    // Insert text and apply formatting
    let position = 0

    for (const range of ranges) {
      const { text, attributes } = range

      if (text.length === 0) {
        continue
      }

      // Insert text
      await this.insert(position, text)

      // Apply formatting if present
      if (Object.keys(attributes).length > 0) {
        await this.format(position, position + text.length - 1, attributes)
      }

      position += text.length
    }

    // Persist and notify
    await this.persistSpans()
    this.notifyFormatSubscribers()
  }

  /**
   * Convert to plain Delta (text only, no formatting)
   *
   * @returns Delta with only insert operations, no attributes
   */
  toPlainDelta(): Delta {
    const text = this.get()
    return {
      ops: text.length > 0 ? [{ insert: text }] : []
    }
  }
}
