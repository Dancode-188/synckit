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
  const isComposingRef = useRef(false);

  // Update content when it changes externally (not during user typing)
  useEffect(() => {
    if (ref.current && ref.current.textContent !== content) {
      // Only update if element is not focused (external change)
      if (document.activeElement !== ref.current) {
        ref.current.textContent = content;
      }
    }
  }, [content]); // Run when content prop changes

  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();

      // Move cursor to end
      const range = document.createRange();
      const selection = window.getSelection();
      const textNode = ref.current.firstChild;

      if (textNode) {
        const length = textNode.textContent?.length || 0;
        range.setStart(textNode, length);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, [autoFocus]);

  const handleInput = () => {
    if (ref.current && !isComposingRef.current) {
      const newContent = ref.current.textContent || '';
      onChange(newContent);
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    if (ref.current) {
      const newContent = ref.current.textContent || '';
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
