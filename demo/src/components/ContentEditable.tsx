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

  // Update content when it changes externally (including remote CRDT updates)
  // CRITICAL: We MUST update the DOM even while focused, otherwise the DOM and CRDT
  // diverge, causing the diff algorithm to compute incorrect operations that
  // overwrite remote content. We preserve cursor position to prevent jumping.
  useEffect(() => {
    if (ref.current) {
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
        let savedOffset = 0;
        let savedNode: Node | null = null;

        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          savedOffset = range.startOffset;
          savedNode = range.startContainer;

          // Calculate absolute offset from start of content
          // This helps restore position even when content structure changes
          const walker = document.createTreeWalker(
            ref.current,
            NodeFilter.SHOW_TEXT,
            null
          );
          let absoluteOffset = 0;
          let node: Node | null;
          while ((node = walker.nextNode())) {
            if (node === savedNode) {
              absoluteOffset += savedOffset;
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
            // If cursor restoration fails, just place at end
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
      // Only call onChange if content actually changed
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
    if (ref.current && !isComposingRef.current) {
      // Convert HTML back to markdown to preserve formatting
      const markdownContent = htmlToMarkdown(ref.current);
      onChange(markdownContent);
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
