/**
 * Vue 3 Adapter for SyncKit
 * Following VueUse patterns for best DX
 *
 * @module adapters/vue
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { provideSyncKit, useSyncDocument } from '@synckit-js/sdk/vue'
 * import { createSyncKit } from '@synckit-js/sdk'
 *
 * // In parent component
 * const synckit = await createSyncKit({ serverUrl: 'ws://localhost:8080' })
 * provideSyncKit(synckit)
 *
 * // In any child component
 * interface Todo {
 *   id: string
 *   text: string
 *   completed: boolean
 * }
 *
 * const { data: todos, update, loading } = useSyncDocument<Todo[]>('todos-123')
 * </script>
 * ```
 */

// Core composables
export { provideSyncKit, useSyncKit, tryUseSyncKit } from './composables/useSyncKit'
export { useSyncDocument } from './composables/useSyncDocument'
export { useSyncField } from './composables/useSyncField'
export { useNetworkStatus } from './composables/useNetworkStatus'

// Types
export type {
  MaybeRefOrGetter,
  UseSyncDocumentOptions,
  UseSyncDocumentReturn,
  UseSyncFieldOptions,
  UseSyncFieldReturn,
  UseNetworkStatusOptions,
  UseNetworkStatusReturn,
  UseSyncStatusOptions,
  UseSyncStatusReturn
} from './types'

// Utilities (advanced users)
export { toValue } from './utils/refs'
export { useCleanup, tryOnScopeDispose } from './utils/lifecycle'
export { isSSR, isBrowser } from './utils/ssr'
