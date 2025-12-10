/**
 * Selection component for rendering a single user's text selection
 * @module adapters/react/Selection
 */

import type { ReactNode } from 'react'
import type { SelectionRange, CursorMode } from '../../cursor/types'

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
  /** Selection range (multiple rectangles for multi-line) */
  selection?: SelectionRange | null
}

/**
 * Props for Selection component
 */
export interface SelectionProps {
  /** User whose selection to render */
  user: SelectionUser

  /** Positioning mode (viewport or container) */
  mode?: CursorMode

  /** Container ref (required for container mode) */
  containerRef?: React.RefObject<HTMLElement>

  /** Selection box opacity (default: 0.2) */
  opacity?: number
}

/**
 * Selection component - renders a single user's text selection as highlight boxes
 *
 * Renders each line of a multi-line selection as a separate rectangle,
 * similar to Google Docs selection visualization.
 *
 * @param props - Component props
 * @returns React element or null if no selection
 *
 * @example
 * ```tsx
 * <Selection
 *   user={user}
 *   mode="container"
 *   containerRef={editorRef}
 *   opacity={0.2}
 * />
 * ```
 */
export function Selection({
  user,
  mode = 'viewport',
  containerRef,
  opacity = 0.2
}: SelectionProps): ReactNode {
  // Don't render if no selection
  if (!user.selection || user.selection.rects.length === 0) {
    return null
  }

  // Validate container mode requirements
  if (mode === 'container' && !containerRef?.current) {
    console.warn('[Selection] Container mode requires containerRef')
    return null
  }

  const color = user.color || '#3b82f6'

  return (
    <>
      {user.selection.rects.map((rect, index) => (
        <div
          key={`${user.id}-rect-${index}`}
          data-selection-id={user.id}
          data-user-name={user.name}
          style={{
            position: mode === 'container' ? 'absolute' : 'fixed',
            left: 0,
            top: 0,
            transform: `translate(${rect.x}px, ${rect.y}px)`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            backgroundColor: color,
            opacity,
            pointerEvents: 'none',
            zIndex: 9998, // Below cursors (9999) but above content
            transition: 'opacity 0.2s ease',
            borderRadius: '2px'
          }}
        />
      ))}
    </>
  )
}
