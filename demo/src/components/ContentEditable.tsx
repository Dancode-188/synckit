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

  // Update content when it changes externally
  // IMPORTANT: Never update innerHTML while focused - it causes cursor jumping
  // Remote changes will appear when the user unfocuses the block
  useEffect(() => {
    if (ref.current) {
      const isCurrentlyFocused = document.activeElement === ref.current;

      // Don't update innerHTML while user is actively editing
      // This is the only reliable way to prevent cursor jumping
      if (isCurrentlyFocused) {
        lastContentRef.current = content;
        return;
      }

      const parsedHtml = parseMarkdown(content);

      // Skip if content hasn't actually changed
      if (ref.current.innerHTML === parsedHtml) {
        return;
      }

      // Not focused - safe to update innerHTML
      ref.current.innerHTML = parsedHtml;
      lastContentRef.current = content;
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
