import { StorageCoordinator } from '../storage/storage-coordinator';
import { CrossTabSync } from '../sync/cross-tab';

/**
 * Represents an operation that can be undone/redone
 */
export interface Operation {
  type: string;
  data?: any;
  timestamp?: number;
  userId?: string;
}

/**
 * Configuration options for UndoManager
 */
export interface UndoManagerOptions {
  documentId: string;
  crossTabSync: CrossTabSync;
  maxUndoSize?: number;
  onStateChanged?: (state: UndoManagerState) => void;
}

/**
 * Current state of the undo manager
 */
export interface UndoManagerState {
  undoStack: Operation[];
  redoStack: Operation[];
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Core undo/redo manager with cross-tab coordination and persistence
 */
export class UndoManager {
  private undoStack: Operation[] = [];
  private redoStack: Operation[] = [];
  private maxUndoSize: number;
  private storageCoordinator: StorageCoordinator;
  private onStateChanged?: (state: UndoManagerState) => void;

  constructor(options: UndoManagerOptions) {
    this.maxUndoSize = options.maxUndoSize ?? 100;
    this.onStateChanged = options.onStateChanged;

    // Initialize storage coordinator
    this.storageCoordinator = new StorageCoordinator({
      documentId: options.documentId,
      crossTabSync: options.crossTabSync,
      onStateLoaded: this.handleStateLoaded.bind(this),
      onStateChanged: this.handleStateSync.bind(this),
    });
  }

  /**
   * Initialize the undo manager
   */
  async init(): Promise<void> {
    await this.storageCoordinator.init();

    // Try to load existing state
    const state = await this.storageCoordinator.loadState();
    if (state) {
      this.undoStack = state.undoStack;
      this.redoStack = state.redoStack;
    }

    // Always notify after initialization
    this.notifyStateChanged();
  }

  /**
   * Add an operation to the undo stack
   */
  add(operation: Operation): void {
    // Clone operation to avoid mutations
    const op: Operation = {
      type: operation.type,
      data: operation.data,
      timestamp: operation.timestamp ?? Date.now(),
      userId: operation.userId,
    };

    // Add to undo stack
    this.undoStack.push(op);

    // Clear redo stack when new operation is added
    this.redoStack = [];

    // Enforce max size
    if (this.undoStack.length > this.maxUndoSize) {
      this.undoStack.shift();
    }

    // Save to storage and notify
    this.saveState();
    this.notifyStateChanged();
  }

  /**
   * Undo the last operation
   */
  undo(): Operation | null {
    if (this.undoStack.length === 0) {
      return null;
    }

    const operation = this.undoStack.pop()!;
    this.redoStack.push(operation);

    // Save to storage and notify
    this.saveState();
    this.notifyStateChanged();

    return operation;
  }

  /**
   * Redo the last undone operation
   */
  redo(): Operation | null {
    if (this.redoStack.length === 0) {
      return null;
    }

    const operation = this.redoStack.pop()!;
    this.undoStack.push(operation);

    // Save to storage and notify
    this.saveState();
    this.notifyStateChanged();

    return operation;
  }

  /**
   * Check if undo is possible
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is possible
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get current state
   */
  getState(): UndoManagerState {
    return {
      undoStack: this.undoStack.map(op => ({ ...op })),
      redoStack: this.redoStack.map(op => ({ ...op })),
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    };
  }

  /**
   * Clear all undo/redo history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];

    // Save to storage and notify
    this.saveState();
    this.notifyStateChanged();
  }

  /**
   * Destroy the undo manager
   */
  destroy(): void {
    this.storageCoordinator.destroy();
  }

  /**
   * Save current state to storage (fire and forget)
   */
  private saveState(): void {
    // Fire and forget - don't block operations on storage writes
    this.storageCoordinator.saveState(this.undoStack, this.redoStack).catch((error) => {
      console.error('Failed to save undo state:', error);
    });
  }

  /**
   * Handle state loaded from storage
   */
  private handleStateLoaded(state: any): void {
    this.undoStack = state.undoStack;
    this.redoStack = state.redoStack;
    this.notifyStateChanged();
  }

  /**
   * Handle state sync from another tab
   */
  private handleStateSync(state: any): void {
    this.undoStack = state.undoStack;
    this.redoStack = state.redoStack;
    this.notifyStateChanged();
  }

  /**
   * Notify listeners of state changes
   */
  private notifyStateChanged(): void {
    if (this.onStateChanged) {
      this.onStateChanged(this.getState());
    }
  }
}
