/**
 * Selection component for rendering a single user's text selection
 * @module adapters/react/Selection
 */

import { useMemo, type ReactNode } from 'react'
import { deserializeRange } from '../../cursor/selection'
import type { SerializedRange, SelectionRange, CursorMode } from '../../cursor/types'

/**
 * Type guard to check if selection is in new serialized format
 */
function isSerializedRange(selection: any): selection is SerializedRange {
  return selection &&
         typeof selection.startXPath === 'string' &&
         typeof selection.startOffset === 'number' &&
         typeof selection.endXPath === 'string' &&
         typeof selection.endOffset === 'number'
}

/**
 * Type guard to check if selection is in old visual format
 */
function isVisualRange(selection: any): selection is SelectionRange {
  return selection && Array.isArray(selection.rects)
}

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
  /**
   * Selection range - supports both formats for backward compatibility:
   * - SerializedRange (new): Semantic, layout-independent (recommended)
   * - SelectionRange (old): Visual coordinates (deprecated, use for migration only)
   */
  selection?: SerializedRange | SelectionRange | null
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
  // Convert selection to visual format
  // Supports both new semantic format and old visual format for backward compatibility
  const visualSelection = useMemo(() => {
    if (!user.selection) return null

    // New format (SerializedRange): Deserialize to visual coordinates
    if (isSerializedRange(user.selection)) {
      return deserializeRange(
        user.selection,
        mode,
        containerRef?.current || undefined
      )
    }

    // Old format (SelectionRange): Use directly
    // This path provides backward compatibility for existing implementations
    if (isVisualRange(user.selection)) {
      console.warn(
        '[Selection] Received deprecated visual selection format. ' +
        'Please upgrade to semantic selection for cross-layout compatibility.'
      )
      return user.selection
    }

    return null
  }, [user.selection, mode, containerRef?.current])

  // Don't render if conversion failed or no rectangles
  if (!visualSelection || visualSelection.rects.length === 0) {
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
      {visualSelection.rects.map((rect, index) => (
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
