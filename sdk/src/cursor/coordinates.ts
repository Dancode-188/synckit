/**
 * Simple viewport-relative cursor positioning
 * Following the Liveblocks pattern - proven in production
 *
 * Coordinates are viewport pixels (clientX, clientY)
 * No transformations. No scroll handling. Just works.
 *
 * @module cursor/coordinates
 */

import type { CursorPosition } from './types'

/**
 * Get cursor position from pointer event
 *
 * Returns viewport coordinates - the simplest approach that works
 * for 80% of use cases (fixed canvases, dashboards, forms, etc.)
 *
 * @param event - Mouse or pointer event
 * @returns Viewport position in pixels
 *
 * @example
 * ```ts
 * const handleMove = (e: PointerEvent) => {
 *   const pos = getCursorPosition(e)
 *   // pos = { x: 450, y: 300 } - viewport pixels
 *   updatePresence({ cursor: pos })
 * }
 * ```
 */
export function getCursorPosition(event: MouseEvent | PointerEvent): CursorPosition {
  return {
    x: Math.round(event.clientX),
    y: Math.round(event.clientY)
  }
}

/**
 * Check if two cursor positions are close enough to be considered "same"
 * Used for throttling - don't broadcast if cursor barely moved
 *
 * @param a - First position
 * @param b - Second position
 * @param threshold - Distance threshold in pixels (default: 2)
 * @returns True if positions are within threshold
 */
export function areCursorsClose(
  a: CursorPosition | null,
  b: CursorPosition | null,
  threshold = 2
): boolean {
  if (!a || !b) return false

  const dx = a.x - b.x
  const dy = a.y - b.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  return distance < threshold
}
