/**
 * Quill Editor Binding for RichText CRDT
 *
 * Provides two-way synchronization between a Quill editor instance and
 * a RichText CRDT, enabling collaborative rich text editing.
 *
 * @module integrations/quill
 */

import type { RichText } from '../crdt/richtext'
import type { FormatAttributes } from '../crdt/peritext'

/**
 * Quill Delta operation types
 */
export interface DeltaOp {
  insert?: string | object
  delete?: number
  retain?: number
  attributes?: Record<string, any>
}

/**
 * Quill Delta structure
 */
export interface Delta {
  ops: DeltaOp[]
}

/**
 * Quill API interface (minimal subset needed for binding)
 */
export interface QuillAPI {
  on(event: 'text-change', handler: TextChangeHandler): void
  off(event: 'text-change', handler: TextChangeHandler): void
  updateContents(delta: Delta, source?: string): void
  getContents(index?: number, length?: number): Delta
  getText(index?: number, length?: number): string
  getLength(): number
}

/**
 * Text change handler signature
 */
export type TextChangeHandler = (
  delta: Delta,
  oldDelta: Delta,
  source: string
) => void

/**
 * QuillBinding - Two-way sync between Quill editor and RichText CRDT
 *
 * Automatically synchronizes:
 * - Quill text changes → RichText insert/delete/format operations
 * - RichText changes → Quill editor updates
 *
 * Handles:
 * - Text insertion and deletion
 * - Format operations (bold, italic, color, etc.)
 * - Preventing infinite loops (suppressLocal flag)
 * - Attribute mapping between Quill and Peritext
 *
 * @example
 * ```typescript
 * import Quill from 'quill'
 * import { QuillBinding } from '@synckit-js/sdk/integrations/quill'
 *
 * const quill = new Quill('#editor')
 * const richText = await syncKit.richText('doc-123')
 * await richText.init()
 *
 * const binding = new QuillBinding(richText, quill)
 *
 * // Now edits in Quill sync to RichText, and remote changes sync to Quill
 *
 * // Clean up when done
 * binding.destroy()
 * ```
 */
export class QuillBinding {
  /**
   * Flag to prevent infinite loops
   * Set to true when applying remote changes to Quill
   */
  private suppressLocal = false

  /**
   * Text change handler reference (for cleanup)
   */
  private textChangeHandler: TextChangeHandler

  /**
   * RichText subscription unsubscribe functions
   */
  private unsubscribeText?: () => void
  private unsubscribeFormats?: () => void

  /**
   * Create a new Quill binding
   *
   * @param richText - RichText CRDT instance
   * @param quill - Quill editor instance
   */
  constructor(
    private readonly richText: RichText,
    private readonly quill: QuillAPI
  ) {
    // Set up Quill → RichText sync
    this.textChangeHandler = this.handleQuillChange.bind(this)
    this.quill.on('text-change', this.textChangeHandler)

    // Set up RichText → Quill sync
    this.setupRichTextSync()

    // Initial sync: Load RichText content into Quill
    this.syncInitialContent()
  }

  /**
   * Clean up event listeners and subscriptions
   */
  destroy(): void {
    // Remove Quill listener
    this.quill.off('text-change', this.textChangeHandler)

    // Unsubscribe from RichText
    if (this.unsubscribeText) {
      this.unsubscribeText()
    }
    if (this.unsubscribeFormats) {
      this.unsubscribeFormats()
    }
  }

  /**
   * Handle Quill text-change events
   *
   * Converts Quill Delta operations to RichText operations (insert/delete/format)
   * and applies them to the CRDT.
   */
  private async handleQuillChange(
    delta: Delta,
    _oldDelta: Delta,
    source: string
  ): Promise<void> {
    // Ignore changes we made ourselves (from remote)
    if (source !== 'user' || this.suppressLocal) {
      return
    }

    // Process each operation in the delta
    let position = 0

    for (const op of delta.ops) {
      if (op.retain !== undefined) {
        // Retain: Move position forward, optionally apply formatting
        if (op.attributes) {
          // Format operation at retained position
          const start = position
          const end = position + op.retain
          const attrs = this.quillAttrsToPeritextAttrs(op.attributes)

          try {
            await this.richText.format(start, end, attrs)
          } catch (error) {
            console.error('Failed to apply format:', error)
          }
        }
        position += op.retain
      } else if (op.insert !== undefined) {
        // Insert: Add text at current position
        if (typeof op.insert === 'string') {
          try {
            await this.richText.insert(position, op.insert)

            // If insert has attributes, format the newly inserted text
            if (op.attributes) {
              const start = position
              const end = position + op.insert.length
              const attrs = this.quillAttrsToPeritextAttrs(op.attributes)
              await this.richText.format(start, end, attrs)
            }

            position += op.insert.length
          } catch (error) {
            console.error('Failed to insert text:', error)
          }
        } else {
          // Embeds (images, etc.) - not yet supported
          console.warn('Embeds not yet supported:', op.insert)
          position += 1
        }
      } else if (op.delete !== undefined) {
        // Delete: Remove text at current position
        try {
          await this.richText.delete(position, op.delete)
          // Position doesn't advance after delete
        } catch (error) {
          console.error('Failed to delete text:', error)
        }
      }
    }
  }

