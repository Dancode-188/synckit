/**
 * useUndo composable
 * Provides undo/redo functionality with cross-tab synchronization
 * @module adapters/vue/composables/useUndo
 */

import { ref, readonly, watch, computed, type Ref } from 'vue'
import { toValue } from '../utils/refs'
import { useCleanup } from '../utils/lifecycle'
import type { MaybeRefOrGetter } from '../types'
import { UndoManager, type Operation, type UndoManagerOptions } from '../../../undo/undo-manager'
import { CrossTabSync } from '../../../sync/cross-tab'

/**
 * Options for useUndo
 */
export interface UseUndoOptions extends Omit<UndoManagerOptions, 'documentId' | 'crossTabSync'> {
  /**
   * Whether to enable cross-tab synchronization
   * @default true
   */
  enableCrossTab?: boolean
}

/**
 * Return type for useUndo
 */
export interface UseUndoReturn {
  /** Current undo stack (readonly) */
  undoStack: Ref<readonly Operation[]>
  /** Current redo stack (readonly) */
  redoStack: Ref<readonly Operation[]>
  /** Whether undo is possible */
  canUndo: Ref<boolean>
  /** Whether redo is possible */
  canRedo: Ref<boolean>
  /** Undo the last operation */
  undo: () => Operation | null
  /** Redo the last undone operation */
  redo: () => Operation | null
  /** Add an operation to the undo stack */
  add: (operation: Operation) => void
  /** Clear all undo/redo history */
  clear: () => void
}

/**
 * Provides undo/redo functionality with cross-tab synchronization
 *
 * @param documentId - Document ID (can be a ref, getter, or static value)
 * @param options - Configuration options
 * @returns Reactive undo/redo state and methods
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useUndo } from '@synckit-js/sdk/vue'
 *
 * const { canUndo, canRedo, undo, redo, add } = useUndo('doc-123')
 *
 * // Add operations
 * add({ type: 'insert', data: 'hello' })
 * add({ type: 'insert', data: ' world' })
 *
 * // Undo/redo
 * if (canUndo.value) {
 *   const operation = undo()
 *   console.log('Undid:', operation)
 * }
 *
 * if (canRedo.value) {
 *   redo()
 * }
 * </script>
 *
 * <template>
 *   <div>
 *     <button @click="undo" :disabled="!canUndo">Undo</button>
 *     <button @click="redo" :disabled="!canRedo">Redo</button>
 *   </div>
 * </template>
 * ```
 *
 * @example With custom merge strategy
 * ```vue
 * <script setup>
 * const { add } = useUndo('doc-123', {
 *   mergeWindow: 2000, // 2 second merge window
 *   canMerge: (prev, next) => {
 *     // Custom merge logic
 *     return prev.type === next.type && prev.userId === next.userId
 *   },
 *   merge: (prev, next) => ({
 *     ...prev,
 *     data: prev.data + next.data
 *   })
 * })
 * </script>
 * ```
 */
export function useUndo(
  documentId: MaybeRefOrGetter<string>,
  options: UseUndoOptions = {}
): UseUndoReturn {
  const {
    enableCrossTab = true,
    ...undoOptions
  } = options

  // Reactive state
  const undoStack = ref<Operation[]>([])
  const redoStack = ref<Operation[]>([])
  const manager = ref<UndoManager | null>(null)
  const crossTabSync: Ref<CrossTabSync | null> = ref(null)

  // Computed reactive flags
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  // Get document ID value
  const docId = toValue(documentId)

  // Initialize undo manager
  const initManager = async () => {
    try {
      // Create CrossTabSync instance if enabled
      if (enableCrossTab) {
        crossTabSync.value = new CrossTabSync(docId, { enabled: true })
        crossTabSync.value.enable()
      } else {
        crossTabSync.value = new CrossTabSync(docId, { enabled: false })
      }

      // Create UndoManager instance
      manager.value = new UndoManager({
        documentId: docId,
        crossTabSync: crossTabSync.value as CrossTabSync,
        ...undoOptions,
        onStateChanged: (state) => {
          undoStack.value = state.undoStack
          redoStack.value = state.redoStack

          // Call user's onStateChanged if provided
          if (undoOptions.onStateChanged) {
            undoOptions.onStateChanged(state)
          }
        }
      })

      // Initialize the manager
      await manager.value.init()

      // Auto-cleanup on unmount
      useCleanup(() => {
        if (manager.value) {
          manager.value.destroy()
        }
        if (crossTabSync.value) {
          crossTabSync.value.destroy()
        }
      })
    } catch (err) {
      console.error('[SyncKit] useUndo: Failed to initialize undo manager', err)
      throw err
    }
  }

  // Initialize on mount
  initManager()

  // Watch for ID changes (if id is a ref or getter)
  watch(
    () => toValue(documentId),
    (newId: string, oldId: string) => {
      if (newId !== oldId) {
        // Clean up old instances
        if (manager.value) {
          manager.value.destroy()
        }
        if (crossTabSync.value) {
          crossTabSync.value.destroy()
        }
        // Reinitialize with new ID
        initManager()
      }
    }
  )

  // Methods
  const undo = (): Operation | null => {
    if (!manager.value) {
      console.warn('[SyncKit] useUndo: Manager not initialized')
      return null
    }
    return manager.value.undo()
  }

  const redo = (): Operation | null => {
    if (!manager.value) {
      console.warn('[SyncKit] useUndo: Manager not initialized')
      return null
    }
    return manager.value.redo()
  }

  const add = (operation: Operation): void => {
    if (!manager.value) {
      console.warn('[SyncKit] useUndo: Manager not initialized')
      return
    }
    manager.value.add(operation)
  }

  const clear = (): void => {
    if (!manager.value) {
      console.warn('[SyncKit] useUndo: Manager not initialized')
      return
    }
    manager.value.clear()
  }

  // Return reactive state and methods
  return {
    undoStack: readonly(undoStack) as Ref<readonly Operation[]>,
    redoStack: readonly(redoStack) as Ref<readonly Operation[]>,
    canUndo,
    canRedo,
    undo,
    redo,
    add,
    clear
  }
}
