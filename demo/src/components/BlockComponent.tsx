/**
 * Block component
 * Renders different block types with appropriate styling
 */

import { KeyboardEvent } from 'react';
import { ContentEditable } from './ContentEditable';
import { Block } from '../lib/blocks';
import { BLOCK_TYPES } from '../lib/constants';

interface BlockComponentProps {
  block: Block;
  onContentChange: (content: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  autoFocus?: boolean;
}

export function BlockComponent({
  block,
  onContentChange,
  onKeyDown,
  autoFocus = false,
}: BlockComponentProps) {
  // Get className and placeholder based on block type
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
          className: 'text-base text-gray-900 py-1 pl-6 relative before:content-["•"] before:absolute before:left-0',
          placeholder: 'List item',
        };
      case BLOCK_TYPES.NUMBERED_LIST:
        return {
          className: 'text-base text-gray-900 py-1 pl-6',
          placeholder: 'List item',
        };
      case BLOCK_TYPES.TODO:
        return {
          className: 'text-base text-gray-900 py-1 pl-6',
          placeholder: 'Todo',
        };
      case BLOCK_TYPES.CODE:
        return {
          className: 'text-sm font-mono bg-gray-100 text-gray-900 py-2 px-3 rounded',
          placeholder: 'Code',
        };
      case BLOCK_TYPES.QUOTE:
        return {
          className: 'text-base text-gray-700 italic py-2 pl-4 border-l-4 border-gray-300',
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
    <div className="group relative">
      {/* Block content */}
      <ContentEditable
        content={block.content}
        onChange={onContentChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`${className} min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400`}
        autoFocus={autoFocus}
      />

      {/* Hover actions - will add drag handle, block type menu, etc. later */}
      <div className="absolute left-0 top-0 -ml-8 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
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
    </div>
  );
}
