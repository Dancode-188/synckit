/**
 * Peritext CRDT for Rich Text Formatting
 *
 * This module implements the Peritext algorithm for collaborative rich text editing.
 *
 * Based on the academic paper:
 * "Peritext: A CRDT for Collaborative Rich Text Editing"
 * Geoffrey Litt, Sarah Lim, Martin Kleppmann, Peter van Hardenberg
 * ACM CSCW 2022, DOI: 10.1145/3555644
 *
 * Key Features:
 * - Correct handling of formatting edge cases (unlike control character approaches)
 * - Deterministic conflict resolution for concurrent operations
 * - Strong eventual consistency guarantees
 * - Extensible attribute system
 * - Lightweight implementation (<10KB gzipped)
 *
 * Architecture:
 * - StyleAnchors: Mark start/end of formatting spans
 * - FormatSpans: Combine anchors with attributes
 * - FormatMerger: Resolve conflicts and merge overlapping spans
 * - Attributes: Define formatting properties (bold, italic, color, etc.)
 *
 * @packageDocumentation
 */

// Core data structures
export { StyleAnchor, AnchorUtils } from './anchor'
export type { AnchorType, AnchorJSON, AnchorPair } from './anchor'

export { FormatSpan, SpanUtils } from './span'
export type { SpanJSON } from './span'

export { AttributeUtils, AttributePresets } from './attributes'
export type { FormatAttributes, AttributesJSON, MergeStrategy } from './attributes'

export {
  FormatMerger,
  formatMerger,
  EdgeCaseHandlers
} from './merge'

// Re-export commonly used types for convenience
export type { AnchorJSON as PeritextAnchorJSON } from './anchor'
export type { SpanJSON as PeritextSpanJSON } from './span'
export type { AttributesJSON as PeritextAttributesJSON } from './attributes'

/**
 * Version of the Peritext implementation
 * Used for debugging and compatibility checking
 */
export const PERITEXT_VERSION = '1.0.0'

/**
 * Bundle size budget for Peritext core
 * This module should stay under 10KB gzipped
 */
export const PERITEXT_SIZE_BUDGET_KB = 10
