/**
 * Type definitions for Svelte selection components
 * @module adapters/svelte/types/selection
 */

import type { SerializedRange, SelectionRange } from '../../../cursor/types'

/**
 * User with selection data
 */
export interface SelectionUser {
  /** Unique user/client ID */
  id: string
  /** User name (for label) */
  name?: string
  /** User color (for highlight) */
  color?: string
  /**
   * Selection range - supports both formats for backward compatibility:
   * - SerializedRange (new): Semantic, layout-independent (recommended)
   * - SelectionRange (old): Visual coordinates (deprecated, use for migration only)
   */
  selection?: SerializedRange | SelectionRange | null
}
