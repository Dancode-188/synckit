/**
 * Operation Recorder Hook
 * Records document editing operations for replay
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  ReplaySession,
  loadReplaySession,
  saveReplaySession,
  createReplaySession,
  addOperation,
} from '../lib/replay';
import { Block } from '../lib/blocks';

interface UseOperationRecorderProps {
  pageId: string | undefined;
  blocks: Block[];
  userName: string;
  userColor: string;
}

export function useOperationRecorder({
  pageId,
  blocks,
  userName,
  userColor,
}: UseOperationRecorderProps) {
  const sessionRef = useRef<ReplaySession | null>(null);
  const lastContentRef = useRef<Map<string, string>>(new Map());
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize or load session when page changes
  useEffect(() => {
    if (!pageId) {
      sessionRef.current = null;
      lastContentRef.current.clear();
      return;
    }

    // Try to load existing session
    let session = loadReplaySession(pageId);

    if (!session) {
      // Create new session with initial snapshot
      const initialSnapshot: Record<string, string> = {};
      blocks.forEach((block) => {
        initialSnapshot[block.id] = block.content || '';
        lastContentRef.current.set(block.id, block.content || '');
      });
      session = createReplaySession(pageId, initialSnapshot);
    } else {
      // Restore last content tracking
      blocks.forEach((block) => {
        lastContentRef.current.set(block.id, block.content || '');
      });
    }

    sessionRef.current = session;

    return () => {
      // Save session on unmount
      if (sessionRef.current) {
        saveReplaySession(sessionRef.current);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [pageId]); // Only depend on pageId, not blocks

  // Record a content change (called from Editor)
  const recordContentChange = useCallback((blockId: string, newContent: string) => {
    if (!sessionRef.current) return;

    const lastContent = lastContentRef.current.get(blockId) || '';

    // Skip if no change
    if (lastContent === newContent) return;

    // For simplicity, record as a snapshot (full content)
    // A more sophisticated implementation would compute insert/delete ops
    addOperation(sessionRef.current, {
      type: 'snapshot',
      blockId,
      content: newContent,
      userId: 'local',
      userName,
      userColor,
    });

    lastContentRef.current.set(blockId, newContent);

    // Debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (sessionRef.current) {
        saveReplaySession(sessionRef.current);
      }
    }, 2000);
  }, [userName, userColor]);

  // Get current session for replay
  const getSession = useCallback((): ReplaySession | null => {
    return sessionRef.current;
  }, []);

  // Check if there's a recording available
  const hasRecording = useCallback((): boolean => {
    return sessionRef.current !== null && sessionRef.current.operations.length > 0;
  }, []);

  return {
    recordContentChange,
    getSession,
    hasRecording,
  };
}
