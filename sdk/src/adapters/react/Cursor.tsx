/**
 * Individual cursor component - Supports both viewport and container modes
 * @module adapters/react/Cursor
 */

import { useEffect, useState, useRef } from 'react'
import { SpringAnimation } from '../../cursor/animation'
import { isPositionInViewport } from '../../cursor/coordinates'
import type { CursorPosition, SpringConfig, CursorMode } from '../../cursor/types'

// User interface for backward compatibility
export interface CursorUser {
  id: string
  name?: string
  color?: string
  cursor: CursorPosition | null
  [key: string]: unknown
}

export interface CursorProps {
  /** User data with cursor position */
  user: CursorUser

  /** Custom cursor label (defaults to user name) */
  label?: string

  /** Custom cursor color (defaults to user color or generated color) */
  color?: string

  /** Whether to show the label (default: true) */
  showLabel?: boolean

  /** Enable smooth animation (default: true) */
  animated?: boolean

  /** Spring animation configuration */
  spring?: Partial<SpringConfig>

  /**
   * Positioning mode (default: 'viewport')
   * - viewport: Cursors fixed to screen (current default)
   * - container: Cursors scroll with content (like Google Docs)
   */
  mode?: CursorMode

  /**
   * Container ref (required when mode='container')
   * Not needed for viewport mode
   */
  containerRef?: React.RefObject<HTMLElement>

  // Future props
  stackOffset?: number
  render?: unknown
}

/**
 * Renders an individual user's cursor with smooth animation
 * Supports both viewport-fixed and container-relative positioning
 *
 * @example Viewport mode (default)
 * ```tsx
 * <Cursor user={{ id: '1', name: 'Alice', cursor: { x: 250, y: 400 } }} />
 * ```
 *
 * @example Container mode
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null)
 * <Cursor
 *   user={{ id: '1', name: 'Alice', cursor: { x: 250, y: 2400 } }}
 *   mode="container"
 *   containerRef={containerRef}
 * />
 * ```
 */
export function Cursor({
  user,
  label,
  color,
  showLabel = true,
  animated = true,
  spring,
  mode = 'viewport',
  containerRef
}: CursorProps) {
  // Don't render if no cursor position
  if (!user.cursor) {
    return null
  }

  // Validate container ref for container mode
  if (mode === 'container' && !containerRef) {
    console.warn('[Cursor] Container mode requires containerRef prop')
    return null
  }

  if (mode === 'container' && !containerRef?.current) {
    console.warn('[Cursor] Container mode: containerRef.current is null')
    return null
  }

  const cursorColor = color || user.color || `hsl(${hashCode(user.id) % 360}, 70%, 50%)`
  const cursorLabel = label || user.name || user.id.slice(-8)

  // Spring animation instance (one per cursor)
  const springRef = useRef<SpringAnimation | null>(null)

  // Display position (viewport coordinates for rendering)
  const [displayPosition, setDisplayPosition] = useState<CursorPosition>(user.cursor)

  // Visibility state (for container mode)
  const [isVisible, setIsVisible] = useState(true)

  // Initialize spring animation (only once)
  useEffect(() => {
    if (!animated) return

    const springAnim = new SpringAnimation(spring)

    // Set initial position if cursor exists
    if (user.cursor) {
      // In container mode: use container coords directly (position: absolute)
      // In viewport mode: use viewport coords (position: fixed)
      springAnim.setPosition(user.cursor)
    }

    springAnim.subscribe((pos) => {
      setDisplayPosition(pos)
    })

    springRef.current = springAnim

    return () => {
      springAnim.destroy()
      springRef.current = null
    }
  }, [animated, spring, mode])  // Don't include user.cursor - we update via setTarget instead

  // Update display position when cursor moves or scroll changes
  useEffect(() => {
    const updateDisplayPosition = () => {
      if (!user.cursor) return

      if (mode === 'container' && containerRef?.current) {
        // Container mode: Use container coords directly with position: absolute
        const visible = isPositionInViewport(user.cursor, containerRef.current)

        setIsVisible(visible)

        if (animated && springRef.current) {
          springRef.current.setTarget(user.cursor)
        } else {
          setDisplayPosition(user.cursor)
        }
      } else {
        // Viewport mode: Use viewport coords with position: fixed
        setIsVisible(true)

        if (animated && springRef.current) {
          springRef.current.setTarget(user.cursor)
        } else {
          setDisplayPosition(user.cursor)
        }
      }
    }

    updateDisplayPosition()

    // Listen to scroll events in container mode
    if (mode === 'container' && containerRef?.current) {
      const container = containerRef.current

      container.addEventListener('scroll', updateDisplayPosition, { passive: true })
      window.addEventListener('scroll', updateDisplayPosition, { passive: true })
      window.addEventListener('resize', updateDisplayPosition, { passive: true })

      return () => {
        container.removeEventListener('scroll', updateDisplayPosition)
        window.removeEventListener('scroll', updateDisplayPosition)
        window.removeEventListener('resize', updateDisplayPosition)
      }
    }
  }, [user.cursor, animated, mode, containerRef])

  // Don't render if off-screen in container mode
  if (!isVisible) {
    return null
  }

  return (
    <div
      data-cursor-id={user.id}
      style={{
        position: mode === 'container' ? 'absolute' : 'fixed',
        left: 0,
        top: 0,
        transform: `translate(${displayPosition.x}px, ${displayPosition.y}px)`,
        pointerEvents: 'none',
        zIndex: 9999,
        willChange: 'transform'
      }}
    >
      {/* Cursor pointer */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
      >
        <path
          d="M5 3L19 12L12 13L9 19L5 3Z"
          fill={cursorColor}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>

      {/* Label */}
      {showLabel && (
        <div
          style={{
            position: 'absolute',
            left: '20px',
            top: '0px',
            backgroundColor: cursorColor,
            color: 'white',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          {cursorLabel}
        </div>
      )}
    </div>
  )
}

/**
 * Simple hash function to generate consistent color from user ID
 */
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash)
}
