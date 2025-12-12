/**
 * Svelte store for undo/redo with cross-tab synchronization
 * Supports both Svelte 4 ($ prefix) and Svelte 5 (rune properties)
 */

import { writable } from 'svelte/store';
import { UndoManager, type Operation, type UndoManagerOptions } from '../../../undo/undo-manager';
import { CrossTabSync } from '../../../sync/cross-tab';
import { isBrowser } from '../utils/ssr';

/**
 * Options for undo store
 */
export interface UndoOptions extends Omit<UndoManagerOptions, 'documentId' | 'crossTabSync'> {
  /**
   * Whether to enable cross-tab synchronization
   * @default true
   */
  enableCrossTab?: boolean;
}

/**
 * Undo store state
 */
export interface UndoState {
  undoStack: readonly Operation[];
  redoStack: readonly Operation[];
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Undo store interface
 * Hybrid store supporting both Svelte 4 and Svelte 5
 */
export interface UndoStore {
  // Rune properties (Svelte 5)
  readonly undoStack: readonly Operation[];
  readonly redoStack: readonly Operation[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;

  // Store contract (Svelte 4)
  subscribe: (run: (value: UndoState) => void) => () => void;

  // Methods
  undo: () => Operation | null;
  redo: () => Operation | null;
  add: (operation: Operation) => void;
  clear: () => void;
}

/**
 * Create an undo/redo store with cross-tab synchronization
 *
 * Works with both Svelte 4 and Svelte 5:
 * - Svelte 4: Use `$undo` in templates for auto-subscription
 * - Svelte 5: Use `undo.canUndo`, `undo.canRedo` for rune access
 *
 * @example Svelte 4
 * ```svelte
 * <script>
 *   import { undo } from '@synckit-js/sdk/svelte'
 *
 *   const undoStore = undo('doc-123')
 * </script>
 *
 * <button on:click={undoStore.undo} disabled={!$undoStore.canUndo}>
 *   Undo
 * </button>
 * <button on:click={undoStore.redo} disabled={!$undoStore.canRedo}>
 *   Redo
 * </button>
 * ```
 *
 * @example Svelte 5
 * ```svelte
 * <script>
 *   import { undo } from '@synckit-js/sdk/svelte'
 *
 *   const undoStore = undo('doc-123')
 * </script>
 *
 * <button onclick={undoStore.undo} disabled={!undoStore.canUndo}>
 *   Undo
 * </button>
 * <button onclick={undoStore.redo} disabled={!undoStore.canRedo}>
 *   Redo
 * </button>
 * ```
 *
 * @param documentId - Document ID to sync undo/redo across tabs
 * @param options - Configuration options
 * @returns Hybrid store with both store contract and rune properties
 */
export function undo(
  documentId: string,
  options: UndoOptions = {}
): UndoStore {
  const {
    enableCrossTab = true,
    ...undoOptions
  } = options;

  // Internal state (reactive for Svelte 5 runes)
  let undoStack: readonly Operation[] = [];
  let redoStack: readonly Operation[] = [];
  let canUndo = false;
  let canRedo = false;

  // Only initialize in browser environment
  if (!isBrowser()) {
    // SSR: return placeholder store
    const ssrStore = writable<UndoState>({
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
    });

    return {
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      subscribe: ssrStore.subscribe,
      undo: () => null,
      redo: () => null,
      add: () => {},
      clear: () => {},
    };
  }

  // Create writable store for Svelte 4 compatibility
  const store = writable<UndoState>({
    undoStack,
    redoStack,
    canUndo,
    canRedo,
  });

  // Create CrossTabSync instance
  const crossTabSync = new CrossTabSync(documentId, { enabled: enableCrossTab });
  if (enableCrossTab) {
    crossTabSync.enable();
  }

  // Create UndoManager instance
  const manager = new UndoManager({
    documentId,
    crossTabSync,
    ...undoOptions,
    onStateChanged: (state) => {
      undoStack = state.undoStack;
      redoStack = state.redoStack;
      canUndo = state.canUndo;
      canRedo = state.canRedo;

      store.set({
        undoStack,
        redoStack,
        canUndo,
        canRedo,
      });

      // Call user's onStateChanged if provided
      if (undoOptions.onStateChanged) {
        undoOptions.onStateChanged(state);
      }
    },
  });

  // Initialize the manager
  manager.init().catch((err) => {
    console.error('[SyncKit] undo store: Failed to initialize', err);
  });

  /**
   * Undo the last operation
   */
  const undoOperation = (): Operation | null => {
    return manager.undo();
  };

  /**
   * Redo the last undone operation
   */
  const redoOperation = (): Operation | null => {
    return manager.redo();
  };

  /**
   * Add an operation to the undo stack
   */
  const add = (operation: Operation): void => {
    manager.add(operation);
  };

  /**
   * Clear all undo/redo history
   */
  const clear = (): void => {
    manager.clear();
  };

  // Create custom subscribe with cleanup
  const subscribe = (run: (value: UndoState) => void): (() => void) => {
    // Subscribe to the store
    const storeUnsubscribe = store.subscribe(run);

    // Return cleanup function
    return () => {
      storeUnsubscribe();
      manager.destroy();
      crossTabSync.destroy();
    };
  };

  // Return hybrid store (works with $ prefix AND rune access)
  return {
    // Rune properties (Svelte 5) - use getters for reactivity
    get undoStack() {
      return undoStack;
    },
    get redoStack() {
      return redoStack;
    },
    get canUndo() {
      return canUndo;
    },
    get canRedo() {
      return canRedo;
    },

    // Store contract (Svelte 4)
    subscribe,

    // Methods
    undo: undoOperation,
    redo: redoOperation,
    add,
    clear,
  };
}
