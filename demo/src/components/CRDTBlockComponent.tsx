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

import { KeyboardEvent, useCallback, useEffect, useRef } from 'react';
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
  // Use CRDT-backed text content
  const {
    content,
    updateContent,
    loading,
    initialized,
  } = useBlockText(pageId, block.id, block.content);

  // Track last notified content to avoid duplicate notifications
  const lastNotifiedContentRef = useRef(content);

  // Notify parent when content changes (for slash commands, etc.)
  useEffect(() => {
    if (initialized && content !== lastNotifiedContentRef.current) {
      lastNotifiedContentRef.current = content;
      if (onContentChange) {
        onContentChange(content);
      }
    }
  }, [content, initialized, onContentChange]);

  // Handle content changes from the editable
  const handleContentChange = useCallback(
    async (newContent: string) => {
      // Skip if still loading - SyncText not ready yet
      if (loading) {
        console.log('[CRDTBlockComponent] Skipping update - still loading');
        return;
      }

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
