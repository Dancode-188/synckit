/**
 * Block component
 * Renders different block types with appropriate styling
 */

import { KeyboardEvent, useState } from 'react';
import { ContentEditable } from './ContentEditable';
import { Block } from '../lib/blocks';
import { BLOCK_TYPES } from '../lib/constants';

interface BlockComponentProps {
  block: Block;
  onContentChange: (content: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  blockIndex?: number;
  autoFocus?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDragging?: boolean;
}

export function BlockComponent({
  block,
  onContentChange,
  onKeyDown,
  blockIndex = 0,
  autoFocus = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging = false,
}: BlockComponentProps) {
  // Local state for TODO checkbox
  const [isChecked, setIsChecked] = useState(
    block.type === BLOCK_TYPES.TODO && block.content.startsWith('[x] ')
  );

  // Handle TODO checkbox toggle
  const handleTodoToggle = () => {
    const newChecked = !isChecked;
    setIsChecked(newChecked);

    // Update content to reflect checked state
    const contentWithoutCheckbox = block.content.replace(/^\[([ x])\]\s/, '');
    const newContent = `[${newChecked ? 'x' : ' '}] ${contentWithoutCheckbox}`;
    onContentChange(newContent);
  };

  // Render TODO block with checkbox
  if (block.type === BLOCK_TYPES.TODO) {
    const contentWithoutCheckbox = block.content.replace(/^\[([ x])\]\s/, '');

    return (
      <div
        className={`group relative flex items-start gap-2 py-1 transition-opacity ${isDragging ? 'opacity-50' : 'opacity-100'}`}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        {/* Checkbox */}
        <button
          onClick={handleTodoToggle}
          className="mt-1 w-4 h-4 rounded border-2 border-gray-300 flex items-center justify-center hover:border-primary-500 transition-colors flex-shrink-0"
          style={{ marginTop: '0.2rem' }}
        >
          {isChecked && (
            <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Content */}
        <ContentEditable
          content={contentWithoutCheckbox}
          onChange={(content) => {
            const newContent = `[${isChecked ? 'x' : ' '}] ${content}`;
            onContentChange(newContent);
          }}
          onKeyDown={onKeyDown}
          placeholder="Todo"
          className={`flex-1 text-base ${isChecked ? 'text-gray-500 line-through' : 'text-gray-900'} min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400`}
          autoFocus={autoFocus}
        />

        {/* Hover handle */}
        <DragHandle />
      </div>
    );
  }

  // Render numbered list with number
  if (block.type === BLOCK_TYPES.NUMBERED_LIST) {
    return (
      <div
        className={`group relative flex items-start gap-3 py-1 transition-opacity ${isDragging ? 'opacity-50' : 'opacity-100'}`}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        {/* Number */}
        <span className="text-gray-500 font-medium select-none flex-shrink-0" style={{ minWidth: '1.5rem' }}>
          {blockIndex + 1}.
        </span>

        {/* Content */}
        <ContentEditable
          content={block.content}
          onChange={onContentChange}
          onKeyDown={onKeyDown}
          placeholder="List item"
          className="flex-1 text-base text-gray-900 min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
          autoFocus={autoFocus}
        />

        {/* Hover handle */}
        <DragHandle />
      </div>
    );
  }

  // Get className and placeholder for other block types
  const getBlockStyles = () => {
    switch (block.type) {
      case BLOCK_TYPES.HEADING_1:
        return {
          className: 'text-4xl font-bold text-gray-900 py-2',
          placeholder: 'Heading 1',
        };
      case BLOCK_TYPES.HEADING_2:
        return {
          className: 'text-3xl font-bold text-gray-900 py-2',
          placeholder: 'Heading 2',
        };
      case BLOCK_TYPES.HEADING_3:
        return {
          className: 'text-2xl font-bold text-gray-900 py-1',
          placeholder: 'Heading 3',
        };
      case BLOCK_TYPES.BULLETED_LIST:
        return {
          className: 'text-base text-gray-900 py-1 pl-6 relative before:content-["•"] before:absolute before:left-0 before:text-gray-500 before:font-bold',
          placeholder: 'List item',
        };
      case BLOCK_TYPES.CODE:
        return {
          className: 'text-sm font-mono bg-gray-100 text-gray-900 py-3 px-4 rounded-md border border-gray-200',
          placeholder: 'Code',
        };
      case BLOCK_TYPES.QUOTE:
        return {
          className: 'text-base text-gray-700 italic py-2 pl-4 border-l-4 border-primary-400',
          placeholder: 'Quote',
        };
      case BLOCK_TYPES.PARAGRAPH:
      default:
        return {
          className: 'text-base text-gray-900 py-1',
          placeholder: "Type '/' for commands",
        };
    }
  };

  const { className, placeholder } = getBlockStyles();

  return (
    <div
      className={`group relative transition-opacity ${isDragging ? 'opacity-50' : 'opacity-100'}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Block content */}
      <ContentEditable
        content={block.content}
        onChange={onContentChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`${className} min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400`}
        autoFocus={autoFocus}
      />

      {/* Hover handle */}
      <DragHandle />
    </div>
  );
}

// Drag handle component (reusable)
function DragHandle() {
  return (
    <div className="absolute left-0 top-0 -ml-8 opacity-0 group-hover:opacity-100 transition-opacity">
      <button className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded cursor-grab active:cursor-grabbing">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>
    </div>
  );
}
