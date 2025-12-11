/**
 * useSelf composable
 * Track current user's own presence state
 * @module adapters/vue/composables/useSelf
 */

import { type Ref } from 'vue'
import { usePresence } from './usePresence'
import type { MaybeRefOrGetter } from '../types'
import type { AwarenessState } from '../../../awareness'

export interface UseSelfOptions {
  /**
   * Initial state to set when presence is initialized
   */
  initialState?: Record<string, unknown>
}

export interface UseSelfReturn {
  /**
   * Current user's awareness state
   */
  self: Ref<AwarenessState | undefined>

  /**
   * Update local presence state
   */
  updatePresence: (state: Record<string, unknown>) => Promise<void>

  /**
   * Set a single field in presence state
   */
  setField: (key: string, value: unknown) => Promise<void>
}

/**
 * Track current user's own presence state
 * Convenience wrapper around usePresence that only returns self
 *
 * @param documentId - Document ID to track presence for
 * @param options - Configuration options
 * @returns Current user's state and update methods
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useSelf } from '@synckit-js/sdk/vue'
 *
 * const { self, updatePresence } = useSelf('doc-123', {
 *   initialState: {
 *     user: { name: 'Alice', color: '#FF6B6B' }
 *   }
 * })
 *
 * const updateCursor = (x: number, y: number) => {
 *   updatePresence({
 *     ...self.value?.state,
 *     cursor: { x, y }
 *   })
 * }
 * </script>
 *
 * <template>
 *   <div>
 *     <p>Your name: {{ self?.state.user?.name }}</p>
 *     <input
 *       :value="self?.state.user?.name"
 *       @input="(e) => updatePresence({
 *         user: { ...self?.state.user, name: e.target.value }
 *       })"
 *     />
 *   </div>
 * </template>
 * ```
 */
export function useSelf(
  documentId: MaybeRefOrGetter<string>,
  options: UseSelfOptions = {}
): UseSelfReturn {
  const { self, updatePresence, setField } = usePresence(documentId, options)

  return {
    self,
    updatePresence,
    setField,
  }
}
