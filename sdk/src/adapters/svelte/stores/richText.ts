/**
 * Svelte store for rich text with Peritext CRDT formatting
 * Supports both Svelte 4 ($ prefix) and Svelte 5 (rune properties)
 */

import { writable } from 'svelte/store';
import type { SyncKit } from '../../../synckit';
import type { RichTextStore, SyncOptions } from '../types';
import { isBrowser } from '../utils/ssr';

/**
 * Create a rich text store with Peritext formatting
 *
 * Supports collaborative rich text editing with character-level formatting
 *
 * @example Svelte 4
 * ```svelte
 * <script>
 *   const rich = richText(synckit, 'doc-123', 'content')
 *
 *   async function makeBold() {
 *     await rich.format(0, 5, { bold: true })
 *   }
 * </script>
 *
 * <div>{$rich}</div>
 * <button on:click={makeBold}>Make Bold</button>
 * ```
 *
 * @example Svelte 5
 * ```svelte
 * <script>
 *   const rich = richText(synckit, 'doc-123', 'content')
 * </script>
 *
 * <div>{rich.text}</div>
 * ```
 *
 * @param synckit - SyncKit instance
 * @param documentId - Document ID
 * @param fieldName - Field name for rich text content
 * @param options - Sync options
 * @returns Rich text store
 */
export function richText(
  synckit: SyncKit,
  documentId: string,
  fieldName: string = 'content',
  options: SyncOptions = {}
): RichTextStore {
  // Internal state
  let text = '';
  let loading = true;
  let error: Error | null = null;
  let richTextCRDT: any = null;
  let unsubscribeText: (() => void) | null = null;

  // SSR guard
  if (!isBrowser()) {
    const ssrStore = writable('');
    return {
      text: '',
      loading: false,
      error: null,
      subscribe: ssrStore.subscribe,
      format: async () => {},
      unformat: async () => {},
      getFormats: () => ({}),
      insert: async () => {},
      delete: async () => {},
    } as RichTextStore;
  }

  // Get document
  const doc = synckit.document(documentId);

  // Create store
  const store = writable(text);

  // Initialize document and rich text field
  const initializeRichText = async () => {
    try {
      loading = true;
      error = null;

      // Initialize document
      await doc.init();

      // Get rich text field
      richTextCRDT = (doc as any).getField?.(fieldName) || (doc as any)[fieldName];

      if (!richTextCRDT) {
        throw new Error(`RichText field "${fieldName}" not found`);
      }

      // Subscribe to text changes
      unsubscribeText = richTextCRDT.subscribe?.((newText: string) => {
        text = newText;
        loading = false;
        error = null;
        store.set(newText);
      });

      // Get initial text
      text = richTextCRDT.get?.() || richTextCRDT.toString?.() || '';
      loading = false;
      store.set(text);
    } catch (err) {
      error = err as Error;
      loading = false;
      console.error('[SyncKit] richText: Failed to initialize', err);
    }
  };

  // Auto-initialize
  if (options.autoInit !== false) {
    initializeRichText();
  }

  /**
   * Format text range with attributes
   *
   * @param start - Start position (0-indexed)
   * @param end - End position (exclusive)
   * @param attributes - Formatting attributes (e.g., { bold: true, color: 'red' })
   */
  const format = async (
    start: number,
    end: number,
    attributes: Record<string, any>
  ): Promise<void> => {
    if (!richTextCRDT) {
      throw new Error('[SyncKit] richText: Not initialized');
    }

    try {
      await richTextCRDT.format(start, end, attributes);
      error = null;
    } catch (err) {
      error = err as Error;
      throw err;
    }
  };

  /**
   * Remove formatting from text range
   *
   * @param start - Start position (0-indexed)
   * @param end - End position (exclusive)
   * @param attributes - Attribute keys to remove (e.g., ['bold', 'italic'])
   */
  const unformat = async (start: number, end: number, attributes: string[]): Promise<void> => {
    if (!richTextCRDT) {
      throw new Error('[SyncKit] richText: Not initialized');
    }

    try {
      await richTextCRDT.unformat(start, end, attributes);
      error = null;
    } catch (err) {
      error = err as Error;
      throw err;
    }
  };

  /**
   * Get formatting attributes at position
   *
   * @param position - Character position (0-indexed)
   * @returns Formatting attributes at position
   */
  const getFormats = (position: number): Record<string, any> => {
    if (!richTextCRDT) {
      return {};
    }
    return richTextCRDT.getFormats?.(position) || {};
  };

  /**
   * Insert text at position
   *
   * @param position - Character position (0-indexed)
   * @param insertText - Text to insert
   */
  const insert = async (position: number, insertText: string): Promise<void> => {
    if (!richTextCRDT) {
      throw new Error('[SyncKit] richText: Not initialized');
    }

    try {
      await richTextCRDT.insert(position, insertText);
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
   * @param end - End position (exclusive)
   */
  const deleteText = async (start: number, end: number): Promise<void> => {
    if (!richTextCRDT) {
      throw new Error('[SyncKit] richText: Not initialized');
    }

    try {
      await richTextCRDT.delete(start, end);
      error = null;
    } catch (err) {
      error = err as Error;
      throw err;
    }
  };

  // Custom subscribe with cleanup
  const subscribe = (
    run: (value: string) => void,
    invalidate?: (value?: string) => void
  ): (() => void) => {
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
    format,
    unformat,
    getFormats,
    insert,
    delete: deleteText,
  } as RichTextStore;
}
