/**
 * Replay Controls Component
 * Play/pause, speed, and timeline controls
 */

import { formatDuration } from '../lib/replay';
import { PlaybackSpeed } from '../hooks/useReplayEngine';

interface ReplayControlsProps {
  isPlaying: boolean;
  currentIndex: number;
  totalOperations: number;
  playbackSpeed: PlaybackSpeed;
  elapsedMs: number;
  totalMs: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (index: number) => void;
  onRestart: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onClose: () => void;
}

const SPEEDS: PlaybackSpeed[] = [1, 2, 4, 8];

export function ReplayControls({
  isPlaying,
  currentIndex,
  totalOperations,
  playbackSpeed,
  elapsedMs,
  totalMs,
  onPlay,
  onPause,
  onSeek,
  onRestart,
  onSpeedChange,
  onClose,
}: ReplayControlsProps) {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    onSeek(value - 1); // Convert to 0-based index
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 text-white p-4 z-[101]">
      <div className="max-w-3xl mx-auto">
        {/* Timeline slider */}
        <div className="mb-4">
          <input
            type="range"
            min="0"
            max={totalOperations}
            value={currentIndex + 1}
            onChange={handleSliderChange}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{formatDuration(elapsedMs)}</span>
            <span>{formatDuration(totalMs)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          {/* Left: Play controls */}
          <div className="flex items-center gap-3">
            {/* Restart button */}
            <button
              onClick={onRestart}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title="Restart"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Play/Pause button */}
            <button
              onClick={isPlaying ? onPause : onPlay}
              className="p-3 bg-primary-500 hover:bg-primary-600 rounded-full transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Operation counter */}
            <span className="text-sm text-gray-400">
              {currentIndex + 1} / {totalOperations} edits
            </span>
          </div>

          {/* Center: Speed selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Speed:</span>
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Right: Close button */}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            Exit Replay
          </button>
        </div>
      </div>
    </div>
  );
}
