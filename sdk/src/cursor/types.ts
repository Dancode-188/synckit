/**
 * Type definitions for cursor sharing and animations
 * @module cursor/types
 */

/**
 * Spring animation configuration
 * Based on research: damping=45, stiffness=400, mass=1 provides smooth cursor movement
 */
export interface SpringConfig {
  /** Damping coefficient - higher values reduce oscillation (default: 45) */
  damping?: number
  /** Stiffness coefficient - higher values make spring snappier (default: 400) */
  stiffness?: number
  /** Mass - affects inertia (default: 1) */
  mass?: number
  /** Delta threshold for considering spring at rest (default: 0.001) */
  restDelta?: number
  /** Initial value (default: 0) */
  initialValue?: number
}

/**
 * Cursor positioning mode
 */
export type CursorMode = 'viewport' | 'container'

/**
 * Cursor position coordinates
 *
 * Interpretation depends on mode:
 * - viewport mode: Pixels from viewport edges (clientX/clientY)
 * - container mode: Pixels from container content edges (with scroll offset)
 *
 * Note: Stored coordinates match the mode they were captured in.
 * Container mode coords are transformed to viewport coords for rendering.
 */
export interface CursorPosition {
  /** X coordinate in pixels */
  x: number
  /** Y coordinate in pixels */
  y: number
}

/**
 * Text selection rectangle
 * Represents one line/box of a potentially multi-line selection
 * Coordinates interpretation depends on mode (viewport or container)
 */
export interface SelectionRect {
  /** Left edge in pixels */
  x: number
  /** Top edge in pixels */
  y: number
  /** Width in pixels */
  width: number
  /** Height in pixels */
  height: number
}

/**
 * Text selection range (visualization)
 * Represents a text selection as rectangles (one per line for multi-line)
 * Like Google Docs blue highlight boxes
 *
 * Coordinates interpretation:
 * - viewport mode: Pixels from viewport edges
 * - container mode: Pixels from container content edges (with scroll offset)
 */
export interface SelectionRange {
  /** Array of rectangles (one per line for multi-line selections) */
  rects: SelectionRect[]
  /** Optional timestamp for tracking selection age */
  timestamp?: number
}

/**
 * Serialized selection range (semantic)
 * Represents WHAT is selected using XPath + character offsets
 * This is what gets shared via awareness protocol for cross-client selection sharing
 *
 * Unlike SelectionRange (visual coords), this is layout-independent and works
 * across different window sizes, scroll positions, and zoom levels.
 *
 * @example
 * ```ts
 * {
 *   startXPath: "/html/body/div[2]/p[1]/text()[1]",
 *   startOffset: 15,
 *   endXPath: "/html/body/div[2]/p[1]/text()[1]",
 *   endOffset: 26
 * }
 * // Represents: characters 15-26 in the first text node of the first paragraph
 * ```
 */
export interface SerializedRange {
  /** XPath to start container node */
  startXPath: string
  /** Character offset within start container */
  startOffset: number
  /** XPath to end container node */
  endXPath: string
  /** Character offset within end container */
  endOffset: number
  /** Optional timestamp for tracking selection age */
  timestamp?: number
}

/**
 * Throttle configuration
 */
export interface ThrottleConfig {
  /** Minimum delay in ms (highest update frequency) */
  minDelay?: number
  /** Maximum delay in ms (lowest update frequency) */
  maxDelay?: number
  /** User count thresholds mapped to delays */
  userThresholds?: Record<number, number>
}

/**
 * Selection bounds in viewport coordinates
 * Used for rendering selection highlight boxes
 */
export interface SelectionBounds {
  /** Left edge in viewport pixels */
  left: number
  /** Top edge in viewport pixels */
  top: number
  /** Width in pixels */
  width: number
  /** Height in pixels */
  height: number
}

/**
 * Inactivity configuration for cursor hiding
 */
export interface InactivityConfig {
  /** Timeout in ms before cursor is hidden (default: 5000) */
  timeout?: number
  /** Fade out duration in ms (default: 300) */
  fadeOutDuration?: number
}

/**
 * Collision detection configuration
 */
export interface CollisionConfig {
  /** Collision threshold in pixels (default: 50) */
  threshold?: number
  /** Vertical offset per collision in pixels (default: 20) */
  stackOffset?: number
  /** Cell size for spatial hashing (default: 100) */
  cellSize?: number
}

/**
 * Animation frame callback
 */
export type AnimationCallback = (deltaTime: number) => void

/**
 * Unsubscribe function
 */
export type Unsubscribe = () => void
