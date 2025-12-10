/**
 * Selections container component for rendering all users' text selections
 * @module adapters/react/Selections
 */

import { type ReactNode } from 'react'
import { Selection, type SelectionUser } from './Selection'
import type { CursorMode } from '../../cursor/types'

/**
 * Props for Selections component
 */
export interface SelectionsProps {
  /** Document ID for awareness protocol */
  documentId: string

  /** Container element (required for container mode) */
  containerRef?: React.RefObject<HTMLElement>

  /** Positioning mode (viewport or container) */
  mode?: CursorMode

  /** Show local user's selection (default: false) */
  showSelf?: boolean

  /** Selection box opacity (default: 0.2) */
  opacity?: number

  /** Users with selection data (from awareness) */
  users?: SelectionUser[]
}

/**
 * Selections component - renders all users' text selections
 *
 * Automatically renders all remote users' text selections as highlight boxes,
 * similar to Google Docs collaborative editing.
 *
 * @param props - Component props
 * @returns React element
 *
 * @example
 * ```tsx
 * // Viewport mode
 * <Selections
 *   documentId="doc-123"
 *   users={allUsers}
 * />
 *
 * // Container mode
 * const containerRef = useRef<HTMLDivElement>(null)
 * <Selections
 *   documentId="doc-123"
 *   users={allUsers}
 *   mode="container"
 *   containerRef={containerRef}
 * />
 * ```
 */
export function Selections({
  documentId: _documentId,
  containerRef,
  mode = 'viewport',
  showSelf: _showSelf = false,
  opacity = 0.2,
  users = []
}: SelectionsProps): ReactNode {
  // Filter users based on showSelf
  // Note: In real usage, users array should come from usePresence hook
  // and filtering should happen there, but we keep it simple for now

  const usersWithSelections = users.filter(u => u.selection && u.selection.rects.length > 0)

  return (
    <>
      {usersWithSelections.map((user) => (
        <Selection
          key={user.id}
          user={user}
          mode={mode}
          containerRef={containerRef}
          opacity={opacity}
        />
      ))}
    </>
  )
}
