/**
 * Replay System - Core types and utilities
 * Records and replays document editing sessions
 */

export interface RecordedOperation {
  id: string;
  timestamp: number;
  type: 'insert' | 'delete' | 'snapshot';
  blockId: string;
  position?: number;
  content?: string;
  length?: number;
  userId: string;
  userName: string;
  userColor: string;
}

export interface ReplaySession {
  pageId: string;
  startTime: number;
  operations: RecordedOperation[];
  initialSnapshot: Record<string, string>; // blockId -> content
}

const STORAGE_KEY_PREFIX = 'localwrite:replay:';
const MAX_OPERATIONS = 500;
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function getStorageKey(pageId: string): string {
  return `${STORAGE_KEY_PREFIX}${pageId}`;
}

export function loadReplaySession(pageId: string): ReplaySession | null {
  try {
    const stored = localStorage.getItem(getStorageKey(pageId));
    if (!stored) return null;

    const session = JSON.parse(stored) as ReplaySession;

    // Check if session is too old
    if (Date.now() - session.startTime > MAX_AGE_MS) {
      localStorage.removeItem(getStorageKey(pageId));
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function saveReplaySession(session: ReplaySession): void {
  try {
    // Trim operations if too many
    if (session.operations.length > MAX_OPERATIONS) {
      session.operations = session.operations.slice(-MAX_OPERATIONS);
    }
    localStorage.setItem(getStorageKey(session.pageId), JSON.stringify(session));
  } catch {
    // Storage full or other error - silently fail
  }
}

export function clearReplaySession(pageId: string): void {
  try {
    localStorage.removeItem(getStorageKey(pageId));
  } catch {
    // Silently fail
  }
}

export function createReplaySession(pageId: string, initialSnapshot: Record<string, string>): ReplaySession {
  return {
    pageId,
    startTime: Date.now(),
    operations: [],
    initialSnapshot,
  };
}

export function addOperation(session: ReplaySession, operation: Omit<RecordedOperation, 'id' | 'timestamp'>): void {
  session.operations.push({
    ...operation,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  });
}

/**
 * Reconstruct document state at a given operation index
 */
export function reconstructState(
  session: ReplaySession,
  upToIndex: number
): Record<string, string> {
  const state = { ...session.initialSnapshot };

  for (let i = 0; i <= upToIndex && i < session.operations.length; i++) {
    const op = session.operations[i];

    if (op.type === 'snapshot') {
      // Full snapshot replaces content
      if (op.content !== undefined) {
        state[op.blockId] = op.content;
      }
    } else if (op.type === 'insert' && op.content !== undefined && op.position !== undefined) {
      const current = state[op.blockId] || '';
      state[op.blockId] = current.slice(0, op.position) + op.content + current.slice(op.position);
    } else if (op.type === 'delete' && op.position !== undefined && op.length !== undefined) {
      const current = state[op.blockId] || '';
      state[op.blockId] = current.slice(0, op.position) + current.slice(op.position + op.length);
    }
  }

  return state;
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `0:${remainingSeconds.toString().padStart(2, '0')}`;
}
