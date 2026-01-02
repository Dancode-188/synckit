/**
 * Vue composable for tracking text selection and broadcasting via awareness
 * @module adapters/vue/composables/useSelection
 */

import { ref, computed, onMounted, onUnmounted, type Ref } from 'vue'
import { usePresence } from '../index'
import { getSerializedSelectionFromDOM } from '../../../cursor'
import type { SerializedRange } from '../../../cursor/types'

/**
 * Options for useSelection composable
 */
export interface UseSelectionOptions {
  /**
   * Document ID for awareness protocol
   */
  documentId: string

  /**
   * Container ref for selection tracking (optional, used for filtering selections to container)
   */
  containerRef?: Ref<HTMLElement | null>

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
 * Return type for useSelection composable
 */
export interface UseSelectionReturn {
  /**
   * Container ref for binding to element
   */
  containerRef: Ref<HTMLElement | null>

  /**
   * Current selection (local user) - semantic representation
   */
  selection: Ref<SerializedRange | null>

  /**
   * Manually set selection (useful for programmatic selection)
   */
  setSelection: (selection: SerializedRange | null) => void

  /**
   * Clear current selection
   */
  clearSelection: () => void
}

/**
 * Composable for tracking text selection and broadcasting via awareness protocol
 *
 * @param options - Configuration options
 * @returns Selection tracking utilities
 */
export function useSelection(options: UseSelectionOptions): UseSelectionReturn {
  const {
    documentId,
    containerRef: externalContainerRef,
    enabled = true,
    throttleMs = 100
  } = options

  // Internal container ref (used if external ref not provided)
  const internalContainerRef = ref<HTMLElement | null>(null)
  const containerRef = externalContainerRef || internalContainerRef

  const { self, updatePresence } = usePresence(documentId)

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

    throttleTimeout = setTimeout(async () => {
      const sel = pendingSelection
      const currentState = self.value?.state || {}

      const newState = {
        ...currentState,
        selection: sel
      }
      // console.log('[useSelection] 📡 Sending semantic selection:', newState)
      await updatePresence(newState)

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

    if (containerRef.value) {
      const range = browserSelection.getRangeAt(0)
      if (!containerRef.value.contains(range.commonAncestorContainer)) {
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

  onMounted(() => {
    if (!enabled) return
    document.addEventListener('selectionchange', handleSelectionChange)
  })

  onUnmounted(() => {
    document.removeEventListener('selectionchange', handleSelectionChange)

    if (throttleTimeout) {
      clearTimeout(throttleTimeout)
    }
  })

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
    if (
      selection &&
      containerRef.value &&
      containerRef.value.contains(selection.anchorNode)
    ) {
      selection.removeAllRanges()
    }
  }

  // Selection ref derived from self presence
  const selection = computed(() =>
    (self.value?.state?.selection as SerializedRange | null) || null
  )

  return {
    containerRef,
    selection,
    setSelection,
    clearSelection
  }
}
