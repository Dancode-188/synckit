/**
 * useSyncDocument composable
 * Core document synchronization for Vue
 * @module adapters/vue/composables/useSyncDocument
 */

import { ref, readonly, watch, type Ref } from 'vue'
import { useSyncKit } from './useSyncKit'
import { toValue } from '../utils/refs'
import { useCleanup } from '../utils/lifecycle'
import type { MaybeRefOrGetter, UseSyncDocumentOptions, UseSyncDocumentReturn } from '../types'
import type { SyncDocument } from '../../../document'

/**
 * Sync a document with automatic reactivity
 * Following VueUse patterns: returns refs, accepts MaybeRefOrGetter, auto-cleanup
 *
 * @param id - Document ID (can be a ref, getter, or static value)
 * @param options - Configuration options
 * @returns Reactive document state and methods
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useSyncDocument } from '@synckit-js/sdk/vue'
 *
 * interface User {
 *   name: string
 *   email: string
 * }
 *
 * const { data, loading, set, update } = useSyncDocument<User>('user-123')
 *
 * // TypeScript knows data.value.name is a string
 * console.log(data.value.name)
 *
 * // Update a field
 * await set('name', 'Alice')
 *
 * // Update multiple fields
 * await update({ name: 'Alice', email: 'alice@example.com' })
 * </script>
 *
 * <template>
 *   <div v-if="loading">Loading...</div>
 *   <div v-else>
 *     <p>Name: {{ data.name }}</p>
 *     <p>Email: {{ data.email }}</p>
 *   </div>
 * </template>
 * ```
 *
 * @example With reactive ID
 * ```vue
 * <script setup>
 * import { ref } from 'vue'
 * import { useSyncDocument } from '@synckit-js/sdk/vue'
 * import { useRoute } from 'vue-router'
 *
 * const route = useRoute()
 *
 * // Document ID from route params (reactive)
 * const { data } = useSyncDocument(() => route.params.docId)
 *
 * // Or with a ref
 * const docId = ref('user-123')
 * const { data: userData } = useSyncDocument(docId)
 * </script>
 * ```
 */
export function useSyncDocument<T extends Record<string, unknown>>(
  id: MaybeRefOrGetter<string>,
  options: UseSyncDocumentOptions = {}
): UseSyncDocumentReturn<T> {
  const {
    autoInit = true,
    retry = true
  } = options

  const synckit = useSyncKit()

  // Reactive state (following VueUse pattern: return refs)
  const data = ref<T>({} as T)
  const loading = ref(true)
  const error = ref<Error | null>(null)
  const document = ref<SyncDocument<T> | null>(null)

  // Get document ID value
  const docId = toValue(id)

  // Initialize document
  const initDocument = async () => {
    try {
      loading.value = true
      error.value = null

      // Get document instance
      const doc = synckit.document<T>(docId)
      document.value = doc

      // Initialize if autoInit is enabled
      if (autoInit) {
        await doc.init()
      }

      // Subscribe to changes
      const unsubscribe = doc.subscribe((newData) => {
        data.value = newData
        loading.value = false
      })

      // Auto-cleanup on unmount
      useCleanup(() => {
        unsubscribe()
      })

      // Set initial data
      data.value = doc.get()
      loading.value = false
    } catch (err) {
      error.value = err as Error
      loading.value = false
      console.error('[SyncKit] useSyncDocument: Failed to initialize document', err)

      // Retry if enabled
      if (retry) {
        const retryConfig = typeof retry === 'object' ? retry : { attempts: 3, delay: 1000 }
        setTimeout(() => {
          if (retryConfig.attempts > 0) {
            initDocument()
          }
        }, retryConfig.delay)
      }
    }
  }

  // Initialize on mount
  initDocument()

  // Watch for ID changes (if id is a ref or getter)
  watch(
    () => toValue(id),
    (newId: string, oldId: string) => {
      if (newId !== oldId) {
        initDocument()
      }
    }
  )

  // Methods (following VueUse pattern: return functions)
  const set = async <K extends keyof T>(field: K, value: T[K]): Promise<void> => {
    if (!document.value) {
      throw new Error('[SyncKit] useSyncDocument: Document not initialized')
    }
    await document.value.set(field, value)
  }

  const update = async (updates: Partial<T>): Promise<void> => {
    if (!document.value) {
      throw new Error('[SyncKit] useSyncDocument: Document not initialized')
    }
    await document.value.update(updates)
  }

  const deleteField = async <K extends keyof T>(field: K): Promise<void> => {
    if (!document.value) {
      throw new Error('[SyncKit] useSyncDocument: Document not initialized')
    }
    await document.value.delete(field)
  }

  const refresh = async (): Promise<void> => {
    if (!document.value) {
      throw new Error('[SyncKit] useSyncDocument: Document not initialized')
    }

    try {
      loading.value = true
      error.value = null
      // Re-initialize the document to fetch latest
      await document.value.init()
      data.value = document.value.get()
    } catch (err) {
      error.value = err as Error
      throw err
    } finally {
      loading.value = false
    }
  }

  // Return refs (VueUse pattern: readonly refs for state, writable methods)
  return {
    data: readonly(data) as Ref<T>,
    loading: readonly(loading),
    error: readonly(error),
    set,
    update,
    deleteField,
    refresh,
    document: document as Ref<SyncDocument<T> | null>
  }
}
