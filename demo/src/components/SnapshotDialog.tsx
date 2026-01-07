/**
 * Snapshot Dialog Component
 * Shows list of available snapshots and allows restoration
 */

import { useState, useEffect } from 'react';
import { SnapshotScheduler } from '@synckit-js/sdk';
import { SyncDocument } from '@synckit-js/sdk';
import { PageDocument } from '../lib/blocks';

interface SnapshotDialogProps {
  scheduler: SnapshotScheduler | null;
  document: SyncDocument<PageDocument> | null;
  onClose: () => void;
}

export function SnapshotDialog({ scheduler, document, onClose }: SnapshotDialogProps) {
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  // Load snapshots on mount
  useEffect(() => {
    async function loadSnapshots() {
      if (!scheduler) return;

      try {
        const list = await scheduler.listSnapshots();
        setSnapshots(list);
      } catch (error) {
        console.error('Failed to load snapshots:', error);
      } finally {
        setLoading(false);
      }
    }

    loadSnapshots();
  }, [scheduler]);

  const handleRestore = async (snapshotKey: string) => {
    if (!document || restoring) return;

    try {
      setRestoring(true);

      // Load from snapshot
      await document.loadFromSnapshot(snapshotKey);

      // Close dialog
      onClose();
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
      alert('Failed to restore snapshot. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const formatTimestamp = (key: string): string => {
    // Extract timestamp from key: "snapshot:docId:timestamp"
    const parts = key.split(':');
    const timestamp = parseInt(parts[2] || '0', 10);

    if (!timestamp) return 'Unknown time';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Format relative time
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let relative = '';
    if (days > 0) relative = `${days}d ago`;
    else if (hours > 0) relative = `${hours}h ago`;
    else if (minutes > 0) relative = `${minutes}m ago`;
    else relative = 'just now';

    // Format absolute time
    const absolute = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return `${relative} (${absolute})`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 dark:bg-opacity-50 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-6 animate-scale-in max-h-[80vh] flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Restore from Snapshot
          </h3>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-3 border-gray-300 dark:border-gray-600 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin"></div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading snapshots...</div>
              </div>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 mb-2">No snapshots available</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Snapshots are created automatically every 5 minutes
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2">
              {snapshots.map((snapshot, index) => (
                <button
                  key={snapshot}
                  onClick={() => handleRestore(snapshot)}
                  disabled={restoring}
                  className={`w-full text-left p-4 rounded-lg border transition-all duration-150 ${
                    restoring
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 hover:scale-[1.02] active:scale-[0.98] border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {index === 0 ? 'Latest snapshot' : `Snapshot ${snapshots.length - index}`}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatTimestamp(snapshot)}
                      </div>
                    </div>
                    <div className="text-primary-600 dark:text-primary-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              disabled={restoring}
              className={`px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md transition-all duration-150 ${
                restoring
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-600 hover:scale-105 active:scale-95'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
