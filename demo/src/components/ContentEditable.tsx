/**
 * ContentEditable component
 * Controlled contenteditable with proper React integration
 * Supports markdown rendering for WYSIWYG experience
 */

import { useRef, useEffect, KeyboardEvent, FocusEvent } from 'react';
import { parseMarkdown, htmlToMarkdown } from '../lib/markdown';

/**
 * Normalize HTML for comparison by removing insignificant differences
 * This ensures local DOM changes match parsed markdown output
 */
function normalizeHtml(html: string): string {
  // Create a temporary element to normalize the HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  // Return normalized innerHTML (browser handles whitespace/attribute normalization)
  return temp.innerHTML;
}

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

  // Flag to prevent MutationObserver feedback loop during programmatic DOM updates
  const isUpdatingDomRef = useRef(false);

  // Track if this is the first mount (DOM needs initial population)
  const isFirstMountRef = useRef(true);

  // Track when a local DOM change was made (formatting, typing, etc.)
  // When set, useEffect should skip DOM updates since DOM is already correct
  const pendingLocalChangeRef = useRef(false);

  // Update content when it changes (local edits, remote CRDT updates, or server sync)
  useEffect(() => {
    if (!ref.current) return;

    // Skip DOM updates for local changes - the DOM is already correct
    // This prevents cursor jumping when formatting is applied via Editor.tsx
    if (pendingLocalChangeRef.current) {
      pendingLocalChangeRef.current = false;
      lastContentRef.current = content;
      return;
    }

    const parsedHtml = parseMarkdown(content);

    // Normalize both for comparison (handles browser-specific HTML formatting differences)
    const normalizedDom = normalizeHtml(ref.current.innerHTML);
    const normalizedParsed = normalizeHtml(parsedHtml);

    // Skip if DOM already has equivalent content (handles redundant updates)
    if (normalizedDom === normalizedParsed) {
      lastContentRef.current = content;
      return;
    }

    // First mount: populate DOM directly
    if (isFirstMountRef.current && content) {
      isFirstMountRef.current = false;
      isUpdatingDomRef.current = true;
      ref.current.innerHTML = parsedHtml;
      queueMicrotask(() => { isUpdatingDomRef.current = false; });
      lastContentRef.current = content;
      return;
    }

    // Update DOM with cursor preservation (for remote updates only)
    updateDomWithCursorPreservation(ref.current, parsedHtml, content);
  }, [content]);

  // Helper to update DOM while preserving cursor position
  // Sets isUpdatingDomRef to prevent MutationObserver feedback loop
  const updateDomWithCursorPreservation = (element: HTMLDivElement, parsedHtml: string, rawContent: string) => {
    // Skip if content hasn't actually changed (use normalized comparison)
    if (normalizeHtml(element.innerHTML) === normalizeHtml(parsedHtml)) {
      lastContentRef.current = rawContent;
      return;
    }

    const isCurrentlyFocused = document.activeElement === element;

    // Prevent MutationObserver from triggering during programmatic update
    isUpdatingDomRef.current = true;

    try {
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
            element,
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
          element.innerHTML = parsedHtml;
          lastContentRef.current = rawContent;

          // Restore cursor position using absolute offset
          try {
            const newWalker = document.createTreeWalker(
              element,
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
            } else {
              // targetNode is null - cursor position exceeded new text length
              // Place cursor at end of content
              const newRange = document.createRange();
              newRange.selectNodeContents(element);
              newRange.collapse(false);
              selection.removeAllRanges();
              selection.addRange(newRange);
            }
          } catch (e) {
            // If cursor restoration fails, just place at end
            const newRange = document.createRange();
            newRange.selectNodeContents(element);
            newRange.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(newRange);
          }
        } else {
          // No selection, just update
          element.innerHTML = parsedHtml;
          lastContentRef.current = rawContent;
        }
      } else {
        // Not focused - simple update
        element.innerHTML = parsedHtml;
        lastContentRef.current = rawContent;
      }
    } finally {
      queueMicrotask(() => { isUpdatingDomRef.current = false; });
    }
  };

  // Use MutationObserver to reliably detect content changes
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new MutationObserver(() => {
      // Skip during IME composition or programmatic DOM updates
      if (isComposingRef.current || isUpdatingDomRef.current) {
        return;
      }
      const markdownContent = htmlToMarkdown(element);
      // Only call onChange if content actually changed
      if (markdownContent !== lastContentRef.current) {
        // Mark this as a local change so useEffect skips DOM updates
        // (the DOM is already correct - we just need to sync the markdown)
        pendingLocalChangeRef.current = true;
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
      if (markdownContent !== lastContentRef.current) {
        // Mark as local change so useEffect skips DOM updates
        pendingLocalChangeRef.current = true;
        lastContentRef.current = markdownContent;
        onChange(markdownContent);
      }
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

  // Apply markdown formatting when user leaves the field
  const handleBlur = (_e: FocusEvent<HTMLDivElement>) => {
    if (ref.current) {
      const parsedHtml = parseMarkdown(lastContentRef.current);
      if (ref.current.innerHTML !== parsedHtml) {
        isUpdatingDomRef.current = true;
        ref.current.innerHTML = parsedHtml;
        queueMicrotask(() => { isUpdatingDomRef.current = false; });
      }
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
      onBlur={handleBlur}
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
