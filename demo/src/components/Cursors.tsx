/**
 * Live Cursors Component
 * Displays real-time cursor positions of other users
 */

import { useEffect, useState, useRef } from 'react';
import type { SyncKit } from '@synckit-js/sdk';
import type { AwarenessState } from '@synckit-js/sdk';
import { getUserIdentity } from '../lib/user';

interface CursorProps {
  synckit: SyncKit;
  pageId: string | undefined;
}

interface CursorPosition {
  x: number;
  y: number;
}

interface TypingState {
  isTyping: boolean;
  lastTypedAt: number;
}

interface UserPresence {
  user?: {
    name: string;
    color: string;
  };
  cursor?: CursorPosition | null;
  typing?: TypingState;
}

export function Cursors({ synckit, pageId }: CursorProps) {
  const [clientId, setClientId] = useState<string>('');
  const [others, setOthers] = useState<AwarenessState[]>([]);
  const awarenessRef = useRef<any>(null);
  const mouseListenerRef = useRef<((e: MouseEvent) => void) | null>(null);
  // Tick state to force re-renders for stale typing indicator cleanup
  const [, setTick] = useState(0);

  // Get client ID on mount
  useEffect(() => {
    const id = localStorage.getItem('localwrite:client-id') || crypto.randomUUID();
    localStorage.setItem('localwrite:client-id', id);
    setClientId(id);
  }, []);

  // Periodically re-render to clear stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      // Only tick if there are others with typing state
      const hasTyping = others.some((other) => {
        const presence = other.state as UserPresence;
        return presence?.typing?.isTyping;
      });
      if (hasTyping) {
        setTick((t) => t + 1);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [others]);

  // Use playground document if no page selected
  const documentId = pageId || 'playground';

  // Generate user identity
  const userIdentity = clientId ? getUserIdentity(clientId) : null;

  // Set up awareness and cursor tracking
  useEffect(() => {
    if (!userIdentity || !documentId) return;

    let mounted = true;

    async function setupAwareness() {
      try {
        // Get awareness instance
        const awareness = synckit.getAwareness(documentId);
        if (!awareness) return;

        await awareness.init();

        if (!mounted) return;

        awarenessRef.current = awareness;

        // Set initial presence
        await awareness.setLocalState({
          user: {
            name: userIdentity!.name,
            color: userIdentity!.color,
          },
          cursor: null,
        });

        // Subscribe to awareness changes
        const unsubscribe = awareness.subscribe(() => {
          if (!mounted) return;

          const allStates = awareness.getStates();
          const localClientId = awareness.getClientId();
          const otherStates = Array.from(allStates.values()).filter(
            (state: AwarenessState) => state.client_id !== localClientId
          );
          setOthers(otherStates);
        });

        // Track mouse movements
        const handleMouseMove = (e: MouseEvent) => {
          if (!mounted || !awareness) return;

          awareness.setLocalState({
            user: {
              name: userIdentity!.name,
              color: userIdentity!.color,
            },
            cursor: {
              x: e.clientX,
              y: e.clientY,
            },
          }).catch((err: Error) => {
            console.error('Failed to update cursor position:', err);
          });
        };

        mouseListenerRef.current = handleMouseMove;
        window.addEventListener('mousemove', handleMouseMove);

        return () => {
          if (mouseListenerRef.current) {
            window.removeEventListener('mousemove', mouseListenerRef.current);
          }
          unsubscribe();
        };
      } catch (error) {
        console.error('Failed to setup awareness:', error);
      }
    }

    const cleanup = setupAwareness();

    return () => {
      mounted = false;

      // Send leave update to remove user from room count
      if (awarenessRef.current) {
        awarenessRef.current.setLocalState(null).catch(() => {});
      }

      if (cleanup) {
        cleanup.then(fn => fn && fn());
      }
      if (mouseListenerRef.current) {
        window.removeEventListener('mousemove', mouseListenerRef.current);
      }
    };
  }, [synckit, documentId, userIdentity]);

  if (!userIdentity) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {/* Render other users' cursors */}
      {others.map((other) => {
        const presence = other.state as UserPresence;
        const cursorPos = presence?.cursor;
        const user = presence?.user;

        // Skip if no cursor position or user info
        if (!cursorPos || !user) {
          return null;
        }

        return (
          <div
            key={other.client_id}
            className="absolute pointer-events-none transition-transform duration-100 ease-out"
            style={{
              left: `${cursorPos.x}px`,
              top: `${cursorPos.y}px`,
              transform: 'translate(-2px, -2px)',
            }}
          >
            {/* Cursor SVG */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
              }}
            >
              <path
                d="M5.65376 12.3673L11.6538 20.3673C12.0949 20.9665 12.9769 21.0885 13.5748 20.646C13.7498 20.5196 13.8923 20.3533 13.9904 20.1616L20.4907 8.16156C20.8878 7.41156 20.6103 6.49062 19.8603 6.09344C19.5592 5.93794 19.2208 5.86791 18.8802 5.89113L5.87968 6.8951C5.0638 6.9564 4.46483 7.69575 4.52613 8.51163C4.55119 8.88189 4.69071 9.23774 4.92626 9.53059L5.65376 12.3673Z"
                fill={user.color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* User name label */}
            <div
              className="absolute top-5 left-5 px-2 py-1 rounded text-xs font-medium text-white whitespace-nowrap"
              style={{
                backgroundColor: user.color,
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              }}
            >
              {user.name}
            </div>

            {/* Typing indicator - show if typing within last 2.5s */}
            {presence?.typing?.isTyping &&
             Date.now() - presence.typing.lastTypedAt < 2500 && (
              <div
                className="absolute top-10 left-5 flex items-center gap-0.5 px-2 py-1 rounded-full"
                style={{
                  backgroundColor: user.color,
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                }}
              >
                <span className="typing-dot" style={{ animationDelay: '0ms' }}>.</span>
                <span className="typing-dot" style={{ animationDelay: '150ms' }}>.</span>
                <span className="typing-dot" style={{ animationDelay: '300ms' }}>.</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
