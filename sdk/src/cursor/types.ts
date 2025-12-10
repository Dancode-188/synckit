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
 * Cursor position in viewport coordinates
 * Simple clientX/clientY values - no transformations needed
 * Following the Liveblocks pattern for maximum simplicity
 */
export interface CursorPosition {
  /** X coordinate in pixels from viewport left edge */
  x: number
  /** Y coordinate in pixels from viewport top edge */
  y: number
}

/**
 * Selection range (text selection visualization)
 * Represents a text selection with anchor (start) and head (end) points
 * Like Google Docs blue highlight boxes
 * Uses viewport pixel coordinates
 */
export interface SelectionRange {
  /** Selection start point (viewport pixels) */
  anchor: CursorPosition
  /** Selection end point (viewport pixels) */
  head: CursorPosition
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
