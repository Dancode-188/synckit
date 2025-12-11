/**
 * Svelte store for syncing document data
 * Supports both Svelte 4 ($ prefix) and Svelte 5 (rune properties)
 */

import { writable } from 'svelte/store';
import type { SyncKit } from '../../../synckit';
import type { SyncDocumentStore, SyncOptions } from '../types';
import { isBrowser } from '../utils/ssr';

/**
 * Create a synced document store
 *
 * Works with both Svelte 4 and Svelte 5:
 * - Svelte 4: Use `$doc` in templates for auto-subscription
 * - Svelte 5: Use `doc.data`, `doc.loading`, `doc.error` for rune access
 *
 * @example Svelte 4
 * ```svelte
 * <script>
 *   const doc = syncDocument(synckit, 'doc-123')
 * </script>
 *
 * {#if $doc}
 *   <div>{$doc.title}</div>
 * {/if}
 * ```
 *
 * @example Svelte 5
 * ```svelte
 * <script>
 *   const doc = syncDocument(synckit, 'doc-123')
 * </script>
 *
 * {#if doc.data}
 *   <div>{doc.data.title}</div>
 * {/if}
 * ```
 *
 * @param synckit - SyncKit instance
 * @param id - Document ID
 * @param options - Sync options
 * @returns Hybrid store with both store contract and rune properties
 */
export function syncDocument<T extends Record<string, unknown> = Record<string, unknown>>(
  synckit: SyncKit,
  id: string,
  options: SyncOptions = {}
): SyncDocumentStore<T> {
  // Internal state (reactive for Svelte 5 runes)
  let data: T | undefined = undefined;
  let loading = true;
  let error: Error | null = null;

  // Only initialize in browser environment
  if (!isBrowser()) {
    // SSR: return placeholder store
    const ssrStore = writable<T>(undefined as any);
    return {
      data: undefined,
      loading: false,
      error: null,
      subscribe: ssrStore.subscribe,
      update: () => {},
      refresh: async () => {},
    } as SyncDocumentStore<T>;
  }

  // Get document from SDK
  const doc = synckit.document<T>(id);

  // Create writable store for Svelte 4 compatibility
  const store = writable<T>(data as unknown as T);

  // Setup subscription to document changes
  const unsubscribe = doc.subscribe((newData) => {
    data = newData;
    loading = false;
    error = null;
    store.set(newData);
  });

  // Auto-initialize if enabled (default: true)
  if (options.autoInit !== false) {
    doc
      .init()
      .then(() => {
        // Get initial data after init
        data = doc.get();
        loading = false;
        store.set(data);
      })
      .catch((err) => {
        error = err;
        loading = false;
      });
  } else {
    // If not auto-initializing, get current data
    data = doc.get();
    loading = false;
    store.set(data);
  }

  /**
   * Update document data
   *
   * @param updater - Function that receives current data and mutates it
   */
  const update = (updater: (data: T) => void) => {
    if (data) {
      const updates: Partial<T> = {};
      updater(updates as T);
      // Use document's update method
      doc.update(updates);
      store.set(data);
    }
  };

  /**
   * Refresh document from server
   */
  const refresh = async (): Promise<void> => {
    loading = true;
    store.set(data as T);

    try {
      // Re-initialize to fetch latest data
      await doc.init();
      data = doc.get();
      error = null;
    } catch (err: any) {
      error = err as Error;
      throw err;
    } finally {
      loading = false;
      store.set(data as T);
    }
  };

  // Create custom readable with cleanup
  const subscribe = (run: (value: T) => void, invalidate?: (value?: T) => void): (() => void) => {
    // Subscribe to the store
    const storeUnsubscribe = store.subscribe(run, invalidate);

    // Return cleanup function that also unsubscribes from document
    return () => {
      storeUnsubscribe();
      unsubscribe();
    };
  };

  // Return hybrid store (works with $ prefix AND rune access)
  return {
    // Rune properties (Svelte 5) - use getters for reactivity
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },

    // Store contract (Svelte 4)
    subscribe,

    // Methods
    update,
    refresh,
  } as SyncDocumentStore<T>;
}
