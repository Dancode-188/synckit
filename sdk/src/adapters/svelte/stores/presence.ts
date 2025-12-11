/**
 * Svelte store for presence/awareness (self + others)
 * Tracks all connected users including current user
 */

import { writable } from 'svelte/store';
import type { SyncKit } from '../../../synckit';
import type { PresenceStore } from '../types';
import type { AwarenessState } from '../../../awareness';
import { isBrowser } from '../utils/ssr';

/**
 * Create a presence store combining self and others
 *
 * Tracks presence/awareness for all connected clients
 *
 * @example Svelte 4
 * ```svelte
 * <script>
 *   const pres = presence(synckit, 'doc-123', { name: 'Alice', cursor: { x: 0, y: 0 } })
 * </script>
 *
 * <div>
 *   You: {$pres.self?.state.name}
 *   Others: {$pres.others.length}
 * </div>
 * ```
 *
 * @example Svelte 5
 * ```svelte
 * <script>
 *   const pres = presence(synckit, 'doc-123')
 * </script>
 *
 * <div>
 *   You: {pres.self?.state.name}
 *   Others: {pres.others.length}
 * </div>
 * ```
 *
 * @param synckit - SyncKit instance
 * @param documentId - Document ID
 * @param initialState - Initial presence state for current user
 * @returns Presence store
 */
export function presence(
  synckit: SyncKit,
  documentId: string,
  initialState?: Record<string, any>
): PresenceStore {
  // Internal state
  let self: AwarenessState | undefined = undefined;
  let others: AwarenessState[] = [];
  let awarenessInstance: any = null;
  let unsubscribeAwareness: (() => void) | null = null;

  // SSR guard
  if (!isBrowser()) {
    const ssrStore = writable({ self: undefined, others: [] });
    return {
      self: undefined,
      others: [],
      subscribe: ssrStore.subscribe,
      updatePresence: async () => {},
      getPresence: () => undefined,
    } as PresenceStore;
  }

  // Create store
  const store = writable({ self, others });

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

        // Split into self and others
        const newSelf = states.get(localClientId);
        const newOthers = (Array.from(states.values()) as AwarenessState[]).filter(
          (s) => s.client_id !== localClientId
        );

        self = newSelf;
        others = newOthers;

        // Update store
        store.set({ self: newSelf, others: newOthers });
      });

      // Get initial states
      const states = awarenessInstance.getStates();
      const localClientId = awarenessInstance.getClientId();
      const initialSelf = states.get(localClientId);
      const initialOthers = (Array.from(states.values()) as AwarenessState[]).filter(
        (s) => s.client_id !== localClientId
      );

      self = initialSelf;
      others = initialOthers;
      store.set({ self: initialSelf, others: initialOthers });
    } catch (err) {
      console.error('[SyncKit] presence: Failed to initialize awareness', err);
    }
  };

  // Auto-initialize
  initAwareness();

  /**
   * Update local presence state
   *
   * Merges with existing state
   *
   * @param state - Partial state to update
   */
  const updatePresence = async (state: Record<string, any>): Promise<void> => {
    if (!awarenessInstance) {
      throw new Error('[SyncKit] presence: Not initialized');
    }
    await awarenessInstance.setLocalState(state);
  };

  /**
   * Get presence state for specific client
   *
   * @param clientId - Client ID to look up
   * @returns Awareness state or undefined
   */
  const getPresence = (clientId: string): AwarenessState | undefined => {
    if (self && self.client_id === clientId) {
      return self;
    }
    return others.find((s) => s.client_id === clientId);
  };

  // Custom subscribe with cleanup
  const subscribe = (
    run: (value: { self: AwarenessState | undefined; others: AwarenessState[] }) => void,
    invalidate?: (value?: { self: AwarenessState | undefined; others: AwarenessState[] }) => void
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
    // Rune properties (Svelte 5)
    get self() {
      return self;
    },
    get others() {
      return others;
    },

    // Store contract (Svelte 4)
    subscribe,

    // Methods
    updatePresence,
    getPresence,
  } as PresenceStore;
}
