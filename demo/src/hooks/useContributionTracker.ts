/**
 * Contribution Tracker Hook
 * Tracks local user's contributions (words added, edits count)
 */

import { useEffect, useRef, useCallback, useState } from 'react';

interface ContributionStats {
  wordsAdded: number;
  editsCount: number;
}

function countWords(text: string): number {
  if (!text || text.trim() === '') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface UseContributionTrackerProps {
  pageId: string | undefined;
  onContributionChange?: (stats: ContributionStats) => void;
}

export function useContributionTracker({
  pageId,
  onContributionChange,
}: UseContributionTrackerProps) {
  const [stats, setStats] = useState<ContributionStats>({
    wordsAdded: 0,
    editsCount: 0,
  });

  const lastContentRef = useRef<Map<string, string>>(new Map());
  const statsRef = useRef(stats);

  // Keep ref in sync
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  // Reset stats when page changes
  useEffect(() => {
    setStats({ wordsAdded: 0, editsCount: 0 });
    lastContentRef.current.clear();
  }, [pageId]);

  // Track content change for a specific block
  const trackContentChange = useCallback((blockId: string, newContent: string) => {
    const lastContent = lastContentRef.current.get(blockId) || '';
    const oldWords = countWords(lastContent);
    const newWords = countWords(newContent);
    const wordDiff = newWords - oldWords;

    lastContentRef.current.set(blockId, newContent);

    if (wordDiff !== 0 || newContent !== lastContent) {
      setStats((prev) => {
        const newStats = {
          wordsAdded: prev.wordsAdded + Math.max(0, wordDiff),
          editsCount: prev.editsCount + 1,
        };
        return newStats;
      });
    }
  }, []);

  // Notify changes (debounced in parent)
  useEffect(() => {
    if (onContributionChange) {
      onContributionChange(stats);
    }
  }, [stats, onContributionChange]);

  return {
    stats,
    trackContentChange,
  };
}
