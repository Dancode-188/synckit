/**
 * React hook for automatic cursor position tracking
 * Supports both viewport and container-relative modes
 * @module adapters/react/useCursor
 */

import { useCallback } from 'react'
import type { CursorPosition, CursorMode } from '../../cursor/types'
import { getCursorPosition, getCursorPositionInContainer } from '../../cursor/coordinates'

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

  /**
   * Positioning mode (default: 'viewport')
   * - viewport: Capture viewport coordinates (clientX/clientY)
   * - container: Capture container coordinates (with scroll offset)
   */
  mode?: CursorMode

  /**
   * Container ref (required when mode='container')
   */
  containerRef?: React.RefObject<HTMLElement>
}

/**
 * Hook for tracking cursor/mouse position
 * Supports both viewport-relative and container-relative modes
 *
 * @param options - Configuration options
 *
 * @example Viewport mode (default)
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
 *
 * @example Container mode
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null)
 *
 * const cursorProps = useCursorTracking({
 *   mode: 'container',
 *   containerRef,
 *   onUpdate: (pos) => {
 *     // pos = { x: 245, y: 2350 } - container pixels (includes scroll)
 *     awareness.setLocalCursor(pos)
 *   }
 * })
 *
 * return <div ref={containerRef} {...cursorProps}>...</div>
 * ```
 */
export function useCursorTracking(options: UseCursorOptions) {
  const { enabled = true, onUpdate, mode = 'viewport', containerRef } = options

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (mode === 'container') {
        if (!containerRef?.current) {
          console.warn('[useCursorTracking] Container mode requires containerRef')
          return
        }
        const position = getCursorPositionInContainer(e.nativeEvent, containerRef.current)
        onUpdate(position)
      } else {
        const position = getCursorPosition(e.nativeEvent)
        onUpdate(position)
      }
    },
    [onUpdate, mode, containerRef]
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

      if (mode === 'container' && containerRef?.current) {
        const container = containerRef.current
        const rect = container.getBoundingClientRect()

        const position: CursorPosition = {
          x: Math.round(touch.clientX - rect.left + container.scrollLeft),
          y: Math.round(touch.clientY - rect.top + container.scrollTop)
        }

        onUpdate(position)
      } else {
        const position: CursorPosition = {
          x: Math.round(touch.clientX),
          y: Math.round(touch.clientY)
        }

        onUpdate(position)
      }
    },
    [onUpdate, mode, containerRef]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 0) return

      e.preventDefault()

      const touch = e.touches[0]
      if (!touch) return

      if (mode === 'container' && containerRef?.current) {
        const container = containerRef.current
        const rect = container.getBoundingClientRect()

        const position: CursorPosition = {
          x: Math.round(touch.clientX - rect.left + container.scrollLeft),
          y: Math.round(touch.clientY - rect.top + container.scrollTop)
        }

        onUpdate(position)
      } else {
        const position: CursorPosition = {
          x: Math.round(touch.clientX),
          y: Math.round(touch.clientY)
        }

        onUpdate(position)
      }
    },
    [onUpdate, mode, containerRef]
  )

  return {
    onMouseMove: enabled ? handleMouseMove : undefined,
    onMouseLeave: enabled ? handleMouseLeave : undefined,
    onTouchStart: enabled ? handleTouchStart : undefined,
    onTouchMove: enabled ? handleTouchMove : undefined
  }
}
