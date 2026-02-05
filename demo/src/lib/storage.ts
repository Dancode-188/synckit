/**
 * Storage initialization utility
 * Tries OPFS first (3.75x faster writes, 6x faster reads)
 * Falls back to IndexedDB if OPFS is not supported
 */

import { OPFSStorage, IndexedDBStorage } from '@synckit-js/sdk';

export type StorageType = 'opfs' | 'indexeddb';

export interface StorageInfo {
  type: StorageType;
  storage: OPFSStorage | IndexedDBStorage;
}

/**
 * Check if OPFS is supported in current environment
 */
function isOPFSSupported(): boolean {
  return typeof navigator !== 'undefined' &&
         typeof navigator.storage !== 'undefined' &&
         typeof navigator.storage.getDirectory === 'function';
}

/**
 * Initialize storage with automatic fallback
 * @returns StorageInfo object containing the storage type and instance
 */
export async function initializeStorage(): Promise<StorageInfo> {
  // Try OPFS first (fastest option)
  if (isOPFSSupported()) {
    try {
      const storage = new OPFSStorage();
      await storage.init();
      return {
        type: 'opfs',
        storage,
      };
    } catch {
      // OPFS init failed, fall back to IndexedDB
    }
  }

  // Fallback to IndexedDB
  const storage = new IndexedDBStorage();
  await storage.init();
  return {
    type: 'indexeddb',
    storage,
  };
}

/**
 * Get user-friendly storage type name
 */
export function getStorageTypeName(type: StorageType): string {
  return type === 'opfs' ? 'OPFS (Fast)' : 'IndexedDB';
}
