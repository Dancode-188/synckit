/**
 * Replay Overlay Component
 * Full-screen document replay view
 */

import { useMemo } from 'react';
import { ReplaySession } from '../lib/replay';
import { ReplayControls } from './ReplayControls';
import { useReplayEngine } from '../hooks/useReplayEngine';
import { Block } from '../lib/blocks';
import { parseMarkdown } from '../lib/markdown';

interface ReplayOverlayProps {
  session: ReplaySession;
  blocks: Block[];
  onClose: () => void;
}

export function ReplayOverlay({ session, blocks, onClose }: ReplayOverlayProps) {
  const {
    isPlaying,
    currentIndex,
    currentState,
    currentOperation,
    playbackSpeed,
    totalOperations,
    elapsedMs,
    totalMs,
    play,
    pause,
    seekTo,
    restart,
    setPlaybackSpeed,
  } = useReplayEngine({ session });

  // Get block order from the original blocks
  const blockOrder = useMemo(() => blocks.map((b) => b.id), [blocks]);

  // Get current active user (from the current operation)
  const activeUser = currentOperation ? {
    name: currentOperation.userName,
    color: currentOperation.userColor,
    blockId: currentOperation.blockId,
  } : null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎬</span>
          <div>
            <h2 className="text-white font-semibold">Document Replay</h2>
            <p className="text-gray-400 text-sm">
              Watch how this document was created
            </p>
          </div>
        </div>
        {activeUser && (
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: activeUser.color }}
            />
            <span className="text-white text-sm">{activeUser.name} is typing...</span>
          </div>
        )}
      </div>

      {/* Document view - pb-36 accounts for fixed controls height */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 p-8 pb-36">
        <div className="max-w-3xl mx-auto">
          {blockOrder.map((blockId) => {
            const content = currentState[blockId] || '';
            const isActive = activeUser?.blockId === blockId;
            const block = blocks.find((b) => b.id === blockId);

            if (!block) return null;

            return (
              <div
                key={blockId}
                className={`relative py-2 transition-all duration-200 ${
                  isActive ? 'bg-yellow-50 dark:bg-yellow-900/20 -mx-4 px-4 rounded-lg' : ''
                }`}
              >
                {/* Active indicator */}
                {isActive && activeUser && (
                  <div
                    className="absolute -left-2 top-2 w-1 h-6 rounded-full"
                    style={{ backgroundColor: activeUser.color }}
                  />
                )}

                {/* Content */}
                <div
                  className="prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: parseMarkdown(content) || '<span class="text-gray-400">Empty block</span>',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <ReplayControls
        isPlaying={isPlaying}
        currentIndex={currentIndex}
        totalOperations={totalOperations}
        playbackSpeed={playbackSpeed}
        elapsedMs={elapsedMs}
        totalMs={totalMs}
        onPlay={play}
        onPause={pause}
        onSeek={seekTo}
        onRestart={restart}
        onSpeedChange={setPlaybackSpeed}
        onClose={onClose}
      />
    </div>
  );
}
