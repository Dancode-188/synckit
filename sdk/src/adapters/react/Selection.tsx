/**
 * Selection component for rendering a single user's text selection
 * @module adapters/react/Selection
 */

import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { getSelectionBounds } from '../../cursor'
import type { SelectionRange } from '../../cursor/types'

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
  /** Selection range (anchor + head) */
  selection: SelectionRange | null
}

/**
 * Props for Selection component
 */
export interface SelectionProps {
  /** User whose selection to render */
  user: SelectionUser

  /** Container element for coordinate conversion */
  containerRef: RefObject<HTMLElement>

  /** Custom render function (optional) */
  render?: (user: SelectionUser, bounds: {
    left: number
    top: number
    width: number
    height: number
  }) => React.ReactNode

  /** Additional CSS class */
  className?: string

  /** Additional inline styles */
  style?: CSSProperties

  /** Selection box opacity (default: 0.2) */
  opacity?: number

  /** Show user label next to selection (default: true) */
  showLabel?: boolean
}

/**
 * Selection component - renders a single user's text selection as a highlight box
 *
 * Converts selection range (anchor + head) to a bounding box and renders
 * a semi-transparent highlight, similar to Google Docs selection visualization.
 *
 * @param props - Component props
 * @returns React element or null if no selection
 *
 * @example
 * ```tsx
 * <Selection
 *   user={user}
 *   containerRef={editorRef}
 *   opacity={0.2}
 *   showLabel={true}
 * />
 * ```
 */
export function Selection({
  user,
  containerRef,
  render,
  className = '',
  style = {},
  opacity = 0.2,
  showLabel = true
}: SelectionProps): React.ReactNode {
  const selectionRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  // Update selection box position and dimensions
  useEffect(() => {
    if (!user.selection || !containerRef.current || !selectionRef.current) {
      return
    }

    const bounds = getSelectionBounds(
      user.selection.anchor,
      user.selection.head,
      containerRef.current
    )

    const element = selectionRef.current

    // Apply positioning
    element.style.left = `${bounds.left}px`
    element.style.top = `${bounds.top}px`
    element.style.width = `${bounds.width}px`
    element.style.height = `${bounds.height}px`

    // Update label position if shown
    if (showLabel && labelRef.current && user.name) {
      const label = labelRef.current
      // Position label at top-left of selection
      label.style.left = `${bounds.left}px`
      label.style.top = `${bounds.top - 20}px` // 20px above selection
    }
  }, [user.selection, containerRef, showLabel, user.name])

  // No selection, don't render
  if (!user.selection) {
    return null
  }

  // Use custom render function if provided
  if (render && containerRef.current) {
    const bounds = getSelectionBounds(
      user.selection.anchor,
      user.selection.head,
      containerRef.current
    )
    return render(user, bounds)
  }

  const userColor = user.color || '#3B82F6' // Default blue

  return (
    <>
      {/* Selection highlight box */}
      <div
        ref={selectionRef}
        className={`synckit-selection ${className}`}
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          backgroundColor: userColor,
          opacity,
          borderRadius: '2px',
          transition: 'all 0.15s ease-out',
          zIndex: 1000,
          ...style
        }}
        data-selection-id={user.id}
        data-user-name={user.name}
      />

      {/* User label */}
      {showLabel && user.name && (
        <div
          ref={labelRef}
          className="synckit-selection-label"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            backgroundColor: userColor,
            color: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            opacity: 0.9,
            zIndex: 1001,
            transition: 'all 0.15s ease-out'
          }}
        >
          {user.name}
        </div>
      )}
    </>
  )
}

/**
 * Default selection renderer
 * Can be used as a reference for custom renderers
 *
 * @example
 * ```tsx
 * <Selection
 *   user={user}
 *   containerRef={containerRef}
 *   render={(user, bounds) => (
 *     <div
 *       style={{
 *         position: 'absolute',
 *         left: bounds.left,
 *         top: bounds.top,
 *         width: bounds.width,
 *         height: bounds.height,
 *         backgroundColor: user.color,
 *         opacity: 0.3,
 *         border: `2px solid ${user.color}`,
 *         borderRadius: '4px'
 *       }}
 *     />
 *   )}
 * />
 * ```
 */
export function DefaultSelectionRenderer(
  user: SelectionUser,
  bounds: { left: number; top: number; width: number; height: number }
): React.ReactNode {
  const userColor = user.color || '#3B82F6'

  return (
    <div
      style={{
        position: 'absolute',
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        backgroundColor: userColor,
        opacity: 0.2,
        borderRadius: '2px',
        pointerEvents: 'none'
      }}
      data-selection-id={user.id}
    />
  )
}
