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
import { parseMarkdown, htmlToMarkdown } from '../lib/markdown';

interface CRDTContentEditableProps {
  /** Current content (from CRDT) */
  content: string;
  /** Insert text at position */
  onInsert: (position: number, text: string) => Promise<void>;
  /** Delete text at position */
  onDelete: (position: number, length: number) => Promise<void>;
  /** Sync content after DOM changes (formatting) - converts DOM to markdown and syncs */
  onContentSync?: (content: string) => Promise<void>;
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
 * Get the selection range (start and end offsets) within a contenteditable element
 */
function getSelectionRange(element: HTMLElement): { start: number; end: number } {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { start: 0, end: 0 };

  const range = selection.getRangeAt(0);

  // Get start position
  const startRange = range.cloneRange();
  startRange.selectNodeContents(element);
  startRange.setEnd(range.startContainer, range.startOffset);
  const start = startRange.toString().length;

  // Get end position
  const endRange = range.cloneRange();
  endRange.selectNodeContents(element);
  endRange.setEnd(range.endContainer, range.endOffset);
  const end = endRange.toString().length;

  return { start, end };
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
  onContentSync,
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
  // Track selection at composition start for proper IME handling
  const compositionSelectionRef = useRef<{ start: number; end: number } | null>(null);

  // Update content when it changes externally (from CRDT sync)
  // CRITICAL: We MUST update the DOM even while focused, otherwise the DOM and CRDT
  // diverge, causing incorrect operations. We preserve cursor position to prevent jumping.
  useEffect(() => {
    if (!ref.current) return;

    const parsedHtml = parseMarkdown(content);

    // Skip if content hasn't actually changed
    if (ref.current.innerHTML === parsedHtml) {
      lastContentRef.current = content;
      return;
    }

    const isCurrentlyFocused = document.activeElement === ref.current;

    if (isCurrentlyFocused) {
      // Save cursor position before updating
      const selection = window.getSelection();

      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        // Calculate absolute offset from start of content using TreeWalker
        const walker = document.createTreeWalker(
          ref.current,
          NodeFilter.SHOW_TEXT,
          null
        );
        let absoluteOffset = 0;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (node === range.startContainer) {
            absoluteOffset += range.startOffset;
            break;
          }
          absoluteOffset += (node.textContent?.length || 0);
        }

        // Update innerHTML
        ref.current.innerHTML = parsedHtml;
        lastContentRef.current = content;

        // Restore cursor position using absolute offset
        try {
          const newWalker = document.createTreeWalker(
            ref.current,
            NodeFilter.SHOW_TEXT,
            null
          );
          let currentOffset = 0;
          let targetNode: Node | null = null;
          let targetOffset = 0;

          while ((node = newWalker.nextNode())) {
            const nodeLength = node.textContent?.length || 0;
            if (currentOffset + nodeLength >= absoluteOffset) {
              targetNode = node;
              targetOffset = absoluteOffset - currentOffset;
              break;
            }
            currentOffset += nodeLength;
          }

          if (targetNode) {
            const newRange = document.createRange();
            newRange.setStart(targetNode, Math.min(targetOffset, targetNode.textContent?.length || 0));
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        } catch (e) {
          // If cursor restoration fails, place at end
          const newRange = document.createRange();
          newRange.selectNodeContents(ref.current);
          newRange.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(newRange);
        }
      } else {
        // No selection, just update
        ref.current.innerHTML = parsedHtml;
        lastContentRef.current = content;
      }
    } else {
      // Not focused - simple update
      ref.current.innerHTML = parsedHtml;
      lastContentRef.current = content;
    }
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

        // Formatting operations - let browser apply, then sync via callback
        case 'formatBold':
        case 'formatItalic':
        case 'formatUnderline':
        case 'formatStrikeThrough': {
          // Let the browser apply the formatting, then sync on next frame
          if (onContentSync && ref.current) {
            requestAnimationFrame(async () => {
              if (ref.current) {
                const markdown = htmlToMarkdown(ref.current);
                await onContentSync(markdown);
              }
            });
          }
          break;
        }

        default: {
          // For unknown operations, let them happen and sync afterward
          break;
        }
      }
    },
    [onInsert, onDelete, onContentSync]
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
    // Save selection state at composition start - needed for replacement
    if (ref.current) {
      compositionSelectionRef.current = getSelectionRange(ref.current);
    }
  }, []);

  const handleCompositionEnd = useCallback(
    async (e: React.CompositionEvent<HTMLDivElement>) => {
      isComposingRef.current = false;

      // After composition ends, sync the composed text
      if (ref.current) {
        const composedText = e.data;

        if (composedText) {
          pendingOperationRef.current = true;

          // Use saved selection from composition start
          const savedSelection = compositionSelectionRef.current;
          if (savedSelection && savedSelection.end > savedSelection.start) {
            // Text was selected when composition started - delete it first
            await onDelete(savedSelection.start, savedSelection.end - savedSelection.start);
            // Insert composed text at start of former selection
            await onInsert(savedSelection.start, composedText);
            cursorPositionRef.current = savedSelection.start + composedText.length;
          } else {
            // No selection - insert at saved position
            const insertPos = savedSelection?.start ?? getCursorPosition(ref.current) - composedText.length;
            await onInsert(insertPos, composedText);
            cursorPositionRef.current = insertPos + composedText.length;
          }

          pendingOperationRef.current = false;
          compositionSelectionRef.current = null;
        }
      }
    },
    [onInsert, onDelete]
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
