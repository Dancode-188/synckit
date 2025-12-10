/**
 * React hook for tracking text selection and broadcasting via awareness
 * @module adapters/react/useSelection
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { usePresence, useSyncKit } from '../react'
import { selectionFromRange, isSelectionEmpty } from '../../cursor'
import type { SelectionRange } from '../../cursor/types'

/**
 * Options for useSelection hook
 */
export interface UseSelectionOptions {
  /**
   * Document ID for awareness protocol
   */
  documentId: string

  /**
   * Container ref for selection tracking (auto-detects if not provided)
   */
  containerRef?: RefObject<HTMLElement>

  /**
   * Whether to track selection automatically
   * @default true
   */
  enabled?: boolean

  /**
   * Minimum selection area to broadcast (filter out tiny selections)
   * @default 0.0001 (0.01% of container area)
   */
  minArea?: number

  /**
   * Throttle delay for selection updates in ms
   * @default 50
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
    enabled = true,
    minArea = 0.0001,
    throttleMs = 50
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
    if (!enabled || !containerRef.current) {
      return
    }

    const selection = window.getSelection()

    // No selection or collapsed selection (just cursor, no range)
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      updateSelection(null)
      return
    }

    const range = selection.getRangeAt(0)
    const container = containerRef.current

    // Check if selection is within our container
    if (!container.contains(range.commonAncestorContainer)) {
      updateSelection(null)
      return
    }

    // Convert range to our SelectionRange format
    const selectionRange = selectionFromRange(range, container)

    if (!selectionRange) {
      updateSelection(null)
      return
    }

    // Filter out empty or very small selections
    if (isSelectionEmpty(selectionRange)) {
      updateSelection(null)
      return
    }

    // Calculate selection area and filter if too small
    const width = Math.abs(selectionRange.head.x - selectionRange.anchor.x)
    const height = Math.abs(selectionRange.head.y - selectionRange.anchor.y)
    const area = width * height

    if (area < minArea) {
      updateSelection(null)
      return
    }

    // Update selection - LOG ONLY THIS IMPORTANT EVENT
    console.log('[useSelection] ✅ Selection captured:', selectionRange)
    updateSelection(selectionRange)
  }, [enabled, updateSelection, minArea])

  /**
   * Set up selection change listener
   */
  useEffect(() => {
    if (!enabled) return

    console.log('[useSelection] ✅ Setting up selectionchange listener, containerRef:', containerRef.current)

    // Listen to global selectionchange event
    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)

      // Clear throttle timeout
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current)
      }
    }
  }, [enabled, handleSelectionChange])

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
