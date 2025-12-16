import { StorageCoordinator } from '../storage/storage-coordinator';
import { CrossTabSync } from '../sync/cross-tab';
import type { UndoAddMessage, UndoMessage, RedoMessage } from '../sync/message-types';

/**
 * Represents an operation that can be undone/redone
 */
export interface Operation {
  type: string;
  data?: any;
  timestamp?: number;
  userId?: string;
  mergeWindow?: number; // Time window in ms for merging operations
}

/**
 * Function to determine if two operations can be merged
 */
export type CanMergeFn = (prev: Operation, next: Operation) => boolean;

/**
 * Function to merge two operations
 */
export type MergeFn = (prev: Operation, next: Operation) => Operation;

/**
 * Configuration options for UndoManager
 */
export interface UndoManagerOptions {
  documentId: string;
  crossTabSync: CrossTabSync;
  maxUndoSize?: number;
  mergeWindow?: number; // Default merge window in ms (default: 1000ms)
  canMerge?: CanMergeFn;
  merge?: MergeFn;
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
  private mergeWindow: number;
  private canMergeFn: CanMergeFn;
  private mergeFn: MergeFn;
  private storageCoordinator: StorageCoordinator;
  private crossTabSync: CrossTabSync;
  private documentId: string;
  private onStateChanged?: (state: UndoManagerState) => void;
  private isApplyingRemote: boolean = false;

  constructor(options: UndoManagerOptions) {
    this.documentId = options.documentId;
    this.crossTabSync = options.crossTabSync;
    this.maxUndoSize = options.maxUndoSize ?? 100;
    this.mergeWindow = options.mergeWindow ?? 1000; // 1 second default
    this.canMergeFn = options.canMerge ?? this.defaultCanMerge.bind(this);
    this.mergeFn = options.merge ?? this.defaultMerge.bind(this);
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

    // Register cross-tab message handlers
    this.crossTabSync.on('undo-add', (message) => {
      const msg = message as UndoAddMessage;
      if (msg.documentId !== this.documentId) {
        return;
      }

      this.isApplyingRemote = true;
      try {
        // Add operation to local stack without broadcasting
        this.addLocal(msg.operation);
      } finally {
        this.isApplyingRemote = false;
      }
    });

    this.crossTabSync.on('undo', (message) => {
      const msg = message as UndoMessage;
      if (msg.documentId !== this.documentId) return;

      this.isApplyingRemote = true;
      try {
        // Perform undo locally without broadcasting
        this.undoLocal();
      } finally {
        this.isApplyingRemote = false;
      }
    });

    this.crossTabSync.on('redo', (message) => {
      const msg = message as RedoMessage;
      if (msg.documentId !== this.documentId) return;

      this.isApplyingRemote = true;
      try {
        // Perform redo locally without broadcasting
        this.redoLocal();
      } finally {
        this.isApplyingRemote = false;
      }
    });

    // Always notify after initialization
    this.notifyStateChanged();
  }

  /**
   * Add an operation to the undo stack
   */
  add(operation: Operation): void {
    this.addLocal(operation);

    // Broadcast to other tabs (if not applying a remote operation)
    if (!this.isApplyingRemote) {
      this.crossTabSync.broadcast({
        type: 'undo-add',
        documentId: this.documentId,
        operation,
      } as Omit<UndoAddMessage, 'from' | 'seq' | 'timestamp'>);
    }
  }

  /**
   * Add an operation locally without broadcasting
   */
  private addLocal(operation: Operation): void {
    // Clone operation to avoid mutations
    const op: Operation = {
      type: operation.type,
      data: operation.data,
      timestamp: operation.timestamp ?? Date.now(),
      userId: operation.userId,
      mergeWindow: operation.mergeWindow,
    };

    // Try to merge with the last operation if possible
    if (this.undoStack.length > 0) {
      const lastOp = this.undoStack[this.undoStack.length - 1]!;

      if (this.canMergeFn(lastOp, op)) {
        // Replace last operation with merged version
        const merged = this.mergeFn(lastOp, op);
        this.undoStack[this.undoStack.length - 1] = merged;

        // Clear redo stack and notify
        this.redoStack = [];
        this.saveState();
        this.notifyStateChanged();
        return;
      }
    }

    // Add to undo stack if not merged
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
    const operation = this.undoLocal();

    // Broadcast to other tabs (if not applying a remote operation)
    if (operation && !this.isApplyingRemote) {
      this.crossTabSync.broadcast({
        type: 'undo',
        documentId: this.documentId,
      } as Omit<UndoMessage, 'from' | 'seq' | 'timestamp'>);
    }

    return operation;
  }

  /**
   * Undo locally without broadcasting
   */
  private undoLocal(): Operation | null {
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
    const operation = this.redoLocal();

    // Broadcast to other tabs (if not applying a remote operation)
    if (operation && !this.isApplyingRemote) {
      this.crossTabSync.broadcast({
        type: 'redo',
        documentId: this.documentId,
      } as Omit<RedoMessage, 'from' | 'seq' | 'timestamp'>);
    }

    return operation;
  }

  /**
   * Redo locally without broadcasting
   */
  private redoLocal(): Operation | null {
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
   * Default merge strategy: can merge if same type, same user, within time window
   */
  private defaultCanMerge(prev: Operation, next: Operation): boolean {
    // Must be same type
    if (prev.type !== next.type) {
      return false;
    }

    // Must be same user (or both undefined)
    if (prev.userId !== next.userId) {
      return false;
    }

    // Check time window
    const mergeWindow = next.mergeWindow ?? prev.mergeWindow ?? this.mergeWindow;
    const timeDiff = (next.timestamp ?? 0) - (prev.timestamp ?? 0);

    return timeDiff > 0 && timeDiff <= mergeWindow;
  }

  /**
   * Default merge implementation: combines data arrays or replaces single values
   */
  private defaultMerge(prev: Operation, next: Operation): Operation {
    let mergedData = next.data;

    // If both have array data, concatenate them
    if (Array.isArray(prev.data) && Array.isArray(next.data)) {
      mergedData = [...prev.data, ...next.data];
    }
    // If both have string data, concatenate them
    else if (typeof prev.data === 'string' && typeof next.data === 'string') {
      mergedData = prev.data + next.data;
    }
    // If both have number data, sum them
    else if (typeof prev.data === 'number' && typeof next.data === 'number') {
      mergedData = prev.data + next.data;
    }
    // Otherwise use the latest data
    else {
      mergedData = next.data;
    }

    return {
      type: prev.type,
      data: mergedData,
      timestamp: prev.timestamp, // Keep original timestamp
      userId: prev.userId,
      mergeWindow: prev.mergeWindow,
    };
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
