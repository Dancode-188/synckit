/**
 * Svelte store for tracking text selection and broadcasting via awareness
 * @module adapters/svelte/stores/selectionStore
 */

import { writable, derived, get, type Writable, type Readable } from 'svelte/store'
import { presence } from './presence'
import { getSyncKitContext } from '../utils/context'
import { getSerializedSelectionFromDOM } from '../../../cursor'
import type { SerializedRange } from '../../../cursor/types'

/**
 * Options for selectionStore
 */
export interface SelectionStoreOptions {
  /**
   * Document ID for awareness protocol
   */
  documentId: string

  /**
   * Container store for selection tracking (optional, used for filtering selections to container)
   */
  containerRef?: Writable<HTMLElement | null>

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
 * Return type for selectionStore
 */
export interface SelectionStoreReturn {
  /**
   * Container store for binding to element
   */
  containerRef: Writable<HTMLElement | null>

  /**
   * Current selection (local user) - semantic representation
   */
  selection: Readable<SerializedRange | null>

  /**
   * Manually set selection (useful for programmatic selection)
   */
  setSelection: (selection: SerializedRange | null) => void

  /**
   * Clear current selection
   */
  clearSelection: () => void

  /**
   * Cleanup function (call in onDestroy)
   */
  destroy: () => void
}

/**
 * Create a selection store for tracking text selection and broadcasting via awareness protocol
 *
 * @param options - Configuration options
 * @returns Selection tracking utilities
 */
export function selectionStore(options: SelectionStoreOptions): SelectionStoreReturn {
  const {
    documentId,
    containerRef: externalContainerRef,
    enabled = true,
    throttleMs = 100
  } = options

  // Internal container ref (used if external ref not provided)
  const internalContainerRef = writable<HTMLElement | null>(null)
  const containerRef = externalContainerRef || internalContainerRef

  const presenceStore = presence(getSyncKitContext(), documentId)

  let throttleTimeout: NodeJS.Timeout | null = null
  let pendingSelection: SerializedRange | null = null

  /**
   * Update selection in presence state (throttled)
   */
  const updateSelection = (selection: SerializedRange | null) => {
    pendingSelection = selection

    if (throttleTimeout) {
      clearTimeout(throttleTimeout)
    }

    throttleTimeout = setTimeout(() => {
      const sel = pendingSelection

      // Get current presence state
      const currentState = presenceStore.self?.state || {}

      const newState = {
        ...currentState,
        selection: sel
      }
      // console.log('[selectionStore] 📡 Sending semantic selection:', newState)
      presenceStore.updatePresence(newState)

      throttleTimeout = null
    }, throttleMs)
  }

  /**
   * Handle browser selection change
   */
  const handleSelectionChange = () => {
    if (!enabled) {
      return
    }

    const browserSelection = window.getSelection()

    if (!browserSelection || browserSelection.rangeCount === 0 || browserSelection.isCollapsed) {
      updateSelection(null)
      return
    }

    // If containerRef provided, check if selection is within our container
    const currentContainer = get(containerRef)

    if (currentContainer) {
      const range = browserSelection.getRangeAt(0)
      const ancestorNode = range.commonAncestorContainer

      if (ancestorNode && !currentContainer.contains(ancestorNode)) {
        updateSelection(null)
        return
      }
    }

    const serializedSelection = getSerializedSelectionFromDOM()

    if (!serializedSelection) {
      updateSelection(null)
      return
    }

    updateSelection(serializedSelection)
  }

  // Set up selection change listener
  if (enabled && typeof document !== 'undefined') {
    document.addEventListener('selectionchange', handleSelectionChange)
  }

  /**
   * Manually set selection (programmatic)
   */
  const setSelection = (selection: SerializedRange | null) => {
    updateSelection(selection)
  }

  /**
   * Clear selection
   */
  const clearSelection = () => {
    updateSelection(null)

    const selection = window.getSelection()
    const currentContainer = get(containerRef)

    if (selection && selection.anchorNode && currentContainer) {
      if (currentContainer.contains(selection.anchorNode)) {
        selection.removeAllRanges()
      }
    }
  }

  /**
   * Cleanup function
   */
  const destroy = () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }

    if (throttleTimeout) {
      clearTimeout(throttleTimeout)
    }
  }

  // Selection store derived from presence
  // Subscribe to the presence store and extract selection from self state
  const selection = derived(
    { subscribe: presenceStore.subscribe },
    () => {
      return (presenceStore.self?.state?.selection as SerializedRange | null) || null
    }
  )

  return {
    containerRef,
    selection,
    setSelection,
    clearSelection,
    destroy
  }
}
