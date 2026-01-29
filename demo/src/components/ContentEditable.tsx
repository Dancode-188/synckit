/**
 * ContentEditable component
 * Controlled contenteditable with proper React integration
 * Supports markdown rendering for WYSIWYG experience
 */

import { useRef, useEffect, KeyboardEvent, FocusEvent } from 'react';
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

  // Track if the content change came from local editing
  const isLocalEditRef = useRef(false);

  // Flag to prevent MutationObserver feedback loop during programmatic DOM updates
  const isUpdatingDomRef = useRef(false);

  // Track if this is the first mount (DOM needs initial population)
  const isFirstMountRef = useRef(true);

  // Update content when it changes externally (including remote CRDT updates)
  // For local edits: DON'T update DOM - user's typed content is already visible
  // For remote updates: Apply immediately with cursor preservation for collaboration
  useEffect(() => {
    if (ref.current) {
      if (isLocalEditRef.current) {
        // Local edit: skip DOM update entirely
        // The user's typed content is already in the DOM, no need to re-render
        // Formatting will be applied on blur
        lastContentRef.current = content;
        isLocalEditRef.current = false;
      } else {
        // On first mount, ALWAYS populate DOM - it starts empty!
        const needsInitialPopulation = isFirstMountRef.current && content;

        if (needsInitialPopulation) {
          isFirstMountRef.current = false;
          const parsedHtml = parseMarkdown(content);
          isUpdatingDomRef.current = true;
          ref.current.innerHTML = parsedHtml;
          isUpdatingDomRef.current = false;
          lastContentRef.current = content;
          return;
        }

        // Skip server echoes - if markdown content matches what we have, it's just
        // the server echoing back our own change, no need to update DOM
        if (content === lastContentRef.current) {
          return;
        }

        // Remote update: apply immediately for real-time collaboration feel
        const parsedHtml = parseMarkdown(content);

        // Skip if DOM already has this content
        if (ref.current.innerHTML === parsedHtml) {
          lastContentRef.current = content;
          return;
        }

        updateDomWithCursorPreservation(ref.current, parsedHtml, content);
      }
    }
  }, [content]);

  // Helper to update DOM while preserving cursor position
  // Sets isUpdatingDomRef to prevent MutationObserver feedback loop
  const updateDomWithCursorPreservation = (element: HTMLDivElement, parsedHtml: string, rawContent: string) => {
    // Skip if content hasn't actually changed
    if (element.innerHTML === parsedHtml) {
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
      isUpdatingDomRef.current = false;
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
      // Mark this as a local edit so we can debounce markdown parsing
      isLocalEditRef.current = true;
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
      // Mark this as a local edit
      isLocalEditRef.current = true;
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
        isUpdatingDomRef.current = false;
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
