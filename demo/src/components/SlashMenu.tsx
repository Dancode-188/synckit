import { useEffect, useState, useRef } from 'react';
import { BLOCK_TYPES, BlockType } from '../lib/constants';

interface MenuItem {
  type: BlockType;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
}

const MENU_ITEMS: MenuItem[] = [
  {
    type: BLOCK_TYPES.PARAGRAPH,
    label: 'Text',
    description: 'Plain text paragraph',
    icon: '¶',
    keywords: ['text', 'paragraph', 'p'],
  },
  {
    type: BLOCK_TYPES.HEADING_1,
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    keywords: ['heading', 'h1', 'title', 'large'],
  },
  {
    type: BLOCK_TYPES.HEADING_2,
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    keywords: ['heading', 'h2', 'subtitle', 'medium'],
  },
  {
    type: BLOCK_TYPES.HEADING_3,
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    keywords: ['heading', 'h3', 'small'],
  },
  {
    type: BLOCK_TYPES.BULLETED_LIST,
    label: 'Bulleted List',
    description: 'Simple bullet list',
    icon: '•',
    keywords: ['bullet', 'list', 'ul', 'unordered'],
  },
  {
    type: BLOCK_TYPES.NUMBERED_LIST,
    label: 'Numbered List',
    description: 'Ordered list with numbers',
    icon: '1.',
    keywords: ['number', 'numbered', 'list', 'ol', 'ordered'],
  },
  {
    type: BLOCK_TYPES.TODO,
    label: 'Todo',
    description: 'Track tasks with checkboxes',
    icon: '☐',
    keywords: ['todo', 'task', 'checkbox', 'check'],
  },
  {
    type: BLOCK_TYPES.CODE,
    label: 'Code',
    description: 'Code snippet with monospace font',
    icon: '</>',
    keywords: ['code', 'snippet', 'monospace', 'programming'],
  },
  {
    type: BLOCK_TYPES.QUOTE,
    label: 'Quote',
    description: 'Highlight a quote or callout',
    icon: '"',
    keywords: ['quote', 'blockquote', 'callout', 'citation'],
  },
];

interface SlashMenuProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

export function SlashMenu({ query, position, onSelect, onClose }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter menu items based on query
  const filteredItems = query
    ? MENU_ITEMS.filter((item) => {
        const searchText = query.toLowerCase();
        return (
          item.label.toLowerCase().includes(searchText) ||
          item.description.toLowerCase().includes(searchText) ||
          item.keywords.some((keyword) => keyword.includes(searchText))
        );
      })
    : MENU_ITEMS;

  // Reset selection when filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredItems.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
          break;
        case 'Enter':
          e.preventDefault();
          onSelect(filteredItems[selectedIndex].type);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = menuRef.current?.children[selectedIndex] as HTMLElement;
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (filteredItems.length === 0) {
    return (
      <div
        ref={menuRef}
        className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[280px]"
        style={{ top: position.top, left: position.left }}
      >
        <div className="text-sm text-gray-500 text-center py-2">
          No blocks found for "{query}"
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[280px] max-h-[320px] overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      {filteredItems.map((item, index) => (
        <button
          key={item.type}
          onClick={() => onSelect(item.type)}
          className={`
            w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors
            ${index === selectedIndex ? 'bg-gray-100' : ''}
          `}
        >
          <span className="text-xl w-8 text-center flex-shrink-0">{item.icon}</span>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium text-gray-900">{item.label}</div>
            <div className="text-xs text-gray-500">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
