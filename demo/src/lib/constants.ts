/**
 * Application constants and configuration
 */

// Virtual scrolling threshold
// Only enable virtual scrolling when blocks exceed this count
export const VIRTUAL_SCROLL_THRESHOLD = 100;

// Virtual scrolling configuration
export const VIRTUAL_SCROLL_CONFIG = {
  estimatedItemSize: 100, // Estimated height of each block in pixels
  overscan: 5,            // Number of items to render above/below viewport
};

// Memory management
export const MEMORY_CONFIG = {
  maxPagesInMemory: 3,    // Maximum number of pages to keep in memory
  disposeDelay: 5000,     // Delay before disposing old page (5 seconds)
};

// Default page configuration
export const DEFAULT_PAGE = {
  title: 'Untitled',
  icon: '📄',
};

// Block types
export const BLOCK_TYPES = {
  HEADING_1: 'heading1',
  HEADING_2: 'heading2',
  HEADING_3: 'heading3',
  PARAGRAPH: 'paragraph',
  BULLETED_LIST: 'bulletedList',
  NUMBERED_LIST: 'numberedList',
  TODO: 'todo',
  CODE: 'code',
  QUOTE: 'quote',
  CALLOUT_INFO: 'calloutInfo',
  CALLOUT_WARNING: 'calloutWarning',
  CALLOUT_ERROR: 'calloutError',
  CALLOUT_SUCCESS: 'calloutSuccess',
} as const;

export type BlockType = typeof BLOCK_TYPES[keyof typeof BLOCK_TYPES];

// UI Constants
export const UI_CONFIG = {
  sidebarWidth: 240,
  headerHeight: 64,
  maxContentWidth: 900,
};