  /**
   * Set up RichText → Quill synchronization
   *
   * Subscribes to RichText changes and applies them to Quill
   */
  private setupRichTextSync(): void {
    // Subscribe to text changes (insert/delete operations)
    this.unsubscribeText = this.richText.subscribe((content) => {
      this.syncTextToQuill(content)
    })

    // Subscribe to format changes
    this.unsubscribeFormats = this.richText.subscribeFormats((ranges) => {
      this.syncFormatsToQuill(ranges)
    })
  }

  /**
   * Sync RichText content to Quill
   *
   * Replaces Quill content with RichText content
   */
  private syncTextToQuill(content: string): void {
    this.suppressLocal = true

    try {
      // Get current Quill content
      const currentText = this.quill.getText()

      if (currentText !== content) {
        // Build delta to transform current content to new content
        const delta: Delta = {
          ops: [
            { delete: currentText.length },
            { insert: content }
          ]
        }

        this.quill.updateContents(delta, 'api')
      }
    } finally {
      this.suppressLocal = false
    }
  }

  /**
   * Sync RichText formatting to Quill
   *
   * Applies formatting ranges from RichText to Quill
   */
  private syncFormatsToQuill(ranges: Array<{ text: string; attributes: FormatAttributes }>): void {
    this.suppressLocal = true

    try {
      // Build Delta from format ranges
      const ops: DeltaOp[] = []

      for (const range of ranges) {
        const op: DeltaOp = { insert: range.text }

        if (Object.keys(range.attributes).length > 0) {
          op.attributes = this.peritextAttrsToQuillAttrs(range.attributes)
        }

        ops.push(op)
      }

      // Replace entire content with formatted version
      const delta: Delta = {
        ops: [
          { delete: this.quill.getLength() },
          ...ops
        ]
      }

      this.quill.updateContents(delta, 'api')
    } finally {
      this.suppressLocal = false
    }
  }

  /**
   * Initial content sync: Load RichText into Quill
   */
  private syncInitialContent(): void {
    this.suppressLocal = true

    try {
      const ranges = this.richText.getRanges()

      if (ranges.length === 0) {
        return
      }

      // Build Delta from format ranges
      const ops: DeltaOp[] = ranges.map(range => {
        const op: DeltaOp = { insert: range.text }

        if (Object.keys(range.attributes).length > 0) {
          op.attributes = this.peritextAttrsToQuillAttrs(range.attributes)
        }

        return op
      })

      const delta: Delta = { ops }
      this.quill.updateContents(delta, 'api')
    } finally {
      this.suppressLocal = false
    }
  }

  /**
   * Convert Quill attributes to Peritext attributes
   *
   * Maps Quill's attribute format to Peritext's FormatAttributes
   */
  private quillAttrsToPeritextAttrs(quillAttrs: Record<string, any>): FormatAttributes {
    const attrs: FormatAttributes = {}

    // Boolean attributes
    if (quillAttrs.bold) attrs.bold = true
    if (quillAttrs.italic) attrs.italic = true
    if (quillAttrs.underline) attrs.underline = true
    if (quillAttrs.strike) attrs.strikethrough = true

    // Color attributes
    if (quillAttrs.color) {
      attrs.color = this.normalizeColor(quillAttrs.color)
    }
    if (quillAttrs.background) {
      attrs.background = this.normalizeColor(quillAttrs.background)
    }

    // Link attribute
    if (quillAttrs.link) {
      attrs.href = quillAttrs.link
    }

    // Font attributes (future support)
    if (quillAttrs.font) {
      attrs['font-family'] = quillAttrs.font
    }
    if (quillAttrs.size) {
      attrs['font-size'] = quillAttrs.size
    }

    // Header/block attributes (future support)
    if (quillAttrs.header) {
      attrs['header-level'] = quillAttrs.header
    }

    return attrs
  }

  /**
   * Convert Peritext attributes to Quill attributes
   *
   * Maps Peritext's FormatAttributes to Quill's attribute format
   */
  private peritextAttrsToQuillAttrs(peritextAttrs: FormatAttributes): Record<string, any> {
    const attrs: Record<string, any> = {}

    // Boolean attributes
    if (peritextAttrs.bold) attrs.bold = true
    if (peritextAttrs.italic) attrs.italic = true
    if (peritextAttrs.underline) attrs.underline = true
    if (peritextAttrs.strikethrough) attrs.strike = true

    // Color attributes
    if (peritextAttrs.color) {
      attrs.color = peritextAttrs.color
    }
    if (peritextAttrs.background) {
      attrs.background = peritextAttrs.background
    }

    // Link attribute
    if (peritextAttrs.href) {
      attrs.link = peritextAttrs.href
    }

    // Font attributes (future support)
    if (peritextAttrs['font-family']) {
      attrs.font = peritextAttrs['font-family']
    }
    if (peritextAttrs['font-size']) {
      attrs.size = peritextAttrs['font-size']
    }

    // Header/block attributes (future support)
    if (peritextAttrs['header-level']) {
      attrs.header = peritextAttrs['header-level']
    }

    return attrs
  }

  /**
   * Normalize color format to hex (#RRGGBB)
   *
   * Quill can use various color formats, we normalize to hex for Peritext
   */
  private normalizeColor(color: string): string {
    // If already hex format, return as-is
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return color
    }

    // TODO: Handle rgb(), rgba(), color names, etc.
    // For now, return as-is and let validation catch invalid formats
    return color
  }
}
