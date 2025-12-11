/**
 * SyncKit provider/inject composable
 * Implements Vue's provide/inject pattern for SyncKit instance
 * @module adapters/vue/composables/useSyncKit
 */

import { inject, provide, type InjectionKey } from 'vue'
import type { SyncKit } from '../../../synckit'

/**
 * Injection key for SyncKit instance
 * Using Symbol ensures no conflicts with other providers
 */
export const SyncKitSymbol: InjectionKey<SyncKit> = Symbol('synckit')

/**
 * Provide a SyncKit instance to child components
 * Should be called in a parent component's setup()
 *
 * @example
 * ```vue
 * <script setup>
 * import { provideSyncKit } from '@synckit-js/sdk/vue'
 * import { createSyncKit } from '@synckit-js/sdk'
 *
 * const synckit = await createSyncKit({ serverUrl: 'ws://localhost:8080' })
 * provideSyncKit(synckit)
 * </script>
 * ```
 */
export function provideSyncKit(synckit: SyncKit): void {
  provide(SyncKitSymbol, synckit)
}

/**
 * Get the SyncKit instance from context
 * Must be called within a component that has a parent with provideSyncKit()
 *
 * @throws {Error} If no SyncKit instance is provided
 *
 * @example
 * ```vue
 * <script setup>
 * import { useSyncKit, useSyncDocument } from '@synckit-js/sdk/vue'
 *
 * const synckit = useSyncKit()
 * const { data } = useSyncDocument('doc-123')
 * </script>
 * ```
 */
export function useSyncKit(): SyncKit {
  const synckit = inject(SyncKitSymbol)

  if (!synckit) {
    throw new Error(
      '[SyncKit] useSyncKit: No SyncKit instance found. ' +
        'Make sure to call provideSyncKit() in a parent component.'
    )
  }

  return synckit
}

/**
 * Try to get the SyncKit instance from context
 * Returns null if not provided (useful for optional usage)
 *
 * @example
 * ```ts
 * const synckit = tryUseSyncKit()
 * if (synckit) {
 *   // Use synckit
 * }
 * ```
 */
export function tryUseSyncKit(): SyncKit | null {
  return inject(SyncKitSymbol, null)
}
