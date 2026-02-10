/**
 * Export utilities for LocalWrite
 * Handles exporting pages to markdown and JSON formats
 */

import { Block } from './blocks';

/**
 * Convert a block to markdown format
 */
export function blockToMarkdown(block: Block): string {
  const content = block.content || '';

  switch (block.type) {
    case 'heading1':
      return `# ${content}\n`;
    case 'heading2':
      return `## ${content}\n`;
    case 'heading3':
      return `### ${content}\n`;
    case 'quote':
      return `> ${content}\n`;
    case 'code':
      return `\`\`\`\n${content}\n\`\`\`\n`;
    case 'bulletedList':
      return `- ${content}\n`;
    case 'numberedList':
      return `1. ${content}\n`;
    case 'todo':
      // TODO content already includes [ ] or [x] prefix
      return `- ${content}\n`;
    case 'calloutInfo':
      return `> ℹ️ **Info**\n> ${content}\n`;
    case 'calloutWarning':
      return `> ⚠️ **Warning**\n> ${content}\n`;
    case 'calloutError':
      return `> ❌ **Error**\n> ${content}\n`;
    case 'calloutSuccess':
      return `> ✅ **Success**\n> ${content}\n`;
    case 'toggle':
      const toggleContent = block.toggleBody || '';
      return `<details>\n<summary>${content}</summary>\n\n${toggleContent}\n\n</details>\n`;
    case 'image':
      const caption = block.imageCaption ? `\n*${block.imageCaption}*` : '';
      if (block.imageData) {
        return `![${content || 'Image'}](${block.imageData})${caption}\n`;
      }
      return '';
    case 'paragraph':
    default:
      return content ? `${content}\n` : '\n';
  }
}

/**
 * Export a page to markdown format
 */
export function exportPageToMarkdown(
  title: string,
  icon: string,
  blocks: Block[]
): string {
  let markdown = `# ${icon} ${title}\n\n`;

  for (const block of blocks) {
    markdown += blockToMarkdown(block);
    markdown += '\n'; // Extra spacing between blocks
  }

  return markdown.trim() + '\n';
}

/**
 * Export a page to JSON format
 */
export function exportPageToJSON(
  pageId: string,
  title: string,
  icon: string,
  blocks: Block[],
  createdAt?: number,
  updatedAt?: number
): string {
  const data = {
    id: pageId,
    title,
    icon,
    blocks,
    createdAt,
    updatedAt,
    exportedAt: Date.now(),
    version: '1.0',
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Trigger a file download in the browser
 */
export function downloadFile(filename: string, content: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Sanitize filename for download
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9_\-\.]/gi, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}
