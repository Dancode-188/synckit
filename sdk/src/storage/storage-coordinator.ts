/**
 * Coordinates IndexedDB access through leader election
 *
 * Ensures only the leader tab writes to IndexedDB, preventing race
 * conditions and conflicts. Handles state synchronization when leadership
 * changes.
 */

import { CrossTabSync } from '../sync/cross-tab';
import { IndexedDBStorage, UndoRedoState } from './indexed-db';

export interface StorageCoordinatorOptions {
  documentId: string;
  crossTabSync: CrossTabSync;
  onStateLoaded?: (state: UndoRedoState) => void;
  onStateChanged?: (state: UndoRedoState) => void;
}

/**
 * Coordinates storage access through leader election
 */
export class StorageCoordinator {
  private storage: IndexedDBStorage;
  private crossTabSync: CrossTabSync;
  private documentId: string;
  private onStateLoaded?: (state: UndoRedoState) => void;
  private onStateChanged?: (state: UndoRedoState) => void;
  private isInitialized = false;

  constructor(options: StorageCoordinatorOptions) {
    this.documentId = options.documentId;
    this.crossTabSync = options.crossTabSync;
    this.onStateLoaded = options.onStateLoaded;
    this.onStateChanged = options.onStateChanged;
    this.storage = new IndexedDBStorage();

    // Listen for leader election events
    this.crossTabSync.on('leader-elected', this.handleLeaderElected.bind(this));
    this.crossTabSync.on('leader-changed', this.handleLeaderChanged.bind(this));

    // Listen for state sync messages from leader
    this.crossTabSync.on('state-sync', this.handleStateSync.bind(this));
  }

  /**
   * Initialize the coordinator
   * If this tab is leader, loads state from IndexedDB
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.storage.init();
    this.isInitialized = true;

    // If we're already leader, load state
    if (this.crossTabSync.isCurrentLeader()) {
      await this.loadStateFromIndexedDB();
    }
  }

  /**
   * Save state to IndexedDB (leader only)
   */
  async saveState(undoStack: any[], redoStack: any[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('StorageCoordinator not initialized');
    }

    // Only leader can write to IndexedDB
    if (!this.crossTabSync.isCurrentLeader()) {
      console.warn('Only leader can save state to IndexedDB');
      return;
    }

    const state: UndoRedoState = {
      documentId: this.documentId,
      undoStack,
      redoStack,
      timestamp: Date.now(),
    };

    await this.storage.saveState(state);

    // Broadcast state to other tabs
    this.crossTabSync.broadcast({
      type: 'state-sync',
      documentId: this.documentId,
      state,
    } as any);
  }

  /**
   * Load current state (from memory on followers, from IndexedDB on leader)
   */
  async loadState(): Promise<UndoRedoState | null> {
    if (!this.isInitialized) {
      await this.init();
    }

    // Leader loads from IndexedDB
    if (this.crossTabSync.isCurrentLeader()) {
      return await this.storage.loadState(this.documentId);
    }

    // Followers wait for state sync from leader
    // Return null for now - they'll get updates via state-sync messages
    return null;
  }

  /**
   * Delete state from IndexedDB (leader only)
   */
  async deleteState(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('StorageCoordinator not initialized');
    }

    if (!this.crossTabSync.isCurrentLeader()) {
      console.warn('Only leader can delete state from IndexedDB');
      return;
    }

    await this.storage.deleteState(this.documentId);
  }

  /**
   * Handle this tab becoming leader
   */
  private async handleLeaderElected(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // Load state from IndexedDB when we become leader
    await this.loadStateFromIndexedDB();
  }

  /**
   * Handle leader changing to another tab
   */
  private handleLeaderChanged(_message: any): void {
    // When we lose leadership, we passively wait for state-sync from new leader
    // No action needed - handleStateSync will receive updates
  }

  /**
   * Handle state sync message from leader
   */
  private handleStateSync(message: any): void {
    if (message.documentId !== this.documentId) {
      return;
    }

    // Only process if we're not the leader (leader doesn't need sync)
    if (!this.crossTabSync.isCurrentLeader() && this.onStateChanged) {
      this.onStateChanged(message.state);
    }
  }

  /**
   * Load state from IndexedDB and notify listeners
   */
  private async loadStateFromIndexedDB(): Promise<void> {
    try {
      const state = await this.storage.loadState(this.documentId);

      if (state && this.onStateLoaded) {
        this.onStateLoaded(state);
      }
    } catch (error) {
      console.error('Failed to load state from IndexedDB:', error);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.storage.close();
    this.isInitialized = false;
  }
}
