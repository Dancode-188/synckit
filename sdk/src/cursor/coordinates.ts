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
 * Get cursor position relative to container (document coordinates)
 *
 * For scrollable content where cursors should stick to the content
 * (like Google Docs). Includes scroll offset so position is relative
 * to the content, not the viewport.
 *
 * @param event - Mouse or pointer event
 * @param container - Container element
 * @returns Position relative to container content (includes scroll offset)
 *
 * @example
 * ```ts
 * const handleMove = (e: PointerEvent, containerEl) => {
 *   const pos = getCursorPositionInContainer(e, containerEl)
 *   // pos = { x: 450, y: 2300 } - content pixels (may be scrolled off screen)
 *   updatePresence({ cursor: pos })
 * }
 * ```
 */
export function getCursorPositionInContainer(
  event: MouseEvent | PointerEvent,
  container: HTMLElement
): CursorPosition {
  const rect = container.getBoundingClientRect()

  return {
    x: Math.round(event.clientX - rect.left + container.scrollLeft),
    y: Math.round(event.clientY - rect.top + container.scrollTop)
  }
}

/**
 * Transform container-relative position to viewport position for rendering
 *
 * Takes a position stored in container coordinates and converts it to
 * viewport coordinates for rendering with position: absolute.
 *
 * @param containerPos - Position in container coordinates
 * @param container - Container element
 * @returns Position in viewport coordinates (for rendering)
 *
 * @example
 * ```ts
 * const viewportPos = containerToViewport(
 *   { x: 450, y: 2300 },  // Content position
 *   containerEl
 * )
 * // viewportPos = { x: 450, y: 100 } - viewport position after scroll
 * ```
 */
export function containerToViewport(
  containerPos: CursorPosition,
  container: HTMLElement
): CursorPosition {
  const rect = container.getBoundingClientRect()

  return {
    x: containerPos.x - container.scrollLeft + rect.left,
    y: containerPos.y - container.scrollTop + rect.top
  }
}

/**
 * Check if a container-relative position is currently visible in viewport
 *
 * @param containerPos - Position in container coordinates
 * @param container - Container element
 * @returns True if position is currently visible
 */
export function isPositionInViewport(
  containerPos: CursorPosition,
  container: HTMLElement
): boolean {
  const viewportPos = containerToViewport(containerPos, container)
  const rect = container.getBoundingClientRect()

  return (
    viewportPos.x >= rect.left &&
    viewportPos.x <= rect.right &&
    viewportPos.y >= rect.top &&
    viewportPos.y <= rect.bottom
  )
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
