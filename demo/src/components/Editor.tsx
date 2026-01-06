/**
 * Editor component
 * Main document editor with SyncKit integration
 */

import { useState, useEffect, KeyboardEvent, useCallback } from 'react';
import { SyncDocument } from '@synckit-js/sdk';
import { useSyncKit } from '../contexts/SyncKitContext';
import { BlockComponent } from './BlockComponent';
import { UI_CONFIG, BLOCK_TYPES } from '../lib/constants';
import {
  Block,
  PageDocument,
  createBlock,
  createPage,
  getBlockKey,
  parseBlockOrder,
  detectBlockTypeFromPrefix,
  removeTypePrefix,
} from '../lib/blocks';

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

  // Load page document when pageId changes
  useEffect(() => {
    if (!pageId) {
      setPageDoc(null);
      setPageData(null);
      setBlocks([]);
      return;
    }

    // Get or create document
    const doc = synckit.document<PageDocument>(pageId);

    // Initialize with default page if empty
    const data = doc.get();
    if (!data.id) {
      const newPage = createPage();
      // Set all fields
      Object.entries(newPage).forEach(([key, value]) => {
        doc.set(key as any, value);
      });
    }

    // Subscribe to changes
    const unsubscribe = doc.subscribe((updatedData) => {
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

    return () => {
      unsubscribe();
    };
  }, [pageId, synckit]);

  // Update block content
  const handleBlockContentChange = useCallback(
    (blockId: string, content: string) => {
      if (!pageDoc) return;

      const block = (pageData as any)?.[getBlockKey(blockId)];
      if (!block) return;

      const updatedBlock = {
        ...block,
        content,
        updatedAt: Date.now(),
      };

      pageDoc.set(getBlockKey(blockId) as any, updatedBlock);
    },
    [pageDoc, pageData]
  );

  // Handle keyboard shortcuts
  const handleBlockKeyDown = useCallback(
    (blockId: string, e: KeyboardEvent<HTMLDivElement>) => {
      if (!pageDoc || !pageData) return;

      const blockIds = parseBlockOrder(pageData.blockOrder || '[]');
      const blockIndex = blockIds.indexOf(blockId);
      const currentBlock = (pageData as any)[getBlockKey(blockId)] as Block;

      // Enter: Create new block below
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();

        // Check for type prefix
        const detectedType = detectBlockTypeFromPrefix(currentBlock.content);

        if (detectedType) {
          // Remove prefix and convert block type
          const cleanContent = removeTypePrefix(currentBlock.content, detectedType);
          const updatedBlock = {
            ...currentBlock,
            type: detectedType,
            content: cleanContent,
            updatedAt: Date.now(),
          };
          pageDoc.set(getBlockKey(blockId) as any, updatedBlock);
        }

        // Create new block
        const newBlock = createBlock(BLOCK_TYPES.PARAGRAPH);
        const newBlockIds = [
          ...blockIds.slice(0, blockIndex + 1),
          newBlock.id,
          ...blockIds.slice(blockIndex + 1),
        ];

        // Update block order
        pageDoc.set('blockOrder', JSON.stringify(newBlockIds));

        // Add new block
        pageDoc.set(getBlockKey(newBlock.id) as any, newBlock);

        // Focus will be handled by autoFocus prop
      }

      // Backspace at start: Merge with previous block
      if (e.key === 'Backspace' && currentBlock.content === '') {
        e.preventDefault();

        if (blockIds.length > 1) {
          // Remove this block
          const newBlockIds = blockIds.filter((id) => id !== blockId);
          pageDoc.set('blockOrder', JSON.stringify(newBlockIds));
          pageDoc.delete(getBlockKey(blockId) as any);

          // Focus previous block (handled automatically)
        }
      }
    },
    [pageDoc, pageData]
  );

  // Empty state
  if (!pageId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📝</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to LocalWrite</h2>
          <p className="text-gray-600 mb-6">
            Create a new page to start writing, or select an existing page from the sidebar.
          </p>
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
            <p className="text-sm text-primary-900">
              <strong>Features:</strong> Real-time collaboration, OPFS storage, and field-per-block
              pattern for optimal performance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (!pageData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-gray-500">Loading page...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white scrollbar-thin">
      <div className="mx-auto py-12 px-8" style={{ maxWidth: UI_CONFIG.maxContentWidth }}>
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <button className="text-4xl hover:bg-gray-100 rounded p-1 transition-colors">
              {pageData.icon}
            </button>
            <input
              type="text"
              value={pageData.title}
              onChange={(e) => pageDoc?.set('title', e.target.value)}
              className="flex-1 text-4xl font-bold text-gray-900 bg-transparent border-none outline-none focus:outline-none"
              placeholder="Untitled"
            />
          </div>
        </div>

        {/* Blocks */}
        <div className="space-y-1">
          {blocks.map((block, index) => (
            <BlockComponent
              key={block.id}
              block={block}
              onContentChange={(content) => handleBlockContentChange(block.id, content)}
              onKeyDown={(e) => handleBlockKeyDown(block.id, e)}
              autoFocus={index === blocks.length - 1 && blocks.length > 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
