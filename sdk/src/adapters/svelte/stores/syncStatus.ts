/**
 * Svelte store for monitoring sync status and connectivity
 * Supports both Svelte 4 ($ prefix) and Svelte 5 (rune properties)
 */

import { writable } from 'svelte/store';
import type { SyncKit } from '../../../synckit';
import type { SyncStatusStore, SyncStatusState } from '../types';
import { isBrowser, browserOnly } from '../utils/ssr';

/**
 * Create a sync status store for monitoring connection and sync state
 *
 * Tracks online/offline status, syncing state, last sync time, and errors
 *
 * @example Svelte 4
 * ```svelte
 * <script>
 *   const status = syncStatus(synckit, 'doc-123')
 * </script>
 *
 * <div>
 *   {#if $status.online}
 *     Online {#if $status.syncing}(Syncing...){/if}
 *   {:else}
 *     Offline
 *   {/if}
 * </div>
 * ```
 *
 * @example Svelte 5
 * ```svelte
 * <script>
 *   const status = syncStatus(synckit, 'doc-123')
 * </script>
 *
 * <div>
 *   {#if status.online}
 *     Online {#if status.syncing}(Syncing...){/if}
 *   {:else}
 *     Offline
 *   {/if}
 * </div>
 * ```
 *
 * @param synckit - SyncKit instance
 * @param documentId - Document ID
 * @returns Sync status store
 */
export function syncStatus(synckit: SyncKit, _documentId: string): SyncStatusStore {
  // Internal state
  let online = browserOnly(() => navigator.onLine, true);
  let syncing = false;
  let lastSync: Date | null = null;
  let errors: Error[] = [];

  // SSR guard
  if (!isBrowser()) {
    const ssrState: SyncStatusState = {
      online: true,
      syncing: false,
      lastSync: null,
      errors: [],
    };
    const ssrStore = writable(ssrState);
    return {
      online: true,
      syncing: false,
      lastSync: null,
      errors: [],
      subscribe: ssrStore.subscribe,
      retry: async () => {},
    } as SyncStatusStore;
  }

  // Create store
  const store = writable<SyncStatusState>({
    online,
    syncing,
    lastSync,
    errors,
  });

  // Update store helper
  const updateStore = () => {
    store.set({ online, syncing, lastSync, errors });
  };

  // Monitor network status
  const updateNetworkStatus = () => {
    const networkStatus = synckit.getNetworkStatus();
    if (networkStatus) {
      online = networkStatus.connectionState === 'connected';
      updateStore();
    }
  };

  // Subscribe to network status changes
  const unsubscribeNetwork = synckit.onNetworkStatusChange((networkStatus) => {
    if (networkStatus) {
      online = networkStatus.connectionState === 'connected';
      updateStore();
    }
  });

  // Initialize network status
  updateNetworkStatus();

  // Listen to online/offline events as fallback
  const handleOnline = () => {
    online = true;
    updateStore();
  };

  const handleOffline = () => {
    online = false;
    updateStore();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  /**
   * Retry failed sync (placeholder - actual sync logic depends on document)
   */
  const retry = async (): Promise<void> => {
    errors = [];
    updateStore();
    // In a real implementation, this would trigger document sync
    // For now, just clear errors
  };

  // Custom subscribe with cleanup
  const subscribe = (
    run: (value: SyncStatusState) => void,
    invalidate?: (value?: SyncStatusState) => void
  ): (() => void) => {
    const storeUnsubscribe = store.subscribe(run, invalidate);

    return () => {
      storeUnsubscribe();
      if (unsubscribeNetwork) {
        unsubscribeNetwork();
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  };

  return {
    // Rune properties (Svelte 5)
    get online() {
      return online;
    },
    get syncing() {
      return syncing;
    },
    get lastSync() {
      return lastSync;
    },
    get errors() {
      return errors;
    },

    // Store contract (Svelte 4)
    subscribe,

    // Methods
    retry,
  } as SyncStatusStore;
}
