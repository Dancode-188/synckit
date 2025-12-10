/**
 * Individual cursor component - Smooth animated cursors
 * Phase 5: Using custom spring physics animation
 * @module adapters/react/Cursor
 */

import { useEffect, useState, useRef } from 'react'
import { SpringAnimation } from '../../cursor/animation'
import type { CursorPosition, SpringConfig } from '../../cursor/types'

// User interface for backward compatibility
export interface CursorUser {
  id: string
  name?: string
  color?: string
  cursor: CursorPosition | null
  [key: string]: unknown
}

export interface CursorProps {
  /** User data with cursor position (viewport coordinates) */
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

  // Phase 6 props (for future use)
  stackOffset?: number
  render?: unknown
}

/**
 * Renders an individual user's cursor with smooth animation
 * Uses custom spring physics for buttery smooth movement
 *
 * @example
 * ```tsx
 * <Cursor
 *   user={{
 *     id: 'user123',
 *     name: 'Alice',
 *     cursor: { x: 250, y: 400 }
 *   }}
 * />
 * ```
 */
export function Cursor({
  user,
  label,
  color,
  showLabel = true,
  animated = true,
  spring
}: CursorProps) {
  // Don't render if no cursor position
  if (!user.cursor) return null

  const cursorColor = color || user.color || `hsl(${hashCode(user.id) % 360}, 70%, 50%)`
  const cursorLabel = label || user.name || user.id.slice(-8)

  // Spring animation instance (one per cursor)
  const springRef = useRef<SpringAnimation | null>(null)

  // Animated position state
  const [animatedPosition, setAnimatedPosition] = useState<CursorPosition>(user.cursor)

  // Initialize spring animation
  useEffect(() => {
    if (!animated || !user.cursor) return

    const springAnim = new SpringAnimation(spring)
    springAnim.setPosition(user.cursor)
    springAnim.subscribe((pos) => {
      setAnimatedPosition(pos)
    })

    springRef.current = springAnim

    return () => {
      springAnim.destroy()
      springRef.current = null
    }
  }, [animated, spring, user.cursor])

  // Update target when cursor moves
  useEffect(() => {
    if (animated && springRef.current && user.cursor) {
      springRef.current.setTarget(user.cursor)
    } else if (!animated && user.cursor) {
      setAnimatedPosition(user.cursor)
    }
  }, [user.cursor, animated])

  // Use animated position if enabled, otherwise use raw position
  const displayPosition = animated ? animatedPosition : user.cursor

  return (
    <div
      data-cursor-id={user.id}
      style={{
        position: 'fixed',
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
