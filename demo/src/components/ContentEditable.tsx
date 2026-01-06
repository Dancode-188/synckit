/**
 * ContentEditable component
 * Controlled contenteditable with proper React integration
 */

import { useRef, useEffect, KeyboardEvent } from 'react';

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
  const lastContentRef = useRef(content);

  // Update DOM when content changes externally (from sync)
  useEffect(() => {
    if (ref.current && lastContentRef.current !== content) {
      const selection = window.getSelection();
      const currentNode = selection?.anchorNode;
      const currentOffset = selection?.anchorOffset || 0;

      // Check if cursor is inside this element
      const isInside = currentNode ? ref.current.contains(currentNode) : false;

      ref.current.textContent = content;
      lastContentRef.current = content;

      // Restore cursor position if it was inside
      if (isInside && currentNode && selection) {
        try {
          const range = document.createRange();
          const textNode = ref.current.firstChild;

          if (textNode) {
            const offset = Math.min(currentOffset, textNode.textContent?.length || 0);
            range.setStart(textNode, offset);
            range.setEnd(textNode, offset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } catch (error) {
          // Cursor restoration failed, ignore
        }
      }
    }
  }, [content]);

  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();

      // Move cursor to end
      const range = document.createRange();
      const selection = window.getSelection();
      if (ref.current.firstChild) {
        range.setStart(ref.current.firstChild, ref.current.textContent?.length || 0);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, [autoFocus]);

  const handleInput = () => {
    if (ref.current) {
      const newContent = ref.current.textContent || '';
      lastContentRef.current = newContent;
      onChange(newContent);
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
      onKeyDown={handleKeyDown}
      className={className}
      data-placeholder={placeholder}
      style={{
        outline: 'none',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {content}
    </div>
  );
}
