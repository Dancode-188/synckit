/**
 * Markdown parsing utilities for inline text formatting
 * Supports: bold, italic, inline code, and links
 */

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Sanitize URL to prevent javascript: protocol injection
 */
function sanitizeUrl(url: string): string {
  // Only allow http:// and https:// protocols
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  // For relative URLs, allow them
  if (url.startsWith('/') || url.startsWith('.')) {
    return url;
  }
  // For anchors, allow them
  if (url.startsWith('#')) {
    return url;
  }
  // Block everything else (especially javascript:, data:, etc.)
  return '#';
}

/**
 * Check if a character is a word boundary (whitespace, punctuation, or undefined)
 */
function isWordBoundary(char: string | undefined): boolean {
  if (!char) return true; // Start or end of string
  return /[\s.,;:!?'"()\[\]{}<>\/\\|@#$%^&*+=~`-]/.test(char);
}

/**
 * Parse inline markdown and convert to HTML
 * Supports:
 * - **bold** or __bold__ → <strong>bold</strong>
 * - *italic* or _italic_ → <em>italic</em>
 * - `code` → <code>code</code>
 * - [text](url) → <a href="url">text</a>
 *
 * NOTE: Formatting only applies at word boundaries to prevent mid-word formatting.
 * E.g., "**bold**" works but "wor**d**" does not.
 */
export function parseMarkdown(text: string): string {
  if (!text) return '';

  // Escape HTML first to prevent XSS
  let html = escapeHtml(text);

  // Parse inline code first (to avoid processing markdown inside code)
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Parse links [text](url) - with URL sanitization for security
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    const safeUrl = sanitizeUrl(url);
    return `<a href="${safeUrl}" class="link" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // Parse bold **text** or __text__ (only at word boundaries)
  html = html.replace(/\*\*([^*]+)\*\*/g, (match, content, offset, string) => {
    const before = string[offset - 1];
    const after = string[offset + match.length];
    if (isWordBoundary(before) && isWordBoundary(after)) {
      return `<strong>${content}</strong>`;
    }
    return match; // Don't transform mid-word
  });
  html = html.replace(/__([^_]+)__/g, (match, content, offset, string) => {
    const before = string[offset - 1];
    const after = string[offset + match.length];
    if (isWordBoundary(before) && isWordBoundary(after)) {
      return `<strong>${content}</strong>`;
    }
    return match;
  });

  // Parse italic *text* or _text_ (only at word boundaries, not inside bold)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (match, content, offset, string) => {
    const before = string[offset - 1];
    const after = string[offset + match.length];
    if (isWordBoundary(before) && isWordBoundary(after)) {
      return `<em>${content}</em>`;
    }
    return match;
  });
  html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, (match, content, offset, string) => {
    const before = string[offset - 1];
    const after = string[offset + match.length];
    if (isWordBoundary(before) && isWordBoundary(after)) {
      return `<em>${content}</em>`;
    }
    return match;
  });

  return html;
}

/**
 * Wrap selected text with markdown syntax
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string
): { newText: string; newStart: number; newEnd: number } {
  const beforeText = text.slice(0, start);
  const selectedText = text.slice(start, end);
  const afterText = text.slice(end);

  // If text is already wrapped, unwrap it
  const wrappedPattern = new RegExp(
    `${escapeRegex(before)}([\\s\\S]*?)${escapeRegex(after)}`
  );

  if (
    beforeText.endsWith(before) &&
    afterText.startsWith(after) &&
    wrappedPattern.test(before + selectedText + after)
  ) {
    // Unwrap: remove the markers
    return {
      newText: beforeText.slice(0, -before.length) + selectedText + afterText.slice(after.length),
      newStart: start - before.length,
      newEnd: end - before.length,
    };
  }

  // Wrap: add the markers
  const newText = beforeText + before + selectedText + after + afterText;
  return {
    newText,
    newStart: start + before.length,
    newEnd: end + before.length,
  };
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get text content from HTML (strip tags)
 */
export function getTextContent(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

/**
 * Convert HTML back to markdown
 * Handles: <strong>, <em>, <code>, <a>
 */
export function htmlToMarkdown(element: HTMLElement): string {
  let markdown = '';

  const processNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const childMarkdown = Array.from(el.childNodes)
        .map(processNode)
        .join('');

      switch (el.tagName.toLowerCase()) {
        case 'strong':
        case 'b':
          return `**${childMarkdown}**`;
        case 'em':
        case 'i':
          return `*${childMarkdown}*`;
        case 'code':
          return `\`${childMarkdown}\``;
        case 'a':
          const href = el.getAttribute('href') || '';
          return `[${childMarkdown}](${href})`;
        case 'br':
          return '\n';
        default:
          return childMarkdown;
      }
    }

    return '';
  };

  Array.from(element.childNodes).forEach((node) => {
    markdown += processNode(node);
  });

  return markdown;
}

/**
 * Insert markdown link at cursor position
 */
export function insertLink(
  text: string,
  start: number,
  end: number,
  url: string
): { newText: string; newStart: number; newEnd: number } {
  const beforeText = text.slice(0, start);
  const selectedText = text.slice(start, end) || 'link text';
  const afterText = text.slice(end);

  const linkMarkdown = `[${selectedText}](${url})`;
  const newText = beforeText + linkMarkdown + afterText;

  return {
    newText,
    newStart: start + 1, // Position cursor inside [text]
    newEnd: start + 1 + selectedText.length,
  };
}

/**
 * Apply formatting to selection (bold, italic, code)
 */
export function applyFormatting(
  text: string,
  start: number,
  end: number,
  format: 'bold' | 'italic' | 'code'
): { newText: string; newStart: number; newEnd: number } {
  const markers: Record<string, { before: string; after: string }> = {
    bold: { before: '**', after: '**' },
    italic: { before: '*', after: '*' },
    code: { before: '`', after: '`' },
  };

  const { before, after } = markers[format];
  return wrapSelection(text, start, end, before, after);
}
