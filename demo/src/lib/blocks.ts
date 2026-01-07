/**
 * Block system types and utilities
 * Using field-per-block pattern for proper memory management
 */

import { BLOCK_TYPES, BlockType } from './constants';

/**
 * Block data structure
 * Each block is stored as a separate field in the document
 */
export interface Block {
  id: string;
  type: BlockType;
  content: string;
  createdAt: number;
  updatedAt: number;
  // Optional fields for toggle blocks
  toggleBody?: string;  // Collapsible content
  collapsed?: boolean;  // Whether toggle is collapsed
}

/**
 * Page document structure (field-per-block pattern)
 * This is CRITICAL for memory management - do NOT use arrays!
 */
export interface PageDocument {
  id: string;
  title: string;
  icon: string;
  blockOrder: string; // JSON.stringify(['block1', 'block2', ...])
  createdAt: number;
  updatedAt: number;
  // Index signature for dynamic block fields
  [key: string]: unknown;
}

/**
 * Helper to create a new block
 */
export function createBlock(type: BlockType, content: string = ''): Block {
  const now = Date.now();
  return {
    id: `block-${now}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    content,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Helper to create a new page
 */
export function createPage(title: string = 'Untitled', icon: string = '📄'): PageDocument {
  const now = Date.now();
  const pageId = `page-${now}-${Math.random().toString(36).substr(2, 9)}`;

  // Create first block (paragraph)
  const firstBlock = createBlock(BLOCK_TYPES.PARAGRAPH);

  return {
    id: pageId,
    title,
    icon,
    blockOrder: JSON.stringify([firstBlock.id]),
    createdAt: now,
    updatedAt: now,
    // First block stored as field
    [`block:${firstBlock.id}`]: firstBlock,
  } as PageDocument;
}

/**
 * Get block field key
 */
export function getBlockKey(blockId: string): string {
  return `block:${blockId}`;
}

/**
 * Parse block order from JSON string
 */
export function parseBlockOrder(blockOrder: string): string[] {
  try {
    return JSON.parse(blockOrder);
  } catch {
    return [];
  }
}

/**
 * Get all blocks from a page document in order
 */
export function getBlocksFromPage(page: any): Block[] {
  const blockIds = parseBlockOrder(page.blockOrder || '[]');
  const blocks: Block[] = [];

  for (const blockId of blockIds) {
    const block = page[getBlockKey(blockId)];
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

/**
 * Get display name for block type
 */
export function getBlockTypeName(type: BlockType): string {
  switch (type) {
    case BLOCK_TYPES.HEADING_1:
      return 'Heading 1';
    case BLOCK_TYPES.HEADING_2:
      return 'Heading 2';
    case BLOCK_TYPES.HEADING_3:
      return 'Heading 3';
    case BLOCK_TYPES.PARAGRAPH:
      return 'Paragraph';
    case BLOCK_TYPES.BULLETED_LIST:
      return 'Bulleted List';
    case BLOCK_TYPES.NUMBERED_LIST:
      return 'Numbered List';
    case BLOCK_TYPES.TODO:
      return 'Todo';
    case BLOCK_TYPES.CODE:
      return 'Code';
    case BLOCK_TYPES.QUOTE:
      return 'Quote';
    default:
      return 'Unknown';
  }
}

/**
 * Detect block type from text prefix
 * E.g., "# " -> heading1, "- " -> bulletedList
 */
export function detectBlockTypeFromPrefix(text: string): BlockType | null {
  if (text.startsWith('# ')) return BLOCK_TYPES.HEADING_1;
  if (text.startsWith('## ')) return BLOCK_TYPES.HEADING_2;
  if (text.startsWith('### ')) return BLOCK_TYPES.HEADING_3;
  if (text.startsWith('- ') || text.startsWith('* ')) return BLOCK_TYPES.BULLETED_LIST;
  if (text.match(/^\d+\.\s/)) return BLOCK_TYPES.NUMBERED_LIST;
  if (text.startsWith('[ ] ') || text.startsWith('[x] ')) return BLOCK_TYPES.TODO;
  if (text.startsWith('```')) return BLOCK_TYPES.CODE;
  if (text.startsWith('> ')) return BLOCK_TYPES.QUOTE;
  return null;
}

/**
 * Remove type prefix from content
 */
export function removeTypePrefix(text: string, type: BlockType): string {
  switch (type) {
    case BLOCK_TYPES.HEADING_1:
      return text.replace(/^#\s/, '');
    case BLOCK_TYPES.HEADING_2:
      return text.replace(/^##\s/, '');
    case BLOCK_TYPES.HEADING_3:
      return text.replace(/^###\s/, '');
    case BLOCK_TYPES.BULLETED_LIST:
      return text.replace(/^[-*]\s/, '');
    case BLOCK_TYPES.NUMBERED_LIST:
      return text.replace(/^\d+\.\s/, '');
    case BLOCK_TYPES.TODO:
      return text.replace(/^\[([ x])\]\s/, '');
    case BLOCK_TYPES.CODE:
      return text.replace(/^```/, '');
    case BLOCK_TYPES.QUOTE:
      return text.replace(/^>\s/, '');
    default:
      return text;
  }
}
