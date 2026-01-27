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
          await text.init();

          if (!mounted) return;

          textRef.current = text;
          initializedRef.current = true;

          // If text is empty and we have initial content, set it
          const currentContent = text.get();
          if (currentContent === '' && initialContent) {
            await text.insert(0, initialContent);
          }

          // Set initial content
          setContent(text.get());
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
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
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

    const currentContent = textRef.current.get();

    // Skip if content hasn't changed
    if (currentContent === newContent) {
      return;
    }

    // Compute the operations needed to transform current to new
    const operations = computeTextDiff(currentContent, newContent);

    // Apply operations to SyncText
    for (const op of operations) {
      if (op.type === 'delete' && op.length !== undefined) {
        await textRef.current.delete(op.position, op.length);
      } else if (op.type === 'insert' && op.text !== undefined) {
        await textRef.current.insert(op.position, op.text);
      }
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
