/**
 * useWordLayout - Force-directed word layout engine
 *
 * Manages word positioning with:
 * - Collision detection to prevent overlap
 * - Force-directed physics that settles over time
 * - Efficient animation loop that stops when stable
 */

import { useState, useEffect, useRef } from 'react';
import {
  WordNode,
  LAYOUT_CONFIG,
  createWordNode,
  updateLayout,
  isLayoutSettled,
  updateNodeVotes,
} from '../lib/wordLayout';
import type { WordEntry } from '../lib/wordwall';

// ============================================================================
// Types
// ============================================================================

interface UseWordLayoutProps {
  words: WordEntry[];
  width: number;
  height: number;
}

interface UseWordLayoutReturn {
  nodes: WordNode[];
  isSettled: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useWordLayout({
  words,
  width,
  height,
}: UseWordLayoutProps): UseWordLayoutReturn {
  const [nodes, setNodes] = useState<WordNode[]>([]);
  const [isSettled, setIsSettled] = useState(false);

  // Canvas for text measurement
  const measureCanvasRef = useRef<OffscreenCanvas | null>(null);
  const measureCtxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);

  // Animation state
  const frameRef = useRef<number | null>(null);
  const settleCountRef = useRef(0);

  // Previous words for change detection
  const prevWordsRef = useRef<Map<string, WordEntry>>(new Map());

  // Initialize measurement canvas
  useEffect(() => {
    try {
      measureCanvasRef.current = new OffscreenCanvas(1, 1);
      measureCtxRef.current = measureCanvasRef.current.getContext('2d');
    } catch {
      // Fallback for browsers without OffscreenCanvas
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      measureCtxRef.current = canvas.getContext('2d') as any;
    }
  }, []);

  // Sync words to nodes
  useEffect(() => {
    const ctx = measureCtxRef.current;
    if (!ctx || width === 0 || height === 0) return;

    const currentSlugs = new Set(words.map((w) => w.slug));
    const prevWords = prevWordsRef.current;

    setNodes((prev) => {
      let newNodes = [...prev];
      let hasChanges = false;

      // Update existing nodes or add new ones
      for (const word of words) {
        const existingIndex = newNodes.findIndex((n) => n.id === word.slug);

        if (existingIndex === -1) {
          // New word - create node
          const newNode = createWordNode(word, ctx, width, height, newNodes);
          newNodes.push(newNode);
          hasChanges = true;
        } else {
          // Existing word - check for vote changes
          const existing = newNodes[existingIndex];
          const prevWord = prevWords.get(word.slug);

          if (prevWord && prevWord.votes !== word.votes) {
            // Votes changed - update size and mark for re-layout
            newNodes[existingIndex] = updateNodeVotes(existing, word.votes, ctx);
            hasChanges = true;
          }
        }
      }

      // Remove deleted words
      const filtered = newNodes.filter((n) => currentSlugs.has(n.id));
      if (filtered.length !== newNodes.length) {
        hasChanges = true;
      }

      if (hasChanges) {
        // Mark all nodes as unsettled to trigger re-layout
        return filtered.map((n) => ({
          ...n,
          isSettled: false,
        }));
      }

      return filtered;
    });

    // Update previous words map
    prevWordsRef.current = new Map(words.map((w) => [w.slug, w]));

    // Trigger re-layout
    setIsSettled(false);
    settleCountRef.current = 0;
  }, [words, width, height]);

  // Animation loop
  useEffect(() => {
    if (isSettled || width === 0 || height === 0) {
      return;
    }

    const animate = () => {
      setNodes((prev) => {
        if (prev.length === 0) {
          setIsSettled(true);
          return prev;
        }

        const updated = updateLayout(prev, width, height);

        // Check if layout has settled
        if (isLayoutSettled(updated)) {
          settleCountRef.current++;

          if (settleCountRef.current >= LAYOUT_CONFIG.settleFrames) {
            setIsSettled(true);
            // Mark all nodes as settled
            return updated.map((n) => ({ ...n, isSettled: true }));
          }
        } else {
          settleCountRef.current = 0;
        }

        return updated;
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isSettled, width, height]);

  return { nodes, isSettled };
}
