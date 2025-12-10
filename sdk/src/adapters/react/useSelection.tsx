/**
 * React hook for tracking text selection and broadcasting via awareness
 * @module adapters/react/useSelection
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { usePresence, useSyncKit } from '../react'
import { getSelectionFromDOM, isSelectionEmpty } from '../../cursor'
import type { SelectionRange, CursorMode } from '../../cursor/types'

/**
 * Options for useSelection hook
 */
export interface UseSelectionOptions {
  /**
   * Document ID for awareness protocol
   */
  documentId: string

  /**
   * Container ref for selection tracking (required for container mode)
   */
  containerRef?: RefObject<HTMLElement>

  /**
   * Positioning mode (viewport or container)
   * @default 'viewport'
   */
  mode?: CursorMode

  /**
   * Whether to track selection automatically
   * @default true
   */
  enabled?: boolean

  /**
   * Throttle delay for selection updates in ms
   * @default 100
   */
  throttleMs?: number
}

/**
 * Return type for useSelection hook
 */
export interface UseSelectionReturn {
  /**
   * Binding helper for the container element
   * Attaches ref automatically
   */
  bind: () => {
    ref: RefObject<HTMLElement>
  }

  /**
   * Current selection range (local user)
   */
  selection: SelectionRange | null

  /**
   * Manually set selection (useful for programmatic selection)
   */
  setSelection: (selection: SelectionRange | null) => void

  /**
   * Clear current selection
   */
  clearSelection: () => void
}

/**
 * Hook for tracking text selection and broadcasting via awareness protocol
 *
 * Automatically tracks browser text selection using the selectionchange event,
 * converts it to relative coordinates, and broadcasts via awareness protocol.
 *
 * @param options - Configuration options
 * @returns Selection tracking utilities
 *
 * @example
 * ```tsx
 * function CollaborativeEditor() {
 *   const editorRef = useRef(null)
 *   const selection = useSelection({ documentId: 'my-doc' })
 *
 *   return (
 *     <div
 *       {...selection.bind()}
 *       contentEditable
 *       style={{ position: 'relative' }}
 *     >
 *       <Selections documentId="my-doc" containerRef={editorRef} />
 *       {/* Editor content *\/}
 *     </div>
 *   )
 * }
 * ```
 */
export function useSelection(options: UseSelectionOptions): UseSelectionReturn {
  const {
    documentId,
    containerRef: externalContainerRef,
    mode = 'viewport',
    enabled = true,
    throttleMs = 100
  } = options

  // Internal container ref (used if external ref not provided)
  const internalContainerRef = useRef<HTMLElement>(null)
  const containerRef = externalContainerRef || internalContainerRef
  const [presence, setPresence] = usePresence(documentId, {
    selection: null as SelectionRange | null
  })

  // Get awareness instance to read current state before updating
  const synckit = useSyncKit()
  const awarenessRef = useRef<any>(null)
  if (!awarenessRef.current) {
    awarenessRef.current = synckit.getAwareness(documentId)
  }

  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSelectionRef = useRef<SelectionRange | null>(null)

  /**
   * Update selection in presence state (throttled)
   */
  const updateSelection = useCallback(
    (selection: SelectionRange | null) => {
      // Store pending selection
      pendingSelectionRef.current = selection

      // Clear existing timeout
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current)
      }

      // Throttle updates
      throttleTimeoutRef.current = setTimeout(() => {
        const sel = pendingSelectionRef.current

        // Get current awareness state to preserve cursor, name, color
        const currentState = awarenessRef.current?.getLocalState()?.state || {}

        const newState = {
          ...currentState,  // Preserve cursor, name, color
          selection: sel
        }
        console.log('[useSelection] 📡 Sending to server:', newState)
        setPresence(newState)

        throttleTimeoutRef.current = null
      }, throttleMs)
    },
    [presence, setPresence, throttleMs]
  )

  /**
   * Handle browser selection change
   */
  const handleSelectionChange = useCallback(() => {
    if (!enabled) {
      return
    }

    if (mode === 'container' && !containerRef.current) {
      console.warn('[useSelection] Container mode requires containerRef')
      return
    }

    const browserSelection = window.getSelection()

    // No selection or collapsed selection (just cursor, no range)
    if (!browserSelection || browserSelection.rangeCount === 0 || browserSelection.isCollapsed) {
      updateSelection(null)
      return
    }

    // For container mode, check if selection is within our container
    if (mode === 'container' && containerRef.current) {
      const range = browserSelection.getRangeAt(0)
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        updateSelection(null)
        return
      }
    }

    // Convert DOM selection to our SelectionRange format
    const selectionRange = getSelectionFromDOM(
      mode,
      containerRef.current || undefined
    )

    if (!selectionRange || isSelectionEmpty(selectionRange)) {
      updateSelection(null)
      return
    }

    // Update selection
    updateSelection(selectionRange)
  }, [enabled, mode, containerRef, updateSelection])

  /**
   * Set up selection change listener
   */
  useEffect(() => {
    if (!enabled) return

    // Listen to global selectionchange event
    document.addEventListener('selectionchange', handleSelectionChange)

    // For container mode, also update on scroll (selection coords change when scrolling)
    if (mode === 'container' && containerRef.current) {
      const container = containerRef.current
      container.addEventListener('scroll', handleSelectionChange, { passive: true })

      return () => {
        document.removeEventListener('selectionchange', handleSelectionChange)
        container.removeEventListener('scroll', handleSelectionChange)

        // Clear throttle timeout
        if (throttleTimeoutRef.current) {
          clearTimeout(throttleTimeoutRef.current)
        }
      }
    }

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)

      // Clear throttle timeout
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current)
      }
    }
  }, [enabled, mode, containerRef, handleSelectionChange])

  /**
   * Manually set selection (programmatic)
   */
  const setSelection = useCallback(
    (selection: SelectionRange | null) => {
      updateSelection(selection)
    },
    [updateSelection]
  )

  /**
   * Clear selection
   */
  const clearSelection = useCallback(() => {
    updateSelection(null)

    // Also clear browser selection if within our container
    const selection = window.getSelection()
    if (
      selection &&
      containerRef.current &&
      containerRef.current.contains(selection.anchorNode)
    ) {
      selection.removeAllRanges()
    }
  }, [updateSelection])

  /**
   * Binding helper
   */
  const bind = useCallback(() => {
    return {
      ref: containerRef
    }
  }, [])

  return {
    bind,
    selection: (presence?.selection as SelectionRange | null) || null,
    setSelection,
    clearSelection
  }
}
