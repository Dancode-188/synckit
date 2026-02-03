/**
 * CRDT-enabled Block component
 *
 * Wraps BlockComponent to use SyncText (Fugue CRDT) for content,
 * providing proper collaborative text editing with automatic
 * conflict resolution.
 *
 * Key differences from regular BlockComponent:
 * - Content is managed by SyncText CRDT, not passed as a prop
 * - Updates use diff algorithm to convert to insert/delete operations
 * - Remote changes merge automatically without overwriting
 */

import { KeyboardEvent, useCallback } from 'react';
import { BlockComponent } from './BlockComponent';
import { useBlockText } from '../hooks/useBlockText';
import { Block } from '../lib/blocks';

interface CRDTBlockComponentProps {
  /** The block metadata (type, id, etc.) */
  block: Block;
  /** Page ID for CRDT namespace */
  pageId: string;
  /** Called when content changes (for slash command detection, etc.) */
  onContentChange?: (content: string) => void;
  /** Key down handler */
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Block index (for numbered lists) */
  blockIndex?: number;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Drag handlers */
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  /** Toggle handlers */
  onToggleBodyChange?: (body: string) => void;
  onToggleStateChange?: (collapsed: boolean) => void;
  /** Delete handler */
  onDelete?: () => void;
}

export function CRDTBlockComponent({
  block,
  pageId,
  onContentChange,
  onKeyDown,
  blockIndex = 0,
  autoFocus = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging = false,
  onToggleBodyChange,
  onToggleStateChange,
  onDelete,
}: CRDTBlockComponentProps) {
  // DIAGNOSTIC: Log what block.content we're passing to useBlockText
  const isPlayground = pageId === 'playground';
  if (isPlayground) {
    console.log(`📦 [CRDTBlock] Rendering block ${block.id.substring(0, 20)}...`, {
      type: block.type,
      blockContent: block.content ? `"${block.content.substring(0, 40)}..."` : '(empty)',
      blockContentLength: block.content?.length || 0,
    });
  }

  // Use CRDT-backed text content
  const {
    content,
    updateContent,
    loading,
    initialized,
    error,
  } = useBlockText(pageId, block.id, block.content);

  // NOTE: We intentionally DO NOT call onContentChange in a useEffect that watches `content`
  // because that would fire for BOTH local and remote changes. We only want to notify
  // for LOCAL changes (user typing), which happens in handleContentChange below.
  // This is important for:
  // - Replay recording: only records local user's edits with correct attribution
  // - Typing indicators: only shows when local user is typing
  // - Contribution tracking: only counts local user's contributions

  // Handle content changes from the editable
  const handleContentChange = useCallback(
    async (newContent: string) => {
      // Skip if still loading - SyncText not ready yet
      if (loading) return;

      try {
        // Update CRDT (will be converted to operations via diff)
        await updateContent(newContent);

        // Also notify parent (for slash commands, etc.)
        if (onContentChange) {
          onContentChange(newContent);
        }
      } catch (error) {
        // Silently handle "not initialized" errors - these happen during race conditions
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('not initialized')) {
          console.log('[CRDTBlockComponent] SyncText not ready yet, skipping update');
          return;
        }
        console.error('[CRDTBlockComponent] Failed to update content:', error);
      }
    },
    [updateContent, onContentChange, loading]
  );

  // Show loading state while CRDT initializes
  if (loading) {
    return (
      <div className="py-2 px-2 -mx-2 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  // DIAGNOSTIC: Log what content value useBlockText actually returned
  if (isPlayground) {
    console.log(`🎯 [CRDTBlock] AFTER useBlockText ${block.id.substring(0, 20)}...`, {
      loading,
      initialized,
      crdtContent: content ? `"${content.substring(0, 40)}..."` : '(empty)',
      crdtContentLength: content?.length || 0,
      error: error?.message || null,
    });
  }

  // Create a block with CRDT-backed content
  const blockWithCRDTContent: Block = {
    ...block,
    content: content, // Use CRDT content instead of block.content
  };

  return (
    <BlockComponent
      block={blockWithCRDTContent}
      onContentChange={handleContentChange}
      onKeyDown={onKeyDown}
      blockIndex={blockIndex}
      autoFocus={autoFocus}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      isDragging={isDragging}
      onToggleBodyChange={onToggleBodyChange}
      onToggleStateChange={onToggleStateChange}
      onDelete={onDelete}
    />
  );
}
