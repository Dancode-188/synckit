/**
 * useWordWallPresence - Real-time presence for Word Wall
 *
 * Provides Figma-style multiplayer awareness:
 * - See other visitors' cursors in real-time
 * - Track who's hovering which word
 * - Show viewer count
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { SyncKit } from '@synckit-js/sdk';
import { getUserIdentity } from '../lib/user';

// ============================================================================
// Types
// ============================================================================

export interface RemoteUser {
  clientId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  hoveredWord: string | null;
  lastActivity: number;
}

interface WordWallPresenceState {
  user: { name: string; color: string };
  cursor: { x: number; y: number } | null;
  hoveredWord: string | null;
  lastActivity: number;
}

interface UseWordWallPresenceProps {
  synckit: SyncKit;
  documentId: string;
}

interface UseWordWallPresenceReturn {
  remoteUsers: RemoteUser[];
  localUser: { name: string; color: string };
  viewerCount: number;
  updateCursor: (cursor: { x: number; y: number } | null) => void;
  updateHoveredWord: (slug: string | null) => void;
}

// ============================================================================
// Throttle Helper
// ============================================================================

function throttle<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, delay - timeSinceLastCall);
    }
  }) as T;
}

// ============================================================================
// Hook
// ============================================================================

export function useWordWallPresence({
  synckit,
  documentId,
}: UseWordWallPresenceProps): UseWordWallPresenceReturn {
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Client ID for this session
  const clientIdRef = useRef<string>(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('localwrite:client-id') || crypto.randomUUID()
      : crypto.randomUUID()
  );

  // Store client ID
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('localwrite:client-id', clientIdRef.current);
    }
  }, []);

  // User identity (deterministic from client ID)
  const localUser = useMemo(
    () => getUserIdentity(clientIdRef.current),
    []
  );

  // Awareness instance ref
  const awarenessRef = useRef<any>(null);

  // Local state ref (for merging updates)
  const localStateRef = useRef<WordWallPresenceState>({
    user: { name: localUser.name, color: localUser.color },
    cursor: null,
    hoveredWord: null,
    lastActivity: Date.now(),
  });

  // Initialize awareness
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    async function init() {
      try {
        const awareness = synckit.getAwareness(documentId);
        awarenessRef.current = awareness;

        await awareness.init();

        if (!mounted) return;

        // Set initial local state
        const initialState: WordWallPresenceState = {
          user: { name: localUser.name, color: localUser.color },
          cursor: null,
          hoveredWord: null,
          lastActivity: Date.now(),
        };
        localStateRef.current = initialState;
        await awareness.setLocalState(initialState as unknown as Record<string, unknown>);

        // Subscribe to awareness changes
        unsubscribe = awareness.subscribe(() => {
          if (!mounted) return;

          const states = awareness.getStates();
          const localClientId = awareness.getClientId();

          // Convert to RemoteUser array (excluding self)
          const users: RemoteUser[] = [];

          states.forEach((awarenessState: any, clientId: string) => {
            if (clientId === localClientId) return;

            // User data is nested inside awarenessState.state
            const userState = awarenessState?.state as WordWallPresenceState | undefined;
            if (!userState || !userState.user) return;

            // Filter out stale users (no activity in 30 seconds)
            const lastActivity = userState.lastActivity || 0;
            if (Date.now() - lastActivity > 30000) return;

            users.push({
              clientId,
              name: userState.user.name || 'Anonymous',
              color: userState.user.color || '#888888',
              cursor: userState.cursor || null,
              hoveredWord: userState.hoveredWord || null,
              lastActivity,
            });
          });

          setRemoteUsers(users);
        });

        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize word wall presence:', error);
      }
    }

    init();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [synckit, documentId, localUser]);

  // Update local state helper
  const updateLocalState = useCallback(
    async (partial: Partial<WordWallPresenceState>) => {
      if (!awarenessRef.current || !isInitialized) return;

      const newState: WordWallPresenceState = {
        ...localStateRef.current,
        ...partial,
        lastActivity: Date.now(),
      };
      localStateRef.current = newState;

      try {
        await awarenessRef.current.setLocalState(newState as unknown as Record<string, unknown>);
      } catch (error) {
        // Ignore errors (might happen during unmount)
      }
    },
    [isInitialized]
  );

  // Throttled cursor update (50ms = 20fps)
  const updateCursor = useMemo(
    () =>
      throttle((cursor: { x: number; y: number } | null) => {
        updateLocalState({ cursor });
      }, 50),
    [updateLocalState]
  );

  // Hovered word update (not throttled, but only updates on change)
  const hoveredWordRef = useRef<string | null>(null);
  const updateHoveredWord = useCallback(
    (slug: string | null) => {
      if (hoveredWordRef.current === slug) return;
      hoveredWordRef.current = slug;
      updateLocalState({ hoveredWord: slug });
    },
    [updateLocalState]
  );

  // Viewer count (self + remote users)
  const viewerCount = remoteUsers.length + 1;

  return {
    remoteUsers,
    localUser,
    viewerCount,
    updateCursor,
    updateHoveredWord,
  };
}
