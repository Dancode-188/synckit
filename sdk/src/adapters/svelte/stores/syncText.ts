/**
 * Svelte store for syncing text data with CRDT
 * Supports both Svelte 4 ($ prefix) and Svelte 5 (rune properties)
 */

import { writable } from 'svelte/store';
import type { SyncKit } from '../../../synckit';
import type { SyncTextStore, SyncOptions } from '../types';
import { isBrowser } from '../utils/ssr';

/**
 * Create a synced text store with CRDT
 *
 * Uses Fugue CRDT for conflict-free collaborative text editing
 *
 * @example Svelte 4
 * ```svelte
 * <script>
 *   const text = syncText(synckit, 'doc-123', 'content')
 *
 *   async function handleInput(e) {
 *     await text.insert(0, e.target.value)
 *   }
 * </script>
 *
 * <textarea value={$text} on:input={handleInput} />
 * ```
 *
 * @example Svelte 5
 * ```svelte
 * <script>
 *   const text = syncText(synckit, 'doc-123', 'content')
 * </script>
 *
 * <textarea value={text.text} on:input={...} />
 * ```
 *
 * @param synckit - SyncKit instance
 * @param documentId - Document ID
 * @param fieldName - Field name for text content
 * @param options - Sync options
 * @returns Hybrid text store
 */
export function syncText(
  synckit: SyncKit,
  documentId: string,
  fieldName: string = 'text',
  options: SyncOptions = {}
): SyncTextStore {
  // Internal state
  let text = '';
  let loading = true;
  let error: Error | null = null;
  let textCRDT: any = null;
  let unsubscribeText: (() => void) | null = null;

  // SSR guard
  if (!isBrowser()) {
    const ssrStore = writable('');
    return {
      text: '',
      loading: false,
      error: null,
      subscribe: ssrStore.subscribe,
      insert: async () => {},
      delete: async () => {},
      length: () => 0,
    } as SyncTextStore;
  }

  // Get document
  const doc = synckit.document(documentId);

  // Create store
  const store = writable(text);

  // Initialize document and text field
  const initializeText = async () => {
    try {
      loading = true;
      error = null;

      // Initialize document
      await doc.init();

      // Get text field (assuming it's accessed as a property)
      // In a real implementation, this would be properly typed
      textCRDT = (doc as any).getField?.(fieldName) || (doc as any)[fieldName];

      if (!textCRDT) {
        throw new Error(`Text field "${fieldName}" not found`);
      }

      // Subscribe to text changes
      unsubscribeText = textCRDT.subscribe?.((newText: string) => {
        text = newText;
        loading = false;
        error = null;
        store.set(newText);
      });

      // Get initial text
      text = textCRDT.get?.() || textCRDT.toString?.() || '';
      loading = false;
      store.set(text);
    } catch (err) {
      error = err as Error;
      loading = false;
      console.error('[SyncKit] syncText: Failed to initialize', err);
    }
  };

  // Auto-initialize
  if (options.autoInit !== false) {
    initializeText();
  }

  /**
   * Insert text at position
   *
   * @param position - Character position (0-indexed)
   * @param insertText - Text to insert
   */
  const insert = async (position: number, insertText: string): Promise<void> => {
    if (!textCRDT) {
      throw new Error('[SyncKit] syncText: Not initialized');
    }

    try {
      await textCRDT.insert(position, insertText);
      error = null;
    } catch (err) {
      error = err as Error;
      throw err;
    }
  };

  /**
   * Delete text range
   *
   * @param start - Start position (0-indexed)
   * @param length - Number of characters to delete
   */
  const deleteText = async (start: number, length: number): Promise<void> => {
    if (!textCRDT) {
      throw new Error('[SyncKit] syncText: Not initialized');
    }

    try {
      await textCRDT.delete(start, length);
      error = null;
    } catch (err) {
      error = err as Error;
      throw err;
    }
  };

  /**
   * Get text length in characters
   */
  const length = (): number => {
    if (!textCRDT) {
      return 0;
    }
    return textCRDT.length?.() || text.length;
  };

  // Custom subscribe with cleanup
  const subscribe = (run: (value: string) => void, invalidate?: (value?: string) => void): (() => void) => {
    const storeUnsubscribe = store.subscribe(run, invalidate);

    return () => {
      storeUnsubscribe();
      if (unsubscribeText) {
        unsubscribeText();
      }
    };
  };

  return {
    // Rune properties (Svelte 5)
    get text() {
      return text;
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
    insert,
    delete: deleteText,
    length,
  } as SyncTextStore;
}
