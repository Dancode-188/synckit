/**
 * IndexedDB storage layer for undo/redo state persistence
 *
 * Provides a simple key-value store for persisting undo/redo stacks
 * across browser sessions. Only accessed by the leader tab to prevent
 * race conditions.
 */

import { compress, decompress } from 'lz-string';

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
   * Save undo/redo state to IndexedDB with quota handling
   */
  async saveState(state: UndoRedoState): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    try {
      // Strategy 1: Try normal storage
      await this.putState(state);
    } catch (err: any) {
      if (err.name === 'QuotaExceededError') {
        console.warn('[IndexedDB] Quota exceeded, attempting compression...');

        try {
          // Strategy 2: Try with compression
          const compressed = this.compressState(state);
          await this.putState(compressed);
          console.info('[IndexedDB] Successfully saved compressed data');
          return;
        } catch (compressionErr: any) {
          if (compressionErr.name === 'QuotaExceededError') {
            console.warn('[IndexedDB] Compression failed, truncating history...');

            // Strategy 3: Truncate undo/redo stacks
            const truncated = this.truncateState(state);

            try {
              await this.putState(truncated);
              console.warn('[IndexedDB] Undo history truncated to fit quota');
              return;
            } catch (truncateErr: any) {
              if (truncateErr.name === 'QuotaExceededError') {
                // Strategy 4: Clear old data
                console.error('[IndexedDB] Still exceeding quota, clearing old data...');
                await this.clearOldData();

                // Final retry
                await this.putState(truncated);
                console.info('[IndexedDB] Saved after clearing old data');
                return;
              } else {
                throw truncateErr;
              }
            }
          } else {
            throw compressionErr;
          }
        }
      } else {
        throw err;
      }
    }
  }

  /**
   * Put state into IndexedDB
   */
  private async putState(state: UndoRedoState | any): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(state);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        const error = request.error;
        if (error && error.name === 'QuotaExceededError') {
          const quotaError = new Error('QuotaExceededError');
          quotaError.name = 'QuotaExceededError';
          reject(quotaError);
        } else {
          reject(new Error(`Failed to save state: ${error?.message}`));
        }
      };
    });
  }

  /**
   * Compress state using lz-string
   */
  private compressState(state: UndoRedoState): any {
    const json = JSON.stringify(state);
    const compressed = compress(json);

    return {
      documentId: state.documentId,
      compressed: compressed,
      isCompressed: true,
      timestamp: state.timestamp,
    };
  }

  /**
   * Truncate undo/redo stacks to last 50 entries
   */
  private truncateState(state: UndoRedoState): UndoRedoState {
    return {
      ...state,
      undoStack: state.undoStack.slice(-50),
      redoStack: state.redoStack.slice(-50),
    };
  }

  /**
   * Clear old documents (keep only recent 10)
   */
  private async clearOldData(): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = async () => {
        const keys = request.result as string[];

        if (keys.length > 10) {
          // Delete oldest entries (keep last 10)
          const toDelete = keys.slice(0, keys.length - 10);

          for (const key of toDelete) {
            await new Promise<void>((res, rej) => {
              const deleteReq = store.delete(key);
              deleteReq.onsuccess = () => res();
              deleteReq.onerror = () => rej(deleteReq.error);
            });
          }
        }

        resolve();
      };

      request.onerror = () => reject(request.error);
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
        const result = request.result;

        if (!result) {
          resolve(null);
          return;
        }

        // Check if data is compressed
        if (result.isCompressed && result.compressed) {
          try {
            const decompressed = decompress(result.compressed);
            if (!decompressed) {
              throw new Error('Decompression returned null');
            }
            const state = JSON.parse(decompressed) as UndoRedoState;
            resolve(state);
          } catch (err) {
            console.error('[IndexedDB] Failed to decompress state:', err);
            reject(new Error('Failed to decompress state'));
          }
        } else {
          resolve(result as UndoRedoState);
        }
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
