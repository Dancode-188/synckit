/**
 * React hook for undo/redo with cross-tab synchronization
 * @module adapters/react/useUndo
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { UndoManager, type Operation, type UndoManagerOptions, type UndoManagerState } from '../../undo/undo-manager';
import { CrossTabSync } from '../../sync/cross-tab';

/**
 * Options for useUndo hook
 */
export interface UseUndoOptions extends Omit<UndoManagerOptions, 'documentId' | 'crossTabSync'> {
  /**
   * Whether to enable cross-tab synchronization
   * @default true
   */
  enableCrossTab?: boolean;
}

/**
 * Return type for useUndo hook
 */
export interface UseUndoReturn {
  /** Current undo stack (readonly) */
  undoStack: readonly Operation[];
  /** Current redo stack (readonly) */
  redoStack: readonly Operation[];
  /** Whether undo is possible */
  canUndo: boolean;
  /** Whether redo is possible */
  canRedo: boolean;
  /** Undo the last operation */
  undo: () => Operation | null;
  /** Redo the last undone operation */
  redo: () => Operation | null;
  /** Add an operation to the undo stack */
  add: (operation: Operation) => void;
  /** Clear all undo/redo history */
  clear: () => void;
}

/**
 * React hook for undo/redo functionality with cross-tab synchronization
 *
 * @param documentId - Document ID to sync undo/redo across tabs
 * @param options - Configuration options
 * @returns Undo/redo state and methods
 *
 * @example Basic usage
 * ```tsx
 * import { useUndo } from '@synckit-js/sdk/react'
 *
 * function Editor() {
 *   const { canUndo, canRedo, undo, redo, add } = useUndo('doc-123')
 *
 *   const handleInsert = (text: string) => {
 *     add({ type: 'insert', data: text })
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={undo} disabled={!canUndo}>Undo</button>
 *       <button onClick={redo} disabled={!canRedo}>Redo</button>
 *     </div>
 *   )
 * }
 * ```
 *
 * @example With custom merge strategy
 * ```tsx
 * const { add } = useUndo('doc-123', {
 *   mergeWindow: 2000, // 2 second merge window
 *   canMerge: (prev, next) => {
 *     return prev.type === next.type && prev.userId === next.userId
 *   },
 *   merge: (prev, next) => ({
 *     ...prev,
 *     data: prev.data + next.data
 *   })
 * })
 * ```
 */
export function useUndo(
  documentId: string,
  options: UseUndoOptions = {}
): UseUndoReturn {
  const {
    enableCrossTab = true,
    ...undoOptions
  } = options;

  // State
  const [state, setState] = useState<UndoManagerState>({
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
  });

  // Refs to hold manager and crossTabSync instances
  const managerRef = useRef<UndoManager | null>(null);
  const crossTabSyncRef = useRef<CrossTabSync | null>(null);

  // Initialize manager
  useEffect(() => {
    // Create CrossTabSync instance
    const crossTabSync = new CrossTabSync(documentId, { enabled: enableCrossTab });
    if (enableCrossTab) {
      crossTabSync.enable();
    }
    crossTabSyncRef.current = crossTabSync;

    // Create UndoManager instance
    const manager = new UndoManager({
      documentId,
      crossTabSync,
      ...undoOptions,
      onStateChanged: (newState) => {
        setState(newState);

        // Call user's onStateChanged if provided
        if (undoOptions.onStateChanged) {
          undoOptions.onStateChanged(newState);
        }
      },
    });

    managerRef.current = manager;

    // Initialize the manager
    manager.init().catch((err) => {
      console.error('[SyncKit] useUndo: Failed to initialize', err);
    });

    // Cleanup on unmount or when documentId changes
    return () => {
      manager.destroy();
      crossTabSync.destroy();
      managerRef.current = null;
      crossTabSyncRef.current = null;
    };
  }, [documentId, enableCrossTab]);

  // Memoized methods
  const undo = useCallback((): Operation | null => {
    if (!managerRef.current) {
      console.warn('[SyncKit] useUndo: Manager not initialized');
      return null;
    }
    return managerRef.current.undo();
  }, []);

  const redo = useCallback((): Operation | null => {
    if (!managerRef.current) {
      console.warn('[SyncKit] useUndo: Manager not initialized');
      return null;
    }
    return managerRef.current.redo();
  }, []);

  const add = useCallback((operation: Operation): void => {
    if (!managerRef.current) {
      console.warn('[SyncKit] useUndo: Manager not initialized');
      return;
    }
    managerRef.current.add(operation);
  }, []);

  const clear = useCallback((): void => {
    if (!managerRef.current) {
      console.warn('[SyncKit] useUndo: Manager not initialized');
      return;
    }
    managerRef.current.clear();
  }, []);

  return {
    undoStack: state.undoStack,
    redoStack: state.redoStack,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    undo,
    redo,
    add,
    clear,
  };
}
