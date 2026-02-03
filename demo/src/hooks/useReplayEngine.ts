/**
 * Replay Engine Hook
 * Plays back recorded operations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ReplaySession, reconstructState, RecordedOperation } from '../lib/replay';

export type PlaybackSpeed = 1 | 2 | 4 | 8;

interface UseReplayEngineProps {
  session: ReplaySession | null;
  onStateChange?: (state: Record<string, string>, operation: RecordedOperation | null) => void;
}

export function useReplayEngine({ session, onStateChange }: UseReplayEngineProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [currentState, setCurrentState] = useState<Record<string, string>>({});

  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Initialize state when session changes
  useEffect(() => {
    if (session) {
      setCurrentIndex(-1);
      setCurrentState(session.initialSnapshot);
      setIsPlaying(false);
    }
  }, [session]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Calculate time between operations based on speed
  const getIntervalMs = useCallback((speed: PlaybackSpeed): number => {
    // Base interval is 200ms, speed multiplier reduces it
    return 200 / speed;
  }, []);

  // Advance to next operation
  const advanceToIndex = useCallback((index: number) => {
    if (!session || index >= session.operations.length) {
      setIsPlaying(false);
      return;
    }

    const newState = reconstructState(session, index);
    setCurrentState(newState);
    setCurrentIndex(index);

    if (onStateChange) {
      const operation = index >= 0 ? session.operations[index] : null;
      onStateChange(newState, operation);
    }
  }, [session, onStateChange]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !session) return;

    const animate = (timestamp: number) => {
      const interval = getIntervalMs(playbackSpeed);

      if (timestamp - lastUpdateRef.current >= interval) {
        const nextIndex = currentIndex + 1;

        if (nextIndex >= session.operations.length) {
          setIsPlaying(false);
          return;
        }

        advanceToIndex(nextIndex);
        lastUpdateRef.current = timestamp;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    lastUpdateRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, session, currentIndex, playbackSpeed, getIntervalMs, advanceToIndex]);

  // Controls
  const play = useCallback(() => {
    if (!session || session.operations.length === 0) return;

    // If at end, restart from beginning
    if (currentIndex >= session.operations.length - 1) {
      setCurrentIndex(-1);
      setCurrentState(session.initialSnapshot);
    }

    setIsPlaying(true);
  }, [session, currentIndex]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const seekTo = useCallback((index: number) => {
    if (!session) return;

    const clampedIndex = Math.max(-1, Math.min(index, session.operations.length - 1));
    advanceToIndex(clampedIndex);
  }, [session, advanceToIndex]);

  const restart = useCallback(() => {
    if (!session) return;

    setCurrentIndex(-1);
    setCurrentState(session.initialSnapshot);
    setIsPlaying(false);

    if (onStateChange) {
      onStateChange(session.initialSnapshot, null);
    }
  }, [session, onStateChange]);

  // Computed values
  const totalOperations = session?.operations.length || 0;
  const progress = totalOperations > 0 ? (currentIndex + 1) / totalOperations : 0;
  const currentOperation = session && currentIndex >= 0 ? session.operations[currentIndex] : null;

  // Calculate elapsed and total time
  const elapsedMs = session && currentIndex >= 0 && session.operations[currentIndex]
    ? session.operations[currentIndex].timestamp - session.startTime
    : 0;
  const totalMs = session && session.operations.length > 0
    ? session.operations[session.operations.length - 1].timestamp - session.startTime
    : 0;

  return {
    isPlaying,
    currentIndex,
    currentState,
    currentOperation,
    playbackSpeed,
    progress,
    totalOperations,
    elapsedMs,
    totalMs,
    play,
    pause,
    seekTo,
    restart,
    setPlaybackSpeed,
  };
}
