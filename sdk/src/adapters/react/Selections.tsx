/**
 * Selections container component for rendering all users' text selections
 * @module adapters/react/Selections
 */

import { useRef, useEffect, type CSSProperties, type RefObject } from 'react'
import { useOthers, useSelf } from '../react'
import { Selection, type SelectionUser } from './Selection'

/**
 * Props for Selections component
 */
export interface SelectionsProps {
  /** Document ID for awareness protocol */
  documentId: string

  /** Container element for coordinate conversion (optional, auto-detected if not provided) */
  containerRef?: RefObject<HTMLElement>

  /** Show local user's selection (default: false) */
  showSelf?: boolean

  /** Custom render function for each selection (optional) */
  renderSelection?: (user: SelectionUser, bounds: {
    left: number
    top: number
    width: number
    height: number
  }) => React.ReactNode

  /** Additional CSS class for selections */
  className?: string

  /** Additional inline styles for selections */
  style?: CSSProperties

  /** Selection box opacity (default: 0.2) */
  opacity?: number

  /** Show user labels next to selections (default: true) */
  showLabels?: boolean
}

/**
 * Convert awareness user to SelectionUser format
 */
function toSelectionUser(awarenessUser: any): SelectionUser | null {
  if (!awarenessUser || !awarenessUser.state) return null

  const state = awarenessUser.state

  return {
    id: awarenessUser.client_id,
    name: state.name || state.user?.name || 'Anonymous',
    color: state.color || state.user?.color || '#ccc',
    selection: state.selection || null
  }
}

/**
 * Selections component - zero-config multi-user selection visualization
 *
 * Automatically renders all remote users' text selections as highlight boxes,
 * similar to Google Docs collaborative editing. Integrates with the awareness
 * protocol to sync selections in real-time.
 *
 * @param props - Component props
 * @returns React element
 *
 * @example
 * ```tsx
 * // Zero-config usage
 * function CollaborativeEditor() {
 *   const editorRef = useRef(null)
 *   const selection = useSelection({ documentId: 'my-doc' })
 *
 *   return (
 *     <div {...selection.bind()} contentEditable>
 *       <Selections documentId="my-doc" containerRef={editorRef} />
 *       {/* Editor content *\/}
 *     </div>
 *   )
 * }
 *
 * // Custom styling
 * <Selections
 *   documentId="my-doc"
 *   opacity={0.3}
 *   showLabels={false}
 *   className="my-selections"
 * />
 *
 * // Custom renderer
 * <Selections
 *   documentId="my-doc"
 *   renderSelection={(user, bounds) => (
 *     <div
 *       style={{
 *         position: 'absolute',
 *         ...bounds,
 *         border: `2px solid ${user.color}`,
 *         backgroundColor: 'transparent'
 *       }}
 *     />
 *   )}
 * />
 * ```
 */
export function Selections({
  documentId,
  containerRef: externalContainerRef,
  showSelf = false,
  renderSelection,
  className,
  style,
  opacity = 0.2,
  showLabels = true
}: SelectionsProps): React.ReactNode {
  // Auto-create container ref if not provided
  const autoContainerRef = useRef<HTMLDivElement>(null)
  const containerRef = externalContainerRef || autoContainerRef

  // Get all other users from awareness
  const others = useOthers(documentId)
  const self = useSelf(documentId)

  // Convert to SelectionUser format and filter for users with selections
  const otherSelections: SelectionUser[] = others
    .map(toSelectionUser)
    .filter((user): user is SelectionUser =>
      user !== null && user.selection !== null
    )

  // Log only when selections change
  useEffect(() => {
    if (otherSelections.length > 0) {
      console.log('[Selections] 🎯 FOUND SELECTIONS:', otherSelections)
    }
  }, [otherSelections.length])

  // Optionally include self
  let allSelections = otherSelections
  if (showSelf && self) {
    const selfUser = toSelectionUser(self)
    if (selfUser && selfUser.selection) {
      allSelections = [selfUser, ...otherSelections]
    }
  }

  return (
    <>
      {allSelections.map((user) => (
        <Selection
          key={user.id}
          user={user}
          containerRef={containerRef}
          render={renderSelection}
          className={className}
          style={style}
          opacity={opacity}
          showLabel={showLabels}
        />
      ))}
    </>
  )
}

/**
 * Selections component with auto-detected container
 * Wraps content and auto-provides container ref
 *
 * @example
 * ```tsx
 * <SelectionsWithContainer documentId="my-doc">
 *   <div contentEditable>
 *     {/* Editor content *\/}
 *   </div>
 * </SelectionsWithContainer>
 * ```
 */
export function SelectionsWithContainer({
  documentId,
  children,
  ...props
}: SelectionsProps & { children: React.ReactNode }): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {children}
      <Selections
        documentId={documentId}
        containerRef={containerRef}
        {...props}
      />
    </div>
  )
}
