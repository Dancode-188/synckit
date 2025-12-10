/**
 * Cursors component - zero-config rendering of all cursors for a document
 * Simple viewport-relative positioning following Liveblocks pattern
 *
 * @module adapters/react/Cursors
 */

import { useEffect, type ReactNode } from 'react'
import { useOthers, useSelf } from '../react'
import { Cursor, type CursorUser } from './Cursor'
import type { SpringConfig } from '../../cursor/types'
import type { AwarenessState } from '../../awareness'

export interface CursorsProps {
  /** Document ID to track cursors for */
  documentId: string
  /** Show self cursor (default: false) */
  showSelf?: boolean
  /** Show cursor labels (default: true) */
  showLabels?: boolean

  // Phase 5+ props (not yet implemented)
  /** Custom cursor renderer (Phase 5) */
  renderCursor?: (user: CursorUser) => ReactNode
  /** Spring animation config (Phase 5) */
  spring?: Partial<SpringConfig>
  /** Custom className (Phase 5) */
  className?: string
  /** Custom styles (Phase 5) */
  style?: React.CSSProperties
}

/**
 * Convert awareness state to cursor user format
 */
function toCursorUser(state: AwarenessState): CursorUser | null {
  if (!state.state) return null

  const s = state.state as any

  return {
    id: state.client_id,
    name: s.user?.name || s.name,
    color: s.user?.color || s.color,
    cursor: s.cursor || null,
    ...state.state
  }
}

/**
 * Cursors component - renders all cursors for a document
 *
 * The absolute easiest way to add collaborative cursors:
 * ```tsx
 * <Cursors documentId="my-doc" />
 * ```
 *
 * That's it! Zero configuration required.
 *
 * @example
 * ```tsx
 * // Minimal usage - just works!
 * function App() {
 *   return (
 *     <div>
 *       <Cursors documentId="my-doc" />
 *     </div>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With options
 * function Editor() {
 *   return (
 *     <div>
 *       <Cursors
 *         documentId="my-doc"
 *         showSelf={true}
 *         showLabels={true}
 *       />
 *     </div>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Custom cursor renderer (Phase 5 - not yet implemented)
 * <Cursors
 *   documentId="my-doc"
 *   renderCursor={(user) => (
 *     <div style={{ color: user.color }}>
 *       <svg>...</svg>
 *       <span>{user.name}</span>
 *     </div>
 *   )}
 * />
 * ```
 */
export function Cursors({
  documentId,
  showSelf = false,
  showLabels = true
}: CursorsProps): ReactNode {
  // Get other users' awareness states
  const others = useOthers(documentId)

  // Get self awareness state (if showSelf is enabled)
  const self = useSelf(documentId)

  // Convert awareness states to cursor users
  const otherCursors: CursorUser[] = others
    .map(toCursorUser)
    .filter((user): user is CursorUser => user !== null && user.cursor !== null)

  const selfCursor = showSelf && self ? toCursorUser(self) : null

  const allCursors: CursorUser[] = [
    ...otherCursors,
    ...(selfCursor && selfCursor.cursor ? [selfCursor] : [])
  ]

  // Debug: Log cursor data received from awareness
  useEffect(() => {
    if (otherCursors.length > 0) {
      console.log('[Cursors] Rendering cursors:', otherCursors.map(u => ({
        id: u.id,
        name: u.name,
        cursor: u.cursor
      })))
    }
  }, [otherCursors])

  // Render cursors directly - position: fixed handles everything
  return (
    <>
      {allCursors.map((user) => (
        <Cursor
          key={user.id}
          user={user}
          showLabel={showLabels}
        />
      ))}
    </>
  )
}
