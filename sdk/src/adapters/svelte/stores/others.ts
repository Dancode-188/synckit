/**
 * Svelte store for other users' presence (excluding self)
 * Convenience wrapper around presence store
 */

import { writable } from 'svelte/store';
import type { SyncKit } from '../../../synckit';
import type { OthersStore } from '../types';
import type { AwarenessState } from '../../../awareness';
import { isBrowser } from '../utils/ssr';

/**
 * Create a store for other users' presence (excludes self)
 *
 * Useful when you only want to display other users, not yourself
 *
 * @example Svelte 4
 * ```svelte
 * <script>
 *   const othersStore = others(synckit, 'doc-123')
 * </script>
 *
 * {#each $othersStore as user}
 *   <div>{user.state.name}</div>
 * {/each}
 * ```
 *
 * @example Svelte 5
 * ```svelte
 * <script>
 *   const othersStore = others(synckit, 'doc-123')
 * </script>
 *
 * {#each othersStore.others as user}
 *   <div>{user.state.name}</div>
 * {/each}
 * ```
 *
 * @param synckit - SyncKit instance
 * @param documentId - Document ID
 * @returns Others store
 */
export function others(synckit: SyncKit, documentId: string): OthersStore {
  // Internal state
  let othersArray: AwarenessState[] = [];
  let awarenessInstance: any = null;
  let unsubscribeAwareness: (() => void) | null = null;

  // SSR guard
  if (!isBrowser()) {
    const ssrStore = writable<AwarenessState[]>([]);
    return {
      others: [],
      subscribe: ssrStore.subscribe,
    } as OthersStore;
  }

  // Create store
  const store = writable<AwarenessState[]>(othersArray);

  // Initialize awareness
  const initAwareness = async () => {
    try {
      // Get awareness instance
      awarenessInstance = synckit.getAwareness(documentId);

      // Initialize awareness
      await awarenessInstance.init();

      // Subscribe to awareness changes
      unsubscribeAwareness = awarenessInstance.subscribe(() => {
        // Get updated states
        const states = awarenessInstance.getStates();
        const localClientId = awarenessInstance.getClientId();

        // Filter to only others
        othersArray = (Array.from(states.values()) as AwarenessState[]).filter(
          (s) => s.client_id !== localClientId
        );

        // Update store
        store.set(othersArray);
      });

      // Get initial states
      const states = awarenessInstance.getStates();
      const localClientId = awarenessInstance.getClientId();
      othersArray = (Array.from(states.values()) as AwarenessState[]).filter(
        (s) => s.client_id !== localClientId
      );
      store.set(othersArray);
    } catch (err) {
      console.error('[SyncKit] others: Failed to initialize awareness', err);
    }
  };

  // Auto-initialize
  initAwareness();

  // Custom subscribe with cleanup
  const subscribe = (
    run: (value: AwarenessState[]) => void,
    invalidate?: (value?: AwarenessState[]) => void
  ): (() => void) => {
    const storeUnsubscribe = store.subscribe(run, invalidate);

    return () => {
      storeUnsubscribe();
      if (unsubscribeAwareness) {
        unsubscribeAwareness();
      }
    };
  };

  return {
    // Rune property (Svelte 5)
    get others() {
      return othersArray;
    },

    // Store contract (Svelte 4)
    subscribe,
  } as OthersStore;
}
