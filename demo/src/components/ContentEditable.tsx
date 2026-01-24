/**
 * ContentEditable component
 * Controlled contenteditable with proper React integration
 * Supports markdown rendering for WYSIWYG experience
 */

import { useRef, useEffect, KeyboardEvent } from 'react';
import { parseMarkdown, htmlToMarkdown } from '../lib/markdown';

interface ContentEditableProps {
  content: string;
  onChange: (content: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function ContentEditable({
  content,
  onChange,
  onKeyDown,
  placeholder = '',
  className = '',
  autoFocus = false,
}: ContentEditableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastContentRef = useRef<string>(content);

  // Update content when it changes externally (including remote collaborative updates)
  useEffect(() => {
    if (ref.current) {
      const parsedHtml = parseMarkdown(content);

      // Skip if content hasn't actually changed
      if (ref.current.innerHTML === parsedHtml) {
        return;
      }

      const isCurrentlyFocused = document.activeElement === ref.current;

      if (isCurrentlyFocused) {
        // Save cursor position before updating
        const selection = window.getSelection();
        let savedOffset = 0;

        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          // Calculate offset from start of contenteditable
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(ref.current);
          preCaretRange.setEnd(range.startContainer, range.startOffset);
          savedOffset = preCaretRange.toString().length;
        }

        // Update content
        ref.current.innerHTML = parsedHtml;
        lastContentRef.current = content;

        // Restore cursor position
        try {
          const newSelection = window.getSelection();
          if (newSelection) {
            const newRange = document.createRange();

            // Find the text node and offset to place cursor
            let currentOffset = 0;
            let targetNode: Node | null = null;
            let targetOffset = 0;

            const walker = document.createTreeWalker(
              ref.current,
              NodeFilter.SHOW_TEXT,
              null
            );

            let node: Node | null;
            while ((node = walker.nextNode())) {
              const nodeLength = node.textContent?.length || 0;
              if (currentOffset + nodeLength >= savedOffset) {
                targetNode = node;
                targetOffset = savedOffset - currentOffset;
                break;
              }
              currentOffset += nodeLength;
            }

            if (targetNode) {
              newRange.setStart(targetNode, Math.min(targetOffset, targetNode.textContent?.length || 0));
              newRange.collapse(true);
              newSelection.removeAllRanges();
              newSelection.addRange(newRange);
            }
          }
        } catch (e) {
          // If cursor restoration fails, just leave cursor at default position
          console.warn('Could not restore cursor position:', e);
        }
      } else {
        // Not focused - simple update
        ref.current.innerHTML = parsedHtml;
        lastContentRef.current = content;
      }
    }
  }, [content]); // Run when content prop changes

  // Use MutationObserver to reliably detect content changes
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new MutationObserver(() => {
      if (isComposingRef.current) {
        return;
      }
      const markdownContent = htmlToMarkdown(element);
      // Only call onChange if content actually changed (not from prop update)
      if (markdownContent !== lastContentRef.current) {
        lastContentRef.current = markdownContent;
        onChange(markdownContent);
      }
    });

    observer.observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [onChange]);

  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();

      // Move cursor to end - works with both text and HTML content
      const selection = window.getSelection();
      const range = document.createRange();

      // Select all content then collapse to end
      range.selectNodeContents(ref.current);
      range.collapse(false); // false = collapse to end

      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [autoFocus]);

  const handleInput = () => {
    console.log('[CONTENTEDITABLE] handleInput called');
    if (ref.current && !isComposingRef.current) {
      // Convert HTML back to markdown to preserve formatting
      const markdownContent = htmlToMarkdown(ref.current);
      console.log('[CONTENTEDITABLE] Calling onChange with:', markdownContent.substring(0, 50));
      onChange(markdownContent);
    } else {
      console.log('[CONTENTEDITABLE] Skipped - composing or no ref');
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    if (ref.current) {
      const markdownContent = htmlToMarkdown(ref.current);
      onChange(markdownContent);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
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
