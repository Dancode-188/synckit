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
  onToggleBodyChange?: (body: string) => void;
  onToggleStateChange?: (collapsed: boolean) => void;
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
  onToggleBodyChange,
  onToggleStateChange,
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
        className={`group relative flex items-start gap-2 py-1.5 px-2 -mx-2 rounded-md transition-all duration-150 ${
          isDragging ? 'opacity-50' : 'opacity-100 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        {/* Checkbox */}
        <button
          onClick={handleTodoToggle}
          className="mt-1 w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center hover:border-primary-500 hover:scale-110 active:scale-95 transition-all duration-150 flex-shrink-0"
          style={{ marginTop: '0.2rem' }}
        >
          {isChecked && (
            <svg className="w-3 h-3 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          className={`flex-1 text-base ${isChecked ? 'text-gray-500 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'} min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-600`}
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
        className={`group relative flex items-start gap-3 py-1.5 px-2 -mx-2 rounded-md transition-all duration-150 ${
          isDragging ? 'opacity-50' : 'opacity-100 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        {/* Number */}
        <span className="text-gray-500 dark:text-gray-400 font-medium select-none flex-shrink-0" style={{ minWidth: '1.5rem' }}>
          {blockIndex + 1}.
        </span>

        {/* Content */}
        <ContentEditable
          content={block.content}
          onChange={onContentChange}
          onKeyDown={onKeyDown}
          placeholder="List item"
          className="flex-1 text-base text-gray-900 dark:text-gray-100 min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-600"
          autoFocus={autoFocus}
        />

        {/* Hover handle */}
        <DragHandle />
      </div>
    );
  }

  // Render callout blocks with icon and colored background
  if (
    block.type === BLOCK_TYPES.CALLOUT_INFO ||
    block.type === BLOCK_TYPES.CALLOUT_WARNING ||
    block.type === BLOCK_TYPES.CALLOUT_ERROR ||
    block.type === BLOCK_TYPES.CALLOUT_SUCCESS
  ) {
    const calloutStyles = {
      [BLOCK_TYPES.CALLOUT_INFO]: {
        icon: 'ℹ️',
        containerClass: 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-600',
        textClass: 'text-blue-900 dark:text-blue-100',
        placeholder: 'Info callout',
      },
      [BLOCK_TYPES.CALLOUT_WARNING]: {
        icon: '⚠️',
        containerClass: 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 dark:border-yellow-600',
        textClass: 'text-yellow-900 dark:text-yellow-100',
        placeholder: 'Warning callout',
      },
      [BLOCK_TYPES.CALLOUT_ERROR]: {
        icon: '❌',
        containerClass: 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-600',
        textClass: 'text-red-900 dark:text-red-100',
        placeholder: 'Error callout',
      },
      [BLOCK_TYPES.CALLOUT_SUCCESS]: {
        icon: '✅',
        containerClass: 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 dark:border-green-600',
        textClass: 'text-green-900 dark:text-green-100',
        placeholder: 'Success callout',
      },
    };

    const style = calloutStyles[block.type];

    return (
      <div
        className={`group relative transition-all duration-150 ${
          isDragging ? 'opacity-50' : 'opacity-100'
        }`}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        <div className={`${style.containerClass} rounded-lg p-4 flex items-start gap-3`}>
          <span className="text-xl flex-shrink-0">{style.icon}</span>
          <ContentEditable
            content={block.content}
            onChange={onContentChange}
            onKeyDown={onKeyDown}
            placeholder={style.placeholder}
            className={`flex-1 text-base ${style.textClass} min-h-[1.5em] leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:opacity-50`}
            autoFocus={autoFocus}
          />
        </div>

        {/* Hover handle */}
        <DragHandle />
      </div>
    );
  }

  // Render toggle blocks (collapsible sections)
  if (block.type === BLOCK_TYPES.TOGGLE) {
    const isExpanded = !block.collapsed;

    const handleToggle = () => {
      if (onToggleStateChange) {
        onToggleStateChange(!isExpanded);
      }
    };

    return (
      <div
        className={`group relative transition-all duration-150 ${
          isDragging ? 'opacity-50' : 'opacity-100'
        }`}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Toggle header */}
          <div className="flex items-start gap-2 p-3">
            <button
              onClick={handleToggle}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:scale-110 active:scale-95 transition-all duration-200"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <ContentEditable
              content={block.content}
              onChange={onContentChange}
              onKeyDown={onKeyDown}
              placeholder="Toggle title"
              className="flex-1 text-base font-medium text-gray-900 dark:text-gray-100 min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-600"
              autoFocus={autoFocus}
            />
          </div>

          {/* Toggle body (collapsible) */}
          {isExpanded && (
            <div className="px-3 pb-3 pl-10 animate-fade-in">
              <ContentEditable
                content={block.toggleBody || ''}
                onChange={(newBody) => {
                  if (onToggleBodyChange) {
                    onToggleBodyChange(newBody);
                  }
                }}
                onKeyDown={onKeyDown}
                placeholder="Toggle content..."
                className="text-sm text-gray-700 dark:text-gray-300 min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-600"
              />
            </div>
          )}
        </div>

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
          className: 'text-4xl font-bold text-gray-900 dark:text-gray-100 py-3 leading-tight',
          placeholder: 'Heading 1',
        };
      case BLOCK_TYPES.HEADING_2:
        return {
          className: 'text-3xl font-bold text-gray-900 dark:text-gray-100 py-2.5 leading-tight',
          placeholder: 'Heading 2',
        };
      case BLOCK_TYPES.HEADING_3:
        return {
          className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 py-2 leading-tight',
          placeholder: 'Heading 3',
        };
      case BLOCK_TYPES.BULLETED_LIST:
        return {
          className: 'text-base text-gray-900 dark:text-gray-100 py-1 pl-6 relative before:content-["•"] before:absolute before:left-0 before:text-gray-500 dark:before:text-gray-400 before:font-bold',
          placeholder: 'List item',
        };
      case BLOCK_TYPES.CODE:
        return {
          className: 'text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-3 px-4 rounded-md border border-gray-200 dark:border-gray-700 leading-relaxed',
          placeholder: 'Code',
        };
      case BLOCK_TYPES.QUOTE:
        return {
          className: 'text-base text-gray-700 dark:text-gray-300 italic py-2 pl-4 border-l-4 border-primary-400 dark:border-primary-600 leading-relaxed',
          placeholder: 'Quote',
        };
      case BLOCK_TYPES.PARAGRAPH:
      default:
        return {
          className: 'text-base text-gray-900 dark:text-gray-100 py-1 leading-relaxed',
          placeholder: "Type '/' for commands",
        };
    }
  };

  const { className, placeholder } = getBlockStyles();

  return (
    <div
      className={`group relative py-0.5 px-2 -mx-2 rounded-md transition-all duration-150 ${
        isDragging ? 'opacity-50' : 'opacity-100 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
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
        className={`${className} min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-600`}
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
    <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-8 opacity-0 group-hover:opacity-100 transition-all duration-200">
      <button className="w-6 h-6 flex items-center justify-center text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-110 active:scale-95 rounded cursor-grab active:cursor-grabbing transition-all duration-150">
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
