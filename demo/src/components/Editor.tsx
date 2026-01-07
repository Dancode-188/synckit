/**
 * Editor component
 * Main document editor with SyncKit integration
 */

import { useState, useEffect, KeyboardEvent, useCallback, useRef } from 'react';
import { SyncDocument } from '@synckit-js/sdk';
import { useSyncKit } from '../contexts/SyncKitContext';
import { BlockComponent } from './BlockComponent';
import { SlashMenu } from './SlashMenu';
import { LinkDialog } from './LinkDialog';
import { UI_CONFIG, BLOCK_TYPES, BlockType } from '../lib/constants';
import {
  Block,
  PageDocument,
  createBlock,
  getBlockKey,
  parseBlockOrder,
  detectBlockTypeFromPrefix,
  removeTypePrefix,
} from '../lib/blocks';
import { htmlToMarkdown } from '../lib/markdown';

interface EditorProps {
  pageId?: string;
  pageTitle?: string;
  pageIcon?: string;
}

export function Editor({ pageId }: EditorProps) {
  const { synckit } = useSyncKit();
  const [pageDoc, setPageDoc] = useState<SyncDocument<PageDocument> | null>(null);
  const [pageData, setPageData] = useState<PageDocument | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [slashMenu, setSlashMenu] = useState<{
    blockId: string;
    query: string;
    position: { top: number; left: number };
  } | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [linkDialog, setLinkDialog] = useState<{
    blockId: string;
    selectedText: string;
    range: Range;
  } | null>(null);
  const [changingBlocks, setChangingBlocks] = useState<Set<string>>(new Set());
  const editorRef = useRef<HTMLDivElement>(null);

  // Trigger block change animation
  const triggerBlockChangeAnimation = useCallback((blockId: string) => {
    setChangingBlocks((prev) => new Set(prev).add(blockId));
    setTimeout(() => {
      setChangingBlocks((prev) => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });
    }, 200); // Match animation duration
  }, []);

  // Load page document when pageId changes
  useEffect(() => {
    if (!pageId) {
      setPageDoc(null);
      setPageData(null);
      setBlocks([]);
      return;
    }

    let mounted = true;

    async function loadDocument() {
      // Type guard - pageId is checked above but TS needs it here too
      if (!pageId) return;

      // Get document
      const doc = synckit.document<PageDocument>(pageId);

      // Initialize document (loads from storage)
      await doc.init();

      if (!mounted) return;

      // Subscribe to changes
      const unsubscribe = doc.subscribe((updatedData) => {
        if (!mounted) return;

        setPageData(updatedData);

        // Extract blocks in order
        const blockIds = parseBlockOrder(updatedData.blockOrder || '[]');
        const loadedBlocks: Block[] = [];

        for (const blockId of blockIds) {
          const block = (updatedData as any)[getBlockKey(blockId)];
          if (block) {
            loadedBlocks.push(block);
          }
        }

        setBlocks(loadedBlocks);
      });

      setPageDoc(doc);

      return unsubscribe;
    }

    let cleanup: (() => void) | undefined;
    loadDocument().then(unsubscribe => {
      cleanup = unsubscribe;
    });

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, [pageId, synckit]);

  // Update block content
  const handleBlockContentChange = useCallback(
    async (blockId: string, content: string) => {
      if (!pageDoc) return;

      const block = (pageData as any)?.[getBlockKey(blockId)];
      if (!block) return;

      // Check for slash command
      if (content.startsWith('/')) {
        const query = content.slice(1); // Remove the '/'

        // Get cursor position for menu
        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);
        if (range) {
          const rect = range.getBoundingClientRect();
          const editorRect = editorRef.current?.getBoundingClientRect();
          if (editorRect) {
            setSlashMenu({
              blockId,
              query,
              position: {
                top: rect.bottom - editorRect.top + 4,
                left: rect.left - editorRect.left,
              },
            });
          }
        }
      } else {
        // Close slash menu if content doesn't start with /
        setSlashMenu(null);
      }

      const updatedBlock = {
        ...block,
        content,
        updatedAt: Date.now(),
      };

      await pageDoc.set(getBlockKey(blockId) as any, updatedBlock);
    },
    [pageDoc, pageData]
  );

  // Update toggle block body
  const handleToggleBodyChange = useCallback(
    async (blockId: string, body: string) => {
      if (!pageDoc || !pageData) return;

      const block = (pageData as any)?.[getBlockKey(blockId)];
      if (!block) return;

      const updatedBlock = {
        ...block,
        toggleBody: body,
        updatedAt: Date.now(),
      };

      await pageDoc.set(getBlockKey(blockId) as any, updatedBlock);
    },
    [pageDoc, pageData]
  );

  // Update toggle block collapsed state
  const handleToggleStateChange = useCallback(
    async (blockId: string, collapsed: boolean) => {
      if (!pageDoc || !pageData) return;

      const block = (pageData as any)?.[getBlockKey(blockId)];
      if (!block) return;

      const updatedBlock = {
        ...block,
        collapsed,
        updatedAt: Date.now(),
      };

      await pageDoc.set(getBlockKey(blockId) as any, updatedBlock);
    },
    [pageDoc, pageData]
  );

  // Handle slash menu selection
  const handleSlashMenuSelect = useCallback(
    (type: BlockType) => {
      if (!slashMenu || !pageDoc || !pageData) return;

      const block = (pageData as any)[getBlockKey(slashMenu.blockId)] as Block;
      if (!block) return;

      // Convert block to selected type with empty content
      const updatedBlock = {
        ...block,
        type,
        content: '',
        updatedAt: Date.now(),
      };

      pageDoc.set(getBlockKey(slashMenu.blockId) as any, updatedBlock);
      triggerBlockChangeAnimation(slashMenu.blockId);
      setSlashMenu(null);
    },
    [slashMenu, pageDoc, pageData, triggerBlockChangeAnimation]
  );

  // Close slash menu
  const handleSlashMenuClose = useCallback(() => {
    setSlashMenu(null);
  }, []);

  // Handle link dialog
  const handleLinkConfirm = useCallback(
    (url: string, text: string) => {
      if (!linkDialog || !pageDoc || !pageData) return;

      const block = (pageData as any)[getBlockKey(linkDialog.blockId)] as Block;
      if (!block) return;

      // Create link element
      const linkElement = document.createElement('a');
      linkElement.href = url;
      linkElement.className = 'link';
      linkElement.textContent = text || linkDialog.selectedText || 'link';

      // Insert link at the saved range
      const range = linkDialog.range;
      range.deleteContents();
      range.insertNode(linkElement);

      // Get the block element to extract markdown
      const blockElements = document.querySelectorAll('[contenteditable]');
      let targetElement: HTMLElement | null = null;

      for (const el of blockElements) {
        // Find the element containing our link
        if (el.contains(linkElement)) {
          targetElement = el as HTMLElement;
          break;
        }
      }

      if (targetElement) {
        // Extract markdown from the updated DOM
        const markdownContent = htmlToMarkdown(targetElement);
        const updatedBlock = {
          ...block,
          content: markdownContent,
          updatedAt: Date.now(),
        };

        pageDoc.set(getBlockKey(linkDialog.blockId) as any, updatedBlock);
      }

      setLinkDialog(null);
    },
    [linkDialog, pageDoc, pageData]
  );

  const handleLinkCancel = useCallback(() => {
    setLinkDialog(null);
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (blockId: string) => (e: React.DragEvent) => {
      setDraggedBlockId(blockId);
      e.dataTransfer.effectAllowed = 'move';
      // Add a small delay to allow the drag image to be created
      setTimeout(() => {
        (e.target as HTMLElement).style.opacity = '0.5';
      }, 0);
    },
    []
  );

  const handleDragOver = useCallback(
    (blockIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetIndex(blockIndex);
    },
    []
  );

  const handleDrop = useCallback(
    (targetIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();

      if (!draggedBlockId || !pageDoc || !pageData) return;

      const blockIds = parseBlockOrder(pageData.blockOrder || '[]');
      const draggedIndex = blockIds.indexOf(draggedBlockId);

      if (draggedIndex === -1 || draggedIndex === targetIndex) {
        setDraggedBlockId(null);
        setDropTargetIndex(null);
        return;
      }

      // Reorder blocks
      const newBlockIds = [...blockIds];
      const [removed] = newBlockIds.splice(draggedIndex, 1);

      // Adjust target index if dragging from above
      const adjustedTarget = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
      newBlockIds.splice(adjustedTarget, 0, removed);

      // Update SyncKit
      pageDoc.set('blockOrder', JSON.stringify(newBlockIds));

      setDraggedBlockId(null);
      setDropTargetIndex(null);
    },
    [draggedBlockId, pageDoc, pageData]
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedBlockId(null);
    setDropTargetIndex(null);
  }, []);

  // Handle keyboard shortcuts
  const handleBlockKeyDown = useCallback(
    (blockId: string, e: KeyboardEvent<HTMLDivElement>) => {
      if (!pageDoc || !pageData) return;

      const blockIds = parseBlockOrder(pageData.blockOrder || '[]');
      const blockIndex = blockIds.indexOf(blockId);
      const currentBlock = (pageData as any)[getBlockKey(blockId)] as Block;

      const isMod = e.metaKey || e.ctrlKey; // Cmd on Mac, Ctrl on Windows

      // Text formatting shortcuts: Cmd/Ctrl + B/I/E/K
      if (isMod && (e.key === 'b' || e.key === 'i' || e.key === 'e' || e.key === 'k')) {
        e.preventDefault();

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const target = e.currentTarget;

        // For link dialog - check if already in a link (toggle behavior)
        if (e.key === 'k') {
          // Check if selection is inside a link
          let node: Node | null = range.commonAncestorContainer;
          let linkElement: HTMLElement | null = null;

          while (node && node !== target) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              if (element.tagName === 'A') {
                linkElement = element;
                break;
              }
            }
            node = node.parentNode;
          }

          if (linkElement) {
            // Toggle OFF: Remove link by unwrapping it
            const parent = linkElement.parentNode;
            if (parent) {
              while (linkElement.firstChild) {
                parent.insertBefore(linkElement.firstChild, linkElement);
              }
              parent.removeChild(linkElement);
            }

            // Extract markdown and save
            const markdownContent = htmlToMarkdown(target);
            const updatedBlock = {
              ...currentBlock,
              content: markdownContent,
              updatedAt: Date.now(),
            };

            pageDoc.set(getBlockKey(blockId) as any, updatedBlock);
          } else {
            // Toggle ON: Show dialog to insert link
            const selectedText = range.toString();
            setLinkDialog({
              blockId,
              selectedText,
              range: range.cloneRange(),
            });
          }

          return;
        }

        // Check if selection is already formatted by inspecting the DOM
        const tagMap = {
          b: 'STRONG',
          i: 'EM',
          e: 'CODE',
        };
        const targetTag = tagMap[e.key as keyof typeof tagMap];

        // Check if selection is inside the target formatting tag
        let node: Node | null = range.commonAncestorContainer;
        let isFormatted = false;
        let formattedElement: HTMLElement | null = null;

        while (node && node !== target) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            if (element.tagName === targetTag) {
              isFormatted = true;
              formattedElement = element;
              break;
            }
          }
          node = node.parentNode;
        }

        if (isFormatted && formattedElement) {
          // Toggle OFF: Remove formatting by unwrapping the tag
          const parent = formattedElement.parentNode;
          if (parent) {
            // Move all children out of the formatted element
            while (formattedElement.firstChild) {
              parent.insertBefore(formattedElement.firstChild, formattedElement);
            }
            parent.removeChild(formattedElement);
          }
        } else {
          // Toggle ON: Add formatting
          if (!range.collapsed) {
            const selectedContent = range.extractContents();
            const newElement = document.createElement(targetTag.toLowerCase());
            if (targetTag === 'CODE') {
              newElement.className = 'inline-code';
            }
            newElement.appendChild(selectedContent);
            range.insertNode(newElement);

            // Select the newly formatted text
            range.selectNodeContents(newElement);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }

        // After DOM manipulation, extract markdown and save
        const markdownContent = htmlToMarkdown(target);
        const updatedBlock = {
          ...currentBlock,
          content: markdownContent,
          updatedAt: Date.now(),
        };

        pageDoc.set(getBlockKey(blockId) as any, updatedBlock);

        return; // Don't process other shortcuts
      }

      // Block type conversion shortcuts: Cmd+Alt+Key
      if (isMod && e.altKey) {
        let newType: BlockType | null = null;

        // Cmd+Alt+0 - Paragraph
        if (e.key === '0') {
          e.preventDefault();
          newType = BLOCK_TYPES.PARAGRAPH;
        }
        // Cmd+Alt+1 - Heading 1
        else if (e.key === '1') {
          e.preventDefault();
          newType = BLOCK_TYPES.HEADING_1;
        }
        // Cmd+Alt+2 - Heading 2
        else if (e.key === '2') {
          e.preventDefault();
          newType = BLOCK_TYPES.HEADING_2;
        }
        // Cmd+Alt+3 - Heading 3
        else if (e.key === '3') {
          e.preventDefault();
          newType = BLOCK_TYPES.HEADING_3;
        }
        // Cmd+Alt+L - Bulleted list
        else if (e.key === 'l' || e.key === 'L') {
          e.preventDefault();
          newType = BLOCK_TYPES.BULLETED_LIST;
        }
        // Cmd+Alt+N - Numbered list
        else if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          newType = BLOCK_TYPES.NUMBERED_LIST;
        }
        // Cmd+Alt+T - Todo
        else if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          newType = BLOCK_TYPES.TODO;
        }
        // Cmd+Alt+Q - Quote
        else if (e.key === 'q' || e.key === 'Q') {
          e.preventDefault();
          newType = BLOCK_TYPES.QUOTE;
        }
        // Cmd+Alt+C - Code block
        else if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          newType = BLOCK_TYPES.CODE;
        }

        if (newType) {
          const updatedBlock = {
            ...currentBlock,
            type: newType,
            updatedAt: Date.now(),
          };
          pageDoc.set(getBlockKey(blockId) as any, updatedBlock);
          triggerBlockChangeAnimation(blockId);
          return;
        }
      }

      // Enter: Create new block below
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();

        // Capture the target before any async operations (React event pooling)
        const target = e.currentTarget;

        // Check for type prefix
        const detectedType = detectBlockTypeFromPrefix(currentBlock.content);

        if (detectedType) {
          // Remove prefix and convert block type
          const cleanContent = removeTypePrefix(currentBlock.content, detectedType);

          // Immediately update the DOM to show cleaned content (before async operations)
          if (target && target.textContent !== cleanContent) {
            target.textContent = cleanContent;
          }

          const updatedBlock = {
            ...currentBlock,
            type: detectedType,
            content: cleanContent,
            updatedAt: Date.now(),
          };

          // Update SyncKit asynchronously (don't await in event handler)
          pageDoc.set(getBlockKey(blockId) as any, updatedBlock);
        }

        // Create new block
        const newBlock = createBlock(BLOCK_TYPES.PARAGRAPH);
        const newBlockIds = [
          ...blockIds.slice(0, blockIndex + 1),
          newBlock.id,
          ...blockIds.slice(blockIndex + 1),
        ];

        // Update block order and add new block (async, but don't await in event handler)
        pageDoc.set('blockOrder', JSON.stringify(newBlockIds));
        pageDoc.set(getBlockKey(newBlock.id) as any, newBlock);

        // Focus will be handled by autoFocus prop
      }

      // Backspace at start: Merge with previous block
      if (e.key === 'Backspace' && currentBlock.content === '') {
        e.preventDefault();

        if (blockIds.length > 1) {
          // Remove this block (async, but don't await in event handler)
          const newBlockIds = blockIds.filter((id) => id !== blockId);
          pageDoc.set('blockOrder', JSON.stringify(newBlockIds));
          pageDoc.delete(getBlockKey(blockId) as any);

          // Focus previous block (handled automatically)
        }
      }
    },
    [pageDoc, pageData, triggerBlockChangeAnimation]
  );

  // Empty state
  if (!pageId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 animate-fade-in">
        <div className="text-center max-w-md px-8">
          <div className="text-7xl mb-6 animate-scale-in">📝</div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">Welcome to LocalWrite</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
            Create a new page to start writing, or select an existing page from the sidebar.
          </p>
          <div className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 border border-primary-200 dark:border-primary-700 rounded-xl p-6 shadow-sm">
            <p className="text-sm text-primary-900 dark:text-primary-100 leading-relaxed">
              <strong className="block mb-2">Keyboard Shortcuts:</strong>
              <span className="block text-xs opacity-80 space-y-1">
                <span className="block">• Cmd+B/I/E for formatting</span>
                <span className="block">• Cmd+Alt+1/2/3 for headings</span>
                <span className="block">• Type / for block menu</span>
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (!pageData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-3 border-gray-300 dark:border-gray-600 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin"></div>
          <div className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Loading page...</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={editorRef} className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 scrollbar-thin relative">
      <div className="mx-auto py-12 px-8" style={{ maxWidth: UI_CONFIG.maxContentWidth }}>
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <button className="text-4xl hover:bg-gray-100 dark:hover:bg-gray-800 hover:scale-110 active:scale-95 rounded p-1 transition-all duration-150">
              {pageData.icon}
            </button>
            <input
              type="text"
              value={pageData.title || ''}
              onChange={(e) => {
                if (pageDoc) {
                  pageDoc.set('title', e.target.value);
                }
              }}
              className="flex-1 text-4xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600"
              placeholder="Untitled"
            />
          </div>
        </div>

        {/* Blocks */}
        <div className="space-y-2">
          {blocks.map((block, index) => (
            <div key={block.id} className="relative">
              {/* Drop indicator */}
              {dropTargetIndex === index && draggedBlockId !== block.id && (
                <div className="absolute -top-1 left-0 right-0 h-1 bg-primary-500 rounded-full z-10 shadow-lg shadow-primary-500/50 animate-pulse" />
              )}

              <div className={changingBlocks.has(block.id) ? 'animate-block-change' : ''}>
                <BlockComponent
                  block={block}
                  blockIndex={index}
                  onContentChange={(content) => handleBlockContentChange(block.id, content)}
                  onKeyDown={(e) => handleBlockKeyDown(block.id, e)}
                  onDragStart={handleDragStart(block.id)}
                  onDragOver={handleDragOver(index)}
                  onDrop={handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedBlockId === block.id}
                  autoFocus={index === blocks.length - 1 && blocks.length > 1}
                  onToggleBodyChange={(body) => handleToggleBodyChange(block.id, body)}
                  onToggleStateChange={(collapsed) => handleToggleStateChange(block.id, collapsed)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slash Command Menu */}
      {slashMenu && (
        <SlashMenu
          query={slashMenu.query}
          position={slashMenu.position}
          onSelect={handleSlashMenuSelect}
          onClose={handleSlashMenuClose}
        />
      )}

      {/* Link Dialog */}
      {linkDialog && (
        <LinkDialog
          initialText={linkDialog.selectedText}
          onConfirm={handleLinkConfirm}
          onCancel={handleLinkCancel}
        />
      )}
    </div>
  );
}
