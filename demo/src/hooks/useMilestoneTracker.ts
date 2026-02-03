/**
 * Milestone Tracker Hook
 * Tracks word count milestones and triggers celebrations
 */

import { useEffect, useRef, useCallback } from 'react';
import { Block } from '../lib/blocks';

interface Milestone {
  words: number;
  emoji: string;
  message: string;
}

const MILESTONES: Milestone[] = [
  { words: 100, emoji: '🎯', message: 'First 100 words!' },
  { words: 250, emoji: '📝', message: '250 words and counting!' },
  { words: 500, emoji: '🚀', message: 'Halfway to 1000!' },
  { words: 1000, emoji: '🎉', message: '1,000 words achieved!' },
  { words: 2500, emoji: '🏆', message: '2,500 word milestone!' },
  { words: 5000, emoji: '👑', message: 'Legendary: 5,000 words!' },
];

function countWords(text: string): number {
  if (!text || text.trim() === '') return 0;
  // Split on whitespace and filter empty strings
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getStorageKey(pageId: string): string {
  return `localwrite:milestones:${pageId}`;
}

function getAchievedMilestones(pageId: string): number[] {
  try {
    const stored = localStorage.getItem(getStorageKey(pageId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveAchievedMilestone(pageId: string, words: number): void {
  try {
    const achieved = getAchievedMilestones(pageId);
    if (!achieved.includes(words)) {
      achieved.push(words);
      localStorage.setItem(getStorageKey(pageId), JSON.stringify(achieved));
    }
  } catch {
    // Ignore storage errors
  }
}

interface UseMilestoneTrackerProps {
  pageId: string | undefined;
  blocks: Block[];
  onMilestone: (milestone: Milestone) => void;
}

export function useMilestoneTracker({
  pageId,
  blocks,
  onMilestone,
}: UseMilestoneTrackerProps) {
  const lastWordCountRef = useRef(0);
  const initializedRef = useRef(false);

  // Calculate total word count across all blocks
  const calculateWordCount = useCallback(() => {
    return blocks.reduce((total, block) => {
      return total + countWords(block.content || '');
    }, 0);
  }, [blocks]);

  useEffect(() => {
    if (!pageId) return;

    const currentWordCount = calculateWordCount();

    // Skip initial mount to avoid false triggers
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastWordCountRef.current = currentWordCount;
      return;
    }

    // Only check if word count increased
    if (currentWordCount <= lastWordCountRef.current) {
      lastWordCountRef.current = currentWordCount;
      return;
    }

    const achieved = getAchievedMilestones(pageId);

    // Check each milestone
    for (const milestone of MILESTONES) {
      // Milestone reached if:
      // 1. Current count >= milestone
      // 2. Previous count < milestone (just crossed)
      // 3. Not already achieved
      if (
        currentWordCount >= milestone.words &&
        lastWordCountRef.current < milestone.words &&
        !achieved.includes(milestone.words)
      ) {
        saveAchievedMilestone(pageId, milestone.words);
        onMilestone(milestone);
        break; // Only trigger one milestone at a time
      }
    }

    lastWordCountRef.current = currentWordCount;
  }, [pageId, blocks, calculateWordCount, onMilestone]);

  return {
    wordCount: calculateWordCount(),
  };
}
