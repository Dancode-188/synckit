/**
 * IndexedDB storage layer for undo/redo state persistence
 *
 * Provides a simple key-value store for persisting undo/redo stacks
 * across browser sessions. Only accessed by the leader tab to prevent
 * race conditions.
 */

const DB_NAME = 'synckit';
const DB_VERSION = 1;
const STORE_NAME = 'undo-redo';

export interface UndoRedoState {
  documentId: string;
  undoStack: any[];
  redoStack: any[];
  timestamp: number;
}

/**
 * IndexedDB wrapper for undo/redo state
 */
export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB connection
   */
  async init(): Promise<void> {
    // Return existing initialization promise if already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'documentId' });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Save undo/redo state to IndexedDB
   */
  async saveState(state: UndoRedoState): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(state);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to save state: ${request.error?.message}`));
    });
  }

  /**
   * Load undo/redo state from IndexedDB
   */
  async loadState(documentId: string): Promise<UndoRedoState | null> {
    await this.init();

    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(documentId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to load state: ${request.error?.message}`));
      };
    });
  }

  /**
   * Delete state for a document
   */
  async deleteState(documentId: string): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(documentId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to delete state: ${request.error?.message}`));
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}
