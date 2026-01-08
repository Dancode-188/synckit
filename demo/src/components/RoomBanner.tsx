/**
 * Room Banner Component
 * Shows room information and collaboration controls
 */

import { useState, useEffect } from 'react';
import type { SyncKit } from '@synckit-js/sdk';
import { getRoomUrl, leaveRoom } from '../lib/rooms';

interface RoomBannerProps {
  synckit: SyncKit;
  roomId: string;
  documentId: string;
}

export function RoomBanner({ synckit, roomId, documentId }: RoomBannerProps) {
  const [showCopied, setShowCopied] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Track online users
  useEffect(() => {
    let mounted = true;

    async function trackUsers() {
      try {
        const awareness = synckit.getAwareness(documentId);
        if (!awareness) return;

        await awareness.init();

        if (!mounted) return;

        // Update count initially
        const updateCount = () => {
          if (!mounted) return;
          const count = awareness.clientCount();
          setOnlineCount(count);
        };

        updateCount();

        // Subscribe to changes
        const unsubscribe = awareness.subscribe(() => {
          updateCount();
        });

        return unsubscribe;
      } catch (error) {
        console.error('Failed to track users:', error);
      }
    }

    const cleanup = trackUsers();

    return () => {
      mounted = false;
      if (cleanup) {
        cleanup.then(fn => fn && fn());
      }
    };
  }, [synckit, documentId]);

  const handleCopyLink = () => {
    const url = getRoomUrl(roomId);
    navigator.clipboard.writeText(url).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    });
  };

  const handleLeave = () => {
    setShowLeaveDialog(true);
  };

  const confirmLeave = () => {
    setShowLeaveDialog(false);
    leaveRoom();
  };

  return (
    <>
      <div className="bg-primary-500 text-white px-4 py-2 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="font-medium">Collaborative Room</span>
          </div>
          <div className="text-sm opacity-90">
            {onlineCount} {onlineCount === 1 ? 'person' : 'people'} online
          </div>
          <div className="text-xs opacity-75 font-mono bg-white/20 px-2 py-1 rounded">
            {roomId}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors flex items-center gap-2"
          >
            {showCopied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Share Link
              </>
            )}
          </button>
          <button
            onClick={handleLeave}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
          >
            Leave Room
          </button>
        </div>
      </div>

      {/* Custom Leave Dialog */}
      {showLeaveDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 animate-scale-in">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              Leave this room?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Your changes will be synced automatically. You can return to this room anytime using the same URL.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLeaveDialog(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLeave}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
