/**
 * useBlockText hook
 * Manages SyncText (Fugue CRDT) for individual block content
 *
 * This provides proper collaborative text editing with automatic
 * conflict resolution, unlike LWW which loses concurrent edits.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSyncKit } from '../contexts/SyncKitContext';
import { computeTextDiff } from '../lib/textDiff';

export interface UseBlockTextResult {
  /** Current text content */
  content: string;
  /** Insert text at position */
  insert: (position: number, text: string) => Promise<void>;
  /** Delete text at position */
  delete: (position: number, length: number) => Promise<void>;
  /** Update content using diff algorithm - converts to CRDT operations */
  updateContent: (newContent: string) => Promise<void>;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Whether SyncText is initialized */
  initialized: boolean;
}

/**
 * Hook for collaborative block text editing using Fugue CRDT
 *
 * Each block's content is stored in a separate SyncText instance,
 * identified by `${pageId}:text:${blockId}`.
 *
 * @param pageId - The page document ID
 * @param blockId - The block ID within the page
 * @param initialContent - Initial content (used when creating new blocks)
 */
export function useBlockText(
  pageId: string | undefined,
  blockId: string,
  initialContent: string = ''
): UseBlockTextResult {
  const { synckit } = useSyncKit();
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Use refs to track initialization state
  const textRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Document ID for this block's text
  const textDocId = pageId ? `${pageId}:text:${blockId}` : null;

  // Initialize SyncText instance
  useEffect(() => {
    if (!textDocId || !synckit) {
      setLoading(false);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function initialize() {
      // Prevent duplicate initialization
      if (initializedRef.current && textRef.current) {
        return;
      }

      // If already initializing, wait for it
      if (initPromiseRef.current) {
        await initPromiseRef.current;
        return;
      }

      try {
        // Create initialization promise
        initPromiseRef.current = (async () => {
          // Get or create SyncText instance
          // textDocId is guaranteed non-null here due to the guard at the start of useEffect
          const text = synckit.text(textDocId as string);

          // DIAGNOSTIC: Log what initialContent we received
          const isPlayground = textDocId?.startsWith('playground:');
          if (isPlayground) {
            console.log(`🔍 [useBlockText] Initializing ${textDocId}`, {
              initialContent: initialContent ? `"${initialContent.substring(0, 50)}..."` : '(empty)',
              initialContentLength: initialContent?.length || 0,
            });
          }

          await text.init();

          if (!mounted) return;

          textRef.current = text;
          initializedRef.current = true;

          // Wait a moment for any server sync to arrive
          if (isPlayground) {
            // For playground, wait for server sync before checking content
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // Check content after potential sync
          const currentContent = text.get();

          // DIAGNOSTIC: Log SyncText state after init
          if (isPlayground) {
            console.log(`🔍 [useBlockText] After init ${textDocId}`, {
              syncTextContent: currentContent ? `"${currentContent.substring(0, 50)}..."` : '(empty)',
              syncTextLength: currentContent?.length || 0,
              willSeed: currentContent === '' && !!initialContent,
            });
          }

          if (currentContent === '' && initialContent) {
            // SyncText is empty after sync wait - seed it
            // For playground, this means server didn't have content for this block
            // For other pages, this is normal initial seeding
            try {
              await text.insert(0, initialContent);
              if (isPlayground) {
                console.log(`✅ [useBlockText] Seeded ${textDocId} with "${initialContent.substring(0, 30)}..."`);
              }
            } catch (seedErr) {
              // CRITICAL FIX: Don't fail initialization just because persist failed
              // The CRDT state is valid in memory and will sync via WebSocket
              console.warn(`⚠️ [useBlockText] Seed persist failed for ${textDocId}, but CRDT state is valid:`, seedErr);
              // Continue - the content is in memory even if storage failed
            }
          }

          // Set content from SyncText (get fresh state after potential seeding)
          const finalContent = text.get();
          if (isPlayground) {
            console.log(`🔍 [useBlockText] Final state ${textDocId}`, {
              finalContent: finalContent ? `"${finalContent.substring(0, 50)}..."` : '(empty)',
              finalLength: finalContent?.length || 0,
            });
          }
          setContent(finalContent);
          setLoading(false);

          // Subscribe to changes
          unsubscribe = text.subscribe((newContent: string) => {
            if (mounted) {
              setContent(newContent);
            }
          });
        })();

        await initPromiseRef.current;
      } catch (err) {
        // DIAGNOSTIC: Log the full error
        console.error(`❌ [useBlockText] Initialization failed for ${textDocId}:`, err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
          // FALLBACK: If we have initialContent, use it even though init failed
          if (initialContent) {
            console.log(`🔄 [useBlockText] Using initialContent fallback for ${textDocId}`);
            setContent(initialContent);
          }
        }
      } finally {
        initPromiseRef.current = null;
      }
    }

    initialize();

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
      // Note: We don't dispose the SyncText here because it might be reused
      // The SyncKit instance manages cleanup globally
    };
  }, [textDocId, synckit, initialContent]);

  // Insert operation
  const insert = useCallback(async (position: number, text: string) => {
    if (!textRef.current) {
      throw new Error('SyncText not initialized');
    }
    await textRef.current.insert(position, text);
  }, []);

  // Delete operation
  const deleteText = useCallback(async (position: number, length: number) => {
    if (!textRef.current) {
      throw new Error('SyncText not initialized');
    }
    await textRef.current.delete(position, length);
  }, []);

  // Update content using diff algorithm - converts to CRDT operations
  // This is the main method for integrating with ContentEditable
  const updateContent = useCallback(async (newContent: string) => {
    if (!textRef.current) {
      throw new Error('SyncText not initialized');
    }

    // Get current content and compute diff atomically
    const currentContent = textRef.current.get();

    // Skip if content hasn't changed
    if (currentContent === newContent) {
      return;
    }

    // Compute the operations needed to transform current to new
    const operations = computeTextDiff(currentContent, newContent);

    // Use batch mode when there are multiple operations (e.g., delete + insert for formatting)
    // This prevents cross-tab broadcasts between operations, avoiding race conditions
    const useBatch = operations.length > 1;

    if (useBatch) {
      textRef.current.beginBatch();
    }

    try {
      // Apply operations to SyncText
      for (const op of operations) {
        // Re-check current state before each operation to catch race conditions
        const stateBeforeOp = textRef.current.get();

        if (op.type === 'delete' && op.length !== undefined) {
          // Validate position is still valid
          if (op.position + op.length > stateBeforeOp.length) {
            console.warn('[useBlockText] Delete position invalid, aborting remaining ops');
            break;
          }
          await textRef.current.delete(op.position, op.length);
        } else if (op.type === 'insert' && op.text !== undefined) {
          // Validate position is still valid
          const stateAfterPrevOps = textRef.current.get();
          if (op.position > stateAfterPrevOps.length) {
            console.warn('[useBlockText] Insert position invalid, aborting remaining ops');
            break;
          }
          await textRef.current.insert(op.position, op.text);
        }
      }
    } finally {
      // Always end batch to ensure state is broadcast
      if (useBatch) {
        await textRef.current.endBatch();
      }
    }

    // Verify final state matches expected
    const finalContent = textRef.current.get();
    if (finalContent !== newContent) {
      // State diverged - this can happen with concurrent edits
      // Log for debugging but don't throw - CRDT will eventually converge
      console.warn('[useBlockText] Final state diverged from expected', {
        expected: newContent.substring(0, 50),
        actual: finalContent.substring(0, 50),
      });
    }
  }, []);

  return {
    content,
    insert,
    delete: deleteText,
    updateContent,
    loading,
    error,
    initialized: initializedRef.current,
  };
}
