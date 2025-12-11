/**
 * useSyncField composable
 * Sync a single field from a document
 * @module adapters/vue/composables/useSyncField
 */

import { computed, type ComputedRef } from 'vue'
import { useSyncDocument } from './useSyncDocument'
import type { MaybeRefOrGetter, UseSyncFieldOptions, UseSyncFieldReturn } from '../types'

/**
 * Sync a single field from a document
 * Convenience wrapper around useSyncDocument for field-level reactivity
 *
 * @param id - Document ID
 * @param field - Field key
 * @param options - Configuration options
 * @returns Reactive field value and setter
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useSyncField } from '@synckit-js/sdk/vue'
 *
 * interface User {
 *   name: string
 *   email: string
 * }
 *
 * const { value: name, setValue: setName, loading } = useSyncField<User, 'name'>(
 *   'user-123',
 *   'name'
 * )
 *
 * // Update the field
 * await setName('Alice')
 * </script>
 *
 * <template>
 *   <div v-if="loading">Loading...</div>
 *   <div v-else>
 *     <input v-model="name" @blur="setName(name)" />
 *   </div>
 * </template>
 * ```
 */
export function useSyncField<
  T extends Record<string, unknown>,
  K extends keyof T
>(
  id: MaybeRefOrGetter<string>,
  field: K,
  options: UseSyncFieldOptions = {}
): UseSyncFieldReturn<T[K]> {
  const { data, loading, error, set } = useSyncDocument<T>(id, options)

  // Computed value for the specific field
  const value = computed(() => data.value[field])

  // Setter for the specific field
  const setValue = async (newValue: T[K]): Promise<void> => {
    await set(field, newValue)
  }

  return {
    value: value as ComputedRef<T[K] | undefined>,
    loading,
    error,
    setValue
  }
}
