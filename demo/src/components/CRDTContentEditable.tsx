/**
 * CRDT ContentEditable component
 * A contenteditable that captures individual insert/delete operations
 * for proper CRDT integration (Fugue text CRDT)
 *
 * Key differences from regular ContentEditable:
 * - Uses `beforeinput` event to capture exact operations
 * - Calls insert/delete callbacks instead of onChange with full content
 * - Properly handles cursor positions for collaborative editing
 */

import { useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { parseMarkdown } from '../lib/markdown';

interface CRDTContentEditableProps {
  /** Current content (from CRDT) */
  content: string;
  /** Insert text at position */
  onInsert: (position: number, text: string) => Promise<void>;
  /** Delete text at position */
  onDelete: (position: number, length: number) => Promise<void>;
  /** Key down handler for block-level navigation */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Placeholder text */
  placeholder?: string;
  /** CSS class name */
  className?: string;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

/**
 * Get the cursor position (character offset) within a contenteditable element
 */
function getCursorPosition(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.startContainer, range.startOffset);

  // Get text content up to cursor - this gives us the character position
  const textContent = preCaretRange.toString();
  return textContent.length;
}

/**
 * Set the cursor position within a contenteditable element
 */
function setCursorPosition(element: HTMLElement, position: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  // Walk through text nodes to find the right position
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

  let currentPos = 0;
  let node: Node | null = walker.nextNode();

  while (node) {
    const nodeLength = node.textContent?.length || 0;

    if (currentPos + nodeLength >= position) {
      // Found the node - set cursor
      const range = document.createRange();
      range.setStart(node, position - currentPos);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    currentPos += nodeLength;
    node = walker.nextNode();
  }

  // If position is beyond content, put cursor at end
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function CRDTContentEditable({
  content,
  onInsert,
  onDelete,
  onKeyDown,
  placeholder = '',
  className = '',
  autoFocus = false,
}: CRDTContentEditableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastContentRef = useRef(content);
  const pendingOperationRef = useRef(false);
  const cursorPositionRef = useRef<number | null>(null);

  // Update content when it changes externally (from CRDT sync)
  // IMPORTANT: Never update innerHTML while focused - it causes cursor jumping
  useEffect(() => {
    if (!ref.current) return;

    const isCurrentlyFocused = document.activeElement === ref.current;

    // Don't update while user is actively editing - remote changes appear on blur
    if (isCurrentlyFocused) {
      lastContentRef.current = content;
      return;
    }

    const parsedHtml = parseMarkdown(content);

    // Skip if content hasn't actually changed
    if (ref.current.innerHTML === parsedHtml) {
      return;
    }

    // Safe to update - not focused
    ref.current.innerHTML = parsedHtml;
    lastContentRef.current = content;
  }, [content]);

  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();

      // Move cursor to end
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [autoFocus]);

  // Handle beforeinput event to capture operations BEFORE they happen
  const handleBeforeInput = useCallback(
    async (e: InputEvent) => {
      if (!ref.current || isComposingRef.current) return;

      const inputType = e.inputType;
      const data = e.data;

      // Get cursor position before the operation
      const position = getCursorPosition(ref.current);

      // Handle different input types
      switch (inputType) {
        case 'insertText':
        case 'insertFromPaste':
        case 'insertFromDrop': {
          if (data) {
            // Prevent default and handle manually
            e.preventDefault();
            pendingOperationRef.current = true;

            // Insert at cursor position
            await onInsert(position, data);

            // After CRDT updates, we need to restore cursor
            cursorPositionRef.current = position + data.length;
            pendingOperationRef.current = false;
          }
          break;
        }

        case 'insertParagraph':
        case 'insertLineBreak': {
          // Insert newline
          e.preventDefault();
          pendingOperationRef.current = true;

          await onInsert(position, '\n');

          cursorPositionRef.current = position + 1;
          pendingOperationRef.current = false;
          break;
        }

        case 'deleteContentBackward': {
          // Backspace - delete character before cursor
          if (position > 0) {
            e.preventDefault();
            pendingOperationRef.current = true;

            await onDelete(position - 1, 1);

            cursorPositionRef.current = position - 1;
            pendingOperationRef.current = false;
          }
          break;
        }

        case 'deleteContentForward': {
          // Delete key - delete character after cursor
          const contentLength = ref.current.textContent?.length || 0;
          if (position < contentLength) {
            e.preventDefault();
            pendingOperationRef.current = true;

            await onDelete(position, 1);

            cursorPositionRef.current = position;
            pendingOperationRef.current = false;
          }
          break;
        }

        case 'deleteWordBackward':
        case 'deleteSoftLineBackward':
        case 'deleteHardLineBackward': {
          // Word/line deletion backward - calculate range
          const ranges = e.getTargetRanges();
          if (ranges.length > 0) {
            e.preventDefault();
            pendingOperationRef.current = true;

            const range = ranges[0];
            const start = getPositionFromRange(ref.current, range, 'start');
            const end = getPositionFromRange(ref.current, range, 'end');
            const length = end - start;

            if (length > 0) {
              await onDelete(start, length);
            }

            cursorPositionRef.current = start;
            pendingOperationRef.current = false;
          }
          break;
        }

        case 'deleteWordForward':
        case 'deleteSoftLineForward':
        case 'deleteHardLineForward': {
          // Word/line deletion forward
          const ranges = e.getTargetRanges();
          if (ranges.length > 0) {
            e.preventDefault();
            pendingOperationRef.current = true;

            const range = ranges[0];
            const start = getPositionFromRange(ref.current, range, 'start');
            const end = getPositionFromRange(ref.current, range, 'end');
            const length = end - start;

            if (length > 0) {
              await onDelete(start, length);
            }

            cursorPositionRef.current = start;
            pendingOperationRef.current = false;
          }
          break;
        }

        case 'deleteByCut': {
          // Cut operation
          const ranges = e.getTargetRanges();
          if (ranges.length > 0) {
            e.preventDefault();
            pendingOperationRef.current = true;

            const range = ranges[0];
            const start = getPositionFromRange(ref.current, range, 'start');
            const end = getPositionFromRange(ref.current, range, 'end');
            const length = end - start;

            if (length > 0) {
              await onDelete(start, length);
            }

            cursorPositionRef.current = start;
            pendingOperationRef.current = false;
          }
          break;
        }

        case 'insertReplacementText':
        case 'insertFromYank': {
          // Replace selected text
          const ranges = e.getTargetRanges();
          if (ranges.length > 0 && data) {
            e.preventDefault();
            pendingOperationRef.current = true;

            const range = ranges[0];
            const start = getPositionFromRange(ref.current, range, 'start');
            const end = getPositionFromRange(ref.current, range, 'end');
            const length = end - start;

            // Delete selected text first
            if (length > 0) {
              await onDelete(start, length);
            }

            // Insert replacement
            await onInsert(start, data);

            cursorPositionRef.current = start + data.length;
            pendingOperationRef.current = false;
          }
          break;
        }

        // Formatting operations - let them happen naturally but capture result
        case 'formatBold':
        case 'formatItalic':
        case 'formatUnderline':
        case 'formatStrikeThrough': {
          // These are handled at a higher level (keyboard shortcuts)
          // Allow default behavior
          break;
        }

        default: {
          // For unknown operations, let them happen and sync afterward
          // This is a fallback that may cause some cursor issues
          console.log('[CRDTContentEditable] Unhandled inputType:', inputType);
          break;
        }
      }
    },
    [onInsert, onDelete]
  );

  // Restore cursor position after CRDT content update
  useEffect(() => {
    if (ref.current && cursorPositionRef.current !== null && document.activeElement === ref.current) {
      setCursorPosition(ref.current, cursorPositionRef.current);
      cursorPositionRef.current = null;
    }
  }, [content]);

  // Handle composition events (IME input for CJK languages)
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    async (e: React.CompositionEvent<HTMLDivElement>) => {
      isComposingRef.current = false;

      // After composition ends, sync the composed text
      if (ref.current) {
        const position = getCursorPosition(ref.current);
        const composedText = e.data;

        if (composedText) {
          // The text is already in the DOM, so we need to sync it
          // For IME, we use replace strategy since tracking individual changes is complex
          pendingOperationRef.current = true;
          await onInsert(position - composedText.length, composedText);
          cursorPositionRef.current = position;
          pendingOperationRef.current = false;
        }
      }
    },
    [onInsert]
  );

  // Handle key down for block-level navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (onKeyDown) {
        onKeyDown(e);
      }
    },
    [onKeyDown]
  );

  // Attach beforeinput event listener (React doesn't support it natively)
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('beforeinput', handleBeforeInput as any);

    return () => {
      element.removeEventListener('beforeinput', handleBeforeInput as any);
    };
  }, [handleBeforeInput]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      className={className}
      data-placeholder={placeholder}
      style={{
        outline: 'none',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    />
  );
}

/**
 * Get character position from a StaticRange
 */
function getPositionFromRange(
  container: HTMLElement,
  range: StaticRange,
  point: 'start' | 'end'
): number {
  const node = point === 'start' ? range.startContainer : range.endContainer;
  const offset = point === 'start' ? range.startOffset : range.endOffset;

  // Walk through text nodes to calculate position
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

  let currentPos = 0;
  let textNode: Node | null = walker.nextNode();

  while (textNode) {
    if (textNode === node) {
      return currentPos + offset;
    }

    currentPos += textNode.textContent?.length || 0;
    textNode = walker.nextNode();
  }

  // If node is the container itself, use offset directly
  if (node === container) {
    return offset;
  }

  // Fallback: return position based on offset
  return offset;
}
