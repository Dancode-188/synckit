/**
 * useNetworkStatus composable
 * Monitor network connection status
 * @module adapters/vue/composables/useNetworkStatus
 */

import { ref, readonly, computed, onMounted } from 'vue'
import { useSyncKit } from './useSyncKit'
import { useCleanup } from '../utils/lifecycle'
import type { UseNetworkStatusOptions, UseNetworkStatusReturn } from '../types'
import type { NetworkStatus } from '../../../types'

/**
 * Monitor network status and connection state
 * Returns null if network layer is not initialized (offline-only mode)
 *
 * @param options - Configuration options
 * @returns Reactive network status
 *
 * @example
 * ```vue
 * <script setup>
 * import { useNetworkStatus } from '@synckit-js/sdk/vue'
 *
 * const { status, connected, peerCount } = useNetworkStatus()
 * </script>
 *
 * <template>
 *   <div class="status-bar">
 *     <span v-if="!status">Offline mode</span>
 *     <span v-else-if="connected">
 *       Connected ({{ peerCount }} peers)
 *     </span>
 *     <span v-else>
 *       Disconnected
 *     </span>
 *   </div>
 * </template>
 * ```
 */
export function useNetworkStatus(
  options: UseNetworkStatusOptions = {}
): UseNetworkStatusReturn {
  const { pollInterval } = options

  const synckit = useSyncKit()
  const status = ref<NetworkStatus | null>(null)

  // Initialize status
  const updateStatus = () => {
    status.value = synckit.getNetworkStatus()
  }

  onMounted(() => {
    // Set initial status
    updateStatus()

    // Subscribe to status changes
    const unsubscribe = synckit.onNetworkStatusChange((newStatus) => {
      status.value = newStatus
    })

    // Setup polling if requested
    let pollTimer: ReturnType<typeof setInterval> | null = null
    if (pollInterval && pollInterval > 0) {
      pollTimer = setInterval(updateStatus, pollInterval)
    }

    // Cleanup
    useCleanup(() => {
      if (unsubscribe) {
        unsubscribe()
      }
      if (pollTimer) {
        clearInterval(pollTimer)
      }
    })
  })

  // Computed properties for convenience
  const connected = computed(() => status.value?.connectionState === 'connected')
  const peerCount = computed(() => 0) // Peer count not available in current NetworkStatus type

  return {
    status: readonly(status),
    connected: readonly(connected),
    peerCount: readonly(peerCount),
    refresh: updateStatus
  }
}
