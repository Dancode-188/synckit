/**
 * SyncKit initialization
 * Sets up OPFS/IndexedDB storage for local-first sync
 */

import { SyncKit } from '@synckit-js/sdk';
import { initializeStorage, StorageInfo } from './storage';

// Auto-snapshot configuration (from stress test learnings)
// Note: This will be used when v0.3.0 snapshot API is available
export const AUTO_SNAPSHOT_CONFIG = {
  operationCount: 1000,              // Snapshot every 1000 operations
  timeIntervalMs: 3600000,           // Or every hour (3600000ms)
  sizeThresholdBytes: 10 * 1024 * 1024, // Or when doc > 10MB
  maxSnapshots: 5,                   // Keep last 5 snapshots
};

export interface SyncKitInfo {
  synckit: SyncKit;
  storage: StorageInfo;
}

/**
 * Initialize SyncKit with OPFS/IndexedDB storage
 * @returns SyncKit instance and storage info
 */
export async function initializeSyncKit(): Promise<SyncKitInfo> {
  // Initialize storage (OPFS with IndexedDB fallback)
  const storageInfo = await initializeStorage();

  // Create SyncKit instance with server connection
  const synckit = new SyncKit({
    name: 'localwrite',
    storage: storageInfo.storage,
    // Connect to Fly.io production server
    serverUrl: 'wss://synckit-localwrite.fly.dev/ws',
  });

  await synckit.init();

  return {
    synckit,
    storage: storageInfo,
  };
}

/**
 * Enable auto-snapshots on a document (v0.3.0 feature)
 * Note: This will be implemented when snapshot API is available
 */
export function enableAutoSnapshots(_doc: any) {
  // TODO: Implement when snapshot API is available in v0.3.0
  // _doc.enableAutoSnapshot(AUTO_SNAPSHOT_CONFIG);
}
