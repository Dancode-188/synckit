/**
 * useOthers composable
 * Track other users' presence (excluding self)
 * @module adapters/vue/composables/useOthers
 */

import { type Ref } from 'vue'
import { usePresence } from './usePresence'
import type { MaybeRefOrGetter } from '../types'
import type { AwarenessState } from '../../../awareness'

/**
 * Track other users' presence states
 * Convenience wrapper around usePresence that only returns others
 *
 * @param documentId - Document ID to track presence for
 * @returns Reactive array of other users' states
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useOthers } from '@synckit-js/sdk/vue'
 *
 * const others = useOthers('doc-123')
 * </script>
 *
 * <template>
 *   <div class="users-online">
 *     <div v-for="user in others" :key="user.client_id">
 *       <img :src="user.state.avatar" />
 *       <span>{{ user.state.name }}</span>
 *     </div>
 *   </div>
 * </template>
 * ```
 */
export function useOthers(
  documentId: MaybeRefOrGetter<string>
): Ref<AwarenessState[]> {
  const { others } = usePresence(documentId)
  return others
}
