/**
 * React hook for automatic cursor position tracking
 * Simple viewport-relative approach following Liveblocks pattern
 * @module adapters/react/useCursor
 */

import { useCallback } from 'react'
import type { CursorPosition } from '../../cursor/types'
import { getCursorPosition } from '../../cursor/coordinates'

export interface UseCursorOptions {
  /**
   * Whether cursor tracking is enabled
   * @default true
   */
  enabled?: boolean

  /**
   * Update callback - called when cursor position changes
   */
  onUpdate: (position: CursorPosition) => void
}

/**
 * Hook for tracking cursor/mouse position in viewport coordinates
 * Captures simple clientX/clientY values - no transformations needed
 *
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const cursorProps = useCursorTracking({
 *   onUpdate: (pos) => {
 *     // pos = { x: 245, y: 350 } - viewport pixels
 *     awareness.setLocalCursor(pos)
 *   }
 * })
 *
 * return <div {...cursorProps}>...</div>
 * ```
 */
export function useCursorTracking(options: UseCursorOptions) {
  const { enabled = true, onUpdate } = options

  // Mouse move handler - simple viewport coordinates
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const position = getCursorPosition(e.nativeEvent)
      onUpdate(position)
    },
    [onUpdate]
  )

  // Mouse leave handler - clear cursor when leaving
  const handleMouseLeave = useCallback(() => {
    // Optionally clear cursor position when mouse leaves
    // For now, we keep the last position
  }, [])

  // Touch handlers for mobile support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 0) return

      const touch = e.touches[0]
      if (!touch) return

      // Simple viewport coordinates
      const position: CursorPosition = {
        x: Math.round(touch.clientX),
        y: Math.round(touch.clientY)
      }

      onUpdate(position)
    },
    [onUpdate]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 0) return

      e.preventDefault()

      const touch = e.touches[0]
      if (!touch) return

      // Simple viewport coordinates
      const position: CursorPosition = {
        x: Math.round(touch.clientX),
        y: Math.round(touch.clientY)
      }

      onUpdate(position)
    },
    [onUpdate]
  )

  return {
    onMouseMove: enabled ? handleMouseMove : undefined,
    onMouseLeave: enabled ? handleMouseLeave : undefined,
    onTouchStart: enabled ? handleTouchStart : undefined,
    onTouchMove: enabled ? handleTouchMove : undefined
  }
}
