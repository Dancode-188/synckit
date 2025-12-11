/**
 * Svelte store for current user's presence (self only)
 * Convenience wrapper around presence store
 */

import { writable } from 'svelte/store';
import type { SyncKit } from '../../../synckit';
import type { SelfStore } from '../types';
import type { AwarenessState } from '../../../awareness';
import { isBrowser } from '../utils/ssr';

/**
 * Create a store for current user's presence (self only)
 *
 * Useful when you only want to manage/display your own state
 *
 * @example Svelte 4
 * ```svelte
 * <script>
 *   const selfStore = self(synckit, 'doc-123')
 *
 *   function updateName(name) {
 *     selfStore.update({ name })
 *   }
 * </script>
 *
 * <div>
 *   Your name: {$selfStore?.state.name}
 * </div>
 * ```
 *
 * @example Svelte 5
 * ```svelte
 * <script>
 *   const selfStore = self(synckit, 'doc-123')
 * </script>
 *
 * <div>
 *   Your name: {selfStore.self?.state.name}
 * </div>
 * ```
 *
 * @param synckit - SyncKit instance
 * @param documentId - Document ID
 * @param initialState - Initial state for current user
 * @returns Self store
 */
export function self(
  synckit: SyncKit,
  documentId: string,
  initialState?: Record<string, any>
): SelfStore {
  // Internal state
  let selfState: AwarenessState | undefined = undefined;
  let awarenessInstance: any = null;
  let unsubscribeAwareness: (() => void) | null = null;

  // SSR guard
  if (!isBrowser()) {
    const ssrStore = writable<AwarenessState | undefined>(undefined);
    return {
      self: undefined,
      subscribe: ssrStore.subscribe,
      update: async () => {},
    } as SelfStore;
  }

  // Create store
  const store = writable<AwarenessState | undefined>(selfState);

  // Initialize awareness
  const initAwareness = async () => {
    try {
      // Get awareness instance
      awarenessInstance = synckit.getAwareness(documentId);

      // Initialize awareness
      await awarenessInstance.init();

      // Set initial state if provided
      if (initialState) {
        await awarenessInstance.setLocalState(initialState);
      }

      // Subscribe to awareness changes
      unsubscribeAwareness = awarenessInstance.subscribe(() => {
        // Get updated states
        const states = awarenessInstance.getStates();
        const localClientId = awarenessInstance.getClientId();

        // Find self
        selfState = states.get(localClientId);

        // Update store
        store.set(selfState);
      });

      // Get initial state
      const states = awarenessInstance.getStates();
      const localClientId = awarenessInstance.getClientId();
      selfState = states.get(localClientId);
      store.set(selfState);
    } catch (err) {
      console.error('[SyncKit] self: Failed to initialize awareness', err);
    }
  };

  // Auto-initialize
  initAwareness();

  /**
   * Update self state
   *
   * Merges with existing state
   *
   * @param state - Partial state to update
   */
  const update = async (state: Record<string, any>): Promise<void> => {
    if (!awarenessInstance) {
      throw new Error('[SyncKit] self: Not initialized');
    }
    await awarenessInstance.setLocalState(state);
  };

  // Custom subscribe with cleanup
  const subscribe = (
    run: (value: AwarenessState | undefined) => void,
    invalidate?: (value?: AwarenessState | undefined) => void
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
    get self() {
      return selfState;
    },

    // Store contract (Svelte 4)
    subscribe,

    // Methods
    update,
  } as SelfStore;
}
