/**
 * Editor component
 * Main document editor with SyncKit integration
 */

import { useState, useEffect, KeyboardEvent, useCallback, useRef } from 'react';
import { SyncDocument, SnapshotScheduler } from '@synckit-js/sdk';
import { useSyncKit } from '../contexts/SyncKitContext';
import { CRDTBlockComponent } from './CRDTBlockComponent';
import { SlashMenu } from './SlashMenu';
import { LinkDialog } from './LinkDialog';
import { SnapshotDialog } from './SnapshotDialog';
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
import { getImageFromClipboard, compressImage } from '../lib/images';
import { needsArchiving, archiveOldBlocks } from '../lib/playground';
import { getUserIdentity } from '../lib/user';
import { useMilestoneTracker } from '../hooks/useMilestoneTracker';
import { useContributionTracker } from '../hooks/useContributionTracker';
import { useToast } from '../contexts/ToastContext';
import { Confetti } from './Confetti';
import { ContributionStats, ContributorData } from './ContributionStats';
import { ReactionPicker } from './ReactionPicker';
import { FloatingReaction } from './FloatingReaction';
import { ReplayOverlay } from './ReplayOverlay';
import { useOperationRecorder } from '../hooks/useOperationRecorder';

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
  const [snapshotScheduler, setSnapshotScheduler] = useState<SnapshotScheduler | null>(null);
  const [lastSnapshotTime, setLastSnapshotTime] = useState<number | null>(null);
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [contributors, setContributors] = useState<ContributorData[]>([]);
  const [reactionPicker, setReactionPicker] = useState<{ x: number; y: number } | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; emoji: string; position: { x: number; y: number } }>>([]);
  const [showReplay, setShowReplay] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();
  const pageDataRef = useRef<PageDocument | null>(null);
  const focusedBlockIdRef = useRef<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    pageDataRef.current = pageData;
  }, [pageData]);

  useEffect(() => {
    focusedBlockIdRef.current = focusedBlockId;
  }, [focusedBlockId]);

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

  // Track subscription outside effect to prevent StrictMode duplicates
  const subscriptionRef = useRef<(() => void) | null>(null);

  // Track document ref for cleanup (avoids stale closure bug)
  const pageDocRef = useRef<SyncDocument<PageDocument> | null>(null);

  // Typing indicator refs
  const awarenessRef = useRef<any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientIdRef = useRef<string>(
    localStorage.getItem('localwrite:client-id') || crypto.randomUUID()
  );

  // Milestone celebrations
  const handleMilestone = useCallback((milestone: { emoji: string; message: string }) => {
    setShowConfetti(true);
    addToast({
      message: milestone.message,
      icon: milestone.emoji,
      variant: 'celebration',
      duration: 5000,
    });
  }, [addToast]);

  useMilestoneTracker({
    pageId,
    blocks,
    onMilestone: handleMilestone,
  });

  // Contribution tracking
  const userIdentity = getUserIdentity(clientIdRef.current);
  const contributionUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContributionChange = useCallback((stats: { wordsAdded: number; editsCount: number }) => {
    // Debounce awareness updates to every 2 seconds
    if (contributionUpdateTimeoutRef.current) {
      clearTimeout(contributionUpdateTimeoutRef.current);
    }
    contributionUpdateTimeoutRef.current = setTimeout(() => {
      const awareness = awarenessRef.current;
      if (awareness && userIdentity) {
        awareness.setLocalState({
          user: {
            name: userIdentity.name,
            color: userIdentity.color,
          },
          contributions: stats,
        }).catch(() => {});
      }
    }, 2000);
  }, [userIdentity]);

  const { stats: localContributionStats, trackContentChange } = useContributionTracker({
    pageId,
    onContributionChange: handleContributionChange,
  });

  // Operation recording for replay
  const { recordContentChange, getSession, hasRecording } = useOperationRecorder({
    pageId,
    blocks,
    userName: userIdentity?.name || 'Anonymous',
    userColor: userIdentity?.color || '#888888',
  });

  // Collect contributions from other users via awareness
  useEffect(() => {
    const awareness = awarenessRef.current;
    if (!awareness) return;

    const updateContributors = () => {
      const allStates = awareness.getStates();
      const localClientId = awareness.getClientId();
      const otherContributors: ContributorData[] = [];

      allStates.forEach((state: any) => {
        if (state.client_id !== localClientId && state.state?.contributions) {
          const presence = state.state;
          if (presence.user && presence.contributions) {
            otherContributors.push({
              clientId: state.client_id,
              userName: presence.user.name,
              userColor: presence.user.color,
              wordsAdded: presence.contributions.wordsAdded || 0,
              editsCount: presence.contributions.editsCount || 0,
            });
          }
        }
      });

      setContributors(otherContributors);
    };

    // Subscribe to awareness changes
    const unsubscribe = awareness.subscribe(() => {
      updateContributors();
    });

    // Initial update
    updateContributors();

    return () => {
      unsubscribe();
      if (contributionUpdateTimeoutRef.current) {
        clearTimeout(contributionUpdateTimeoutRef.current);
      }
    };
  }, [pageId]);

  // Selection change detection for reactions
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setReactionPicker(null);
        return;
      }

      // Check if selection is within the editor
      const range = selection.getRangeAt(0);
      const editorElement = editorRef.current;
      if (!editorElement || !editorElement.contains(range.commonAncestorContainer)) {
        setReactionPicker(null);
        return;
      }

      // Get selection position
      const rect = range.getBoundingClientRect();
      setReactionPicker({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  // Handle reaction selection
  const handleReaction = useCallback((emoji: string) => {
    if (!reactionPicker) return;

    const id = crypto.randomUUID();
    setFloatingReactions((prev) => [
      ...prev,
      { id, emoji, position: reactionPicker },
    ]);
    setReactionPicker(null);

    // Clear selection
    window.getSelection()?.removeAllRanges();
  }, [reactionPicker]);

  // Remove floating reaction when animation completes
  const handleReactionComplete = useCallback((id: string) => {
    setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Load page document when pageId changes
  useEffect(() => {
    if (!pageId) {
      // Clear document ref and state
      if (pageDocRef.current) {
        (pageDocRef.current as any).dispose?.();
        pageDocRef.current = null;
      }
      setPageDoc(null);
      setPageData(null);
      setBlocks([]);
      setSnapshotScheduler(null);
      setLastSnapshotTime(null);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    let scheduler: SnapshotScheduler | null = null;
    let snapshotInterval: NodeJS.Timeout | null = null;

    async function loadDocument() {
      // Type guard - pageId is checked above but TS needs it here too
      if (!pageId) return;

      // Get document
      const doc = synckit.document<PageDocument>(pageId);

      // Initialize document (loads from storage)
      // For playground, just init and load from server - no client-side seeding
      // The seed-playground.ts script handles seeding the server
      // Client-side seeding was removed to prevent duplication when multiple tabs connect
      if (pageId === 'playground') {
        console.log('🌍 Initializing playground document (server-seeded)');
        await doc.init();
      } else {
        // For non-playground documents (rooms, personal pages), just init normally
        console.log('🚪 Initializing room/page document:', pageId);
        await doc.init();
      }

      console.log('[CLIENT] Document initialized successfully for:', pageId);

      if (!mounted) return;

        // Unsubscribe any existing subscription first (prevents StrictMode duplicates)
        if (subscriptionRef.current) {
          subscriptionRef.current();
          subscriptionRef.current = null;
        }

        // Subscribe to changes
        unsubscribe = doc.subscribe((updatedData) => {
        if (!mounted) return;

        console.log(`📥 Document ${pageId} updated:`, {
          title: updatedData.title,
          icon: updatedData.icon,
          blockCount: parseBlockOrder(updatedData.blockOrder || '[]').length,
          keys: Object.keys(updatedData).slice(0, 10) // First 10 keys
        });

        setPageData(updatedData);

        // Extract blocks in order
        const blockIds = parseBlockOrder(updatedData.blockOrder || '[]');
        console.log('📊 Block IDs from subscription:', blockIds);
        const loadedBlocks: Block[] = [];

        for (const blockId of blockIds) {
          const block = (updatedData as any)[getBlockKey(blockId)];
          if (block) {
            loadedBlocks.push(block);
          }
        }

        // DIAGNOSTIC: Log block content for playground
        if (pageId === 'playground') {
          console.log('📋 [Editor] Blocks extracted from subscription:');
          loadedBlocks.forEach((b, i) => {
            console.log(`  Block ${i}: type=${b.type}, content="${(b.content || '').substring(0, 40)}..." (${(b.content || '').length} chars)`);
          });
        }

        setBlocks(loadedBlocks);

        // Check if playground needs archiving
        if (pageId === 'playground' && needsArchiving(loadedBlocks.length)) {
          console.log('⚠️ Playground approaching block limit, archiving old blocks...');
          archiveOldBlocks(doc, synckit).then((archivedCount) => {
            if (archivedCount > 0) {
              console.log(`✅ Archived ${archivedCount} blocks`);
            }
          }).catch((error) => {
            console.error('Failed to archive blocks:', error);
          });
        }
      });

      // Store in ref to prevent duplicate subscriptions
      subscriptionRef.current = unsubscribe;

      // Store in ref for cleanup (avoids stale closure)
      pageDocRef.current = doc;
      setPageDoc(doc);

      // Set up auto-snapshots
      const storage = (synckit as any).storage; // Access internal storage
      if (storage) {
        // Use aggressive settings for playground (community restore feature)
        const isPlayground = pageId === 'playground';

        scheduler = new SnapshotScheduler(doc, storage, {
          enabled: true,
          timeIntervalMs: isPlayground ? 10 * 1000 : 5 * 60 * 1000, // 10s for playground, 5min for others
          operationCount: isPlayground ? 50 : 100, // More frequent snapshots in playground
          maxSnapshots: isPlayground ? 50 : 10, // Keep last ~8 minutes for playground (50 * 10s)
          compress: true,
        });

        scheduler.start();
        setSnapshotScheduler(scheduler);

        // Update last snapshot time periodically
        snapshotInterval = setInterval(() => {
          if (scheduler) {
            const stats = scheduler.getStats();
            setLastSnapshotTime(stats.lastSnapshotTime);
          }
        }, 1000);
      }
    }

    loadDocument();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
      if (scheduler) scheduler.stop();
      if (snapshotInterval) clearInterval(snapshotInterval);

      // CRITICAL: Dispose document to unsubscribe and free memory
      // Uses ref instead of state to avoid stale closure bug
      if (pageDocRef.current) {
        console.log(`🧹 Disposing page document: ${pageId}`);
        (pageDocRef.current as any).dispose?.();
        pageDocRef.current = null;
      }

      setSnapshotScheduler(null);
      setPageDoc(null);
      setPageData(null);
      setBlocks([]);
    };
  }, [pageId, synckit]);

  // Initialize awareness for typing indicators
  useEffect(() => {
    if (!pageId || !synckit) return;

    const docId = pageId; // Capture for closure
    let mounted = true;

    async function setupAwareness() {
      try {
        const awareness = synckit.getAwareness(docId);
        if (!awareness) return;

        await awareness.init();
        if (!mounted) return;

        awarenessRef.current = awareness;
      } catch (error) {
        console.error('Failed to setup awareness for typing:', error);
      }
    }

    setupAwareness();

    return () => {
      mounted = false;
      awarenessRef.current = null;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [pageId, synckit]);

  // Notify typing via awareness (debounced)
  const notifyTyping = useCallback(() => {
    const awareness = awarenessRef.current;
    if (!awareness) return;

    const userIdentity = getUserIdentity(clientIdRef.current);

    // Update typing state
    awareness.setLocalState({
      user: {
        name: userIdentity.name,
        color: userIdentity.color,
      },
      typing: {
        isTyping: true,
        lastTypedAt: Date.now(),
      },
    }).catch((err: Error) => {
      console.error('Failed to update typing state:', err);
    });

    // Clear typing state after 2.5s of inactivity
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (awarenessRef.current) {
        awarenessRef.current.setLocalState({
          user: {
            name: userIdentity.name,
            color: userIdentity.color,
          },
          typing: {
            isTyping: false,
            lastTypedAt: Date.now(),
          },
        }).catch(() => {});
      }
    }, 2500);
  }, []);

  // Track which block is currently focused
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;

      // Find the block element by looking for data-block-id attribute
      let blockElement = target.closest('[data-block-id]') as HTMLElement | null;
      if (blockElement) {
        const blockId = blockElement.getAttribute('data-block-id');
        if (blockId) {
          setFocusedBlockId(blockId);
        }
      }
    };

    const handleFocusOut = () => {
      // Don't clear immediately - wait a bit to see if focus moves to another block
      setTimeout(() => {
        const activeElement = document.activeElement as HTMLElement;
        const blockElement = activeElement?.closest('[data-block-id]');
        if (!blockElement) {
          setFocusedBlockId(null);
        }
      }, 0);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Clear pending focus after the block has been rendered and focused
  useEffect(() => {
    if (pendingFocusBlockId) {
      // Only clear after the block actually exists in the blocks array
      // The block won't exist immediately because SyncKit updates are async
      const blockExists = blocks.some(b => b.id === pendingFocusBlockId);
      if (blockExists) {
        // Use requestAnimationFrame to ensure DOM has updated and focus has been applied
        const frame = requestAnimationFrame(() => {
          setPendingFocusBlockId(null);
        });
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [pendingFocusBlockId, blocks]);

  // Handle paste events for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Use refs to get current values without causing effect re-runs
      const currentPageData = pageDataRef.current;
      const currentFocusedBlockId = focusedBlockIdRef.current;

      if (!pageDoc || !currentPageData) return;

      // Synchronously check if clipboard has an image
      const hasImage = e.clipboardData?.items
        ? Array.from(e.clipboardData.items).some(item => item.type.startsWith('image/'))
        : false;

      if (!hasImage) return;

      // CRITICAL: Prevent default paste behavior BEFORE any async operations
      // This prevents the browser from inserting the image into the contenteditable
      e.preventDefault();

      // Now safely do async work to get and process the image
      const imageData = await getImageFromClipboard(e);
      if (!imageData) return;

      try {
        // Compress image if it's too large
        const compressedData = await compressImage(imageData);

        // Check if we're focused on an empty image block
        let targetBlockId: string | null = null;
        if (currentFocusedBlockId) {
          const focusedBlock = (currentPageData as any)[getBlockKey(currentFocusedBlockId)] as Block | undefined;
          if (focusedBlock && focusedBlock.type === BLOCK_TYPES.IMAGE && !focusedBlock.imageData) {
            // Use the existing empty image block
            targetBlockId = currentFocusedBlockId;
          }
        }

        if (targetBlockId) {
          // Update existing empty image block
          const block = (currentPageData as any)[getBlockKey(targetBlockId)] as Block;
          const updatedBlock = {
            ...block,
            imageData: compressedData,
            content: 'Pasted image',
            updatedAt: Date.now(),
          };

          await pageDoc.set(getBlockKey(targetBlockId) as any, updatedBlock);
          console.log('📷 Image pasted into existing block');
        } else {
          // Create new image block
          const newBlock = createBlock(BLOCK_TYPES.IMAGE);
          newBlock.imageData = compressedData;
          newBlock.content = 'Pasted image';

          // Get current block order
          const currentOrder = parseBlockOrder(currentPageData.blockOrder || '[]');

          // Insert after the currently focused block, or at the end if no focus
          let insertIndex = currentOrder.length;
          if (currentFocusedBlockId) {
            const focusedIndex = currentOrder.indexOf(currentFocusedBlockId);
            if (focusedIndex !== -1) {
              insertIndex = focusedIndex + 1;
            }
          }

          // Create an empty paragraph block to go after the image
          // This ensures users can always continue typing after inserting an image
          const followingBlock = createBlock(BLOCK_TYPES.PARAGRAPH);

          const newOrder = [
            ...currentOrder.slice(0, insertIndex),
            newBlock.id,
            followingBlock.id, // Add empty paragraph right after image
            ...currentOrder.slice(insertIndex),
          ];

          // Save image block, following paragraph block, and update order
          await pageDoc.set(getBlockKey(newBlock.id) as any, newBlock);
          await pageDoc.set(getBlockKey(followingBlock.id) as any, followingBlock);
          await pageDoc.set('blockOrder', JSON.stringify(newOrder));

          // Focus the following paragraph block so user can continue typing
          setPendingFocusBlockId(followingBlock.id);

          console.log('📷 Image pasted as new block with following paragraph');
        }

        // Record operation for snapshots
        if (snapshotScheduler) {
          snapshotScheduler.recordOperation();
        }
      } catch (error) {
        console.error('Failed to paste image:', error);
      }
    };

    // Add paste listener
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [pageDoc, snapshotScheduler]);

  // Handle content changes from CRDT blocks
  // Note: The actual content is stored in SyncText (Fugue CRDT), not in pageDoc
  // This handler is for slash command detection and recording operations
  const handleBlockContentChange = useCallback(
    async (blockId: string, content: string) => {
      if (!pageDoc) return;

      // DEBUG: Log content changes
      console.log(`[CLIENT] Block ${blockId} content changed:`, content.substring(0, 50));

      // Notify typing for live indicators
      notifyTyping();

      // Track contributions
      trackContentChange(blockId, content);

      // Record for replay
      recordContentChange(blockId, content);

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

      // Note: Content is managed by SyncText CRDT, not stored in pageDoc
      // We only update block metadata (timestamps) here for snapshot tracking
      // The actual content is synced via SyncText's Fugue CRDT

      // Record operation for snapshot scheduler
      if (snapshotScheduler) {
        snapshotScheduler.recordOperation();
      }
    },
    [pageDoc, snapshotScheduler, notifyTyping, trackContentChange, recordContentChange]
  );

  // Delete a block
  const handleBlockDelete = useCallback(
    async (blockId: string) => {
      if (!pageDoc || !pageData) return;

      try {
        // Get current block order
        const currentOrder = parseBlockOrder(pageData.blockOrder || '[]');

        // Don't allow deleting the last block - always keep at least one
        if (currentOrder.length <= 1) {
          console.log('⚠️ Cannot delete last block - page must have at least one block');
          return;
        }

        // Count editable (non-image) blocks
        const editableBlocks = currentOrder.filter(id => {
          const block = (pageData as any)[getBlockKey(id)] as Block | undefined;
          return block && block.type !== BLOCK_TYPES.IMAGE;
        });

        // Check if the block being deleted is editable
        const blockToDelete = (pageData as any)[getBlockKey(blockId)] as Block | undefined;
        const isDeletingEditableBlock = blockToDelete && blockToDelete.type !== BLOCK_TYPES.IMAGE;

        // Don't allow deleting the last editable block - page must have at least one text block
        if (isDeletingEditableBlock && editableBlocks.length <= 1) {
          console.log('⚠️ Cannot delete last text block - page must have at least one editable block');
          return;
        }

        // Remove block from order
        const newOrder = currentOrder.filter((id) => id !== blockId);

        // Update block order
        await pageDoc.set('blockOrder', JSON.stringify(newOrder));

        // Record operation for snapshot scheduler
        if (snapshotScheduler) {
          snapshotScheduler.recordOperation();
        }

        console.log(`🗑️ Deleted block: ${blockId}`);
      } catch (error) {
        console.error('Failed to delete block:', error);
      }
    },
    [pageDoc, pageData, snapshotScheduler]
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
    async (type: BlockType) => {
      if (!slashMenu || !pageDoc || !pageData || !pageId) return;

      const block = (pageData as any)[getBlockKey(slashMenu.blockId)] as Block;
      if (!block) return;

      // Update block type (metadata only - content is in SyncText)
      const updatedBlock = {
        ...block,
        type,
        updatedAt: Date.now(),
      };

      await pageDoc.set(getBlockKey(slashMenu.blockId) as any, updatedBlock);

      // Clear the SyncText content (remove the '/' command)
      try {
        const textDocId = `${pageId}:text:${slashMenu.blockId}`;
        const text = synckit.text(textDocId);
        await text.init();
        const currentContent = text.get();
        if (currentContent.length > 0) {
          await text.delete(0, currentContent.length);
        }
      } catch (error) {
        console.error('[Editor] Failed to clear SyncText content:', error);
      }

      triggerBlockChangeAnimation(slashMenu.blockId);
      setSlashMenu(null);
    },
    [slashMenu, pageDoc, pageData, pageId, synckit, triggerBlockChangeAnimation]
  );

  // Close slash menu
  const handleSlashMenuClose = useCallback(() => {
    setSlashMenu(null);
  }, []);

  // Handle link dialog
  const handleLinkConfirm = useCallback(
    async (url: string, text: string) => {
      if (!linkDialog || !pageId) return;

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
        // Extract markdown from the updated DOM and update SyncText
        const markdownContent = htmlToMarkdown(targetElement);

        // Update SyncText directly
        try {
          const textDocId = `${pageId}:text:${linkDialog.blockId}`;
          const textCRDT = synckit.text(textDocId);
          await textCRDT.init();

          const currentContent = textCRDT.get();

          // Replace entire content with the new markdown
          if (currentContent.length > 0) {
            await textCRDT.delete(0, currentContent.length);
          }
          if (markdownContent.length > 0) {
            await textCRDT.insert(0, markdownContent);
          }
        } catch (error) {
          console.error('[Editor] Failed to update SyncText with link:', error);
        }
      }

      setLinkDialog(null);
    },
    [linkDialog, pageId, synckit]
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

            // The DOM change will be picked up by ContentEditable's MutationObserver
            // which calls onChange -> updateContent on SyncText
            // No need to manually update pageDoc for content (it's in SyncText now)
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

            // Select the newly formatted text with a fresh range
            // (the original range may be stale after DOM mutations)
            const newRange = document.createRange();
            newRange.selectNodeContents(newElement);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        }

        // The DOM change will be picked up by ContentEditable's MutationObserver
        // which calls onChange -> updateContent on SyncText
        // No need to manually update pageDoc for content (it's in SyncText now)

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

      // Shift+Enter on image blocks: Create new block ABOVE
      if (e.key === 'Enter' && e.shiftKey && currentBlock.type === BLOCK_TYPES.IMAGE) {
        e.preventDefault();

        // Create new block above the image
        const newBlock = createBlock(BLOCK_TYPES.PARAGRAPH);
        const newBlockIds = [
          ...blockIds.slice(0, blockIndex), // Insert BEFORE current block
          newBlock.id,
          ...blockIds.slice(blockIndex),
        ];

        // Update block order and add new block (async, but don't await in event handler)
        pageDoc.set('blockOrder', JSON.stringify(newBlockIds));
        pageDoc.set(getBlockKey(newBlock.id) as any, newBlock);

        // Focus the new block after render
        setPendingFocusBlockId(newBlock.id);

        console.log('📝 Created block above image');
        return;
      }

      // Enter: Create new block below
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();

        // Capture the target before any async operations (React event pooling)
        const target = e.currentTarget;

        // Get current content from DOM (SyncText content may not be in pageData)
        const currentContent = target.textContent || '';

        // Check for type prefix
        const detectedType = detectBlockTypeFromPrefix(currentContent);

        if (detectedType && pageId) {
          // Remove prefix and convert block type
          const cleanContent = removeTypePrefix(currentContent, detectedType);

          // Immediately update the DOM to show cleaned content (before async operations)
          if (target && target.textContent !== cleanContent) {
            target.textContent = cleanContent;
          }

          // Update block type in pageDoc (only metadata, not content)
          const updatedBlock = {
            ...currentBlock,
            type: detectedType,
            updatedAt: Date.now(),
          };
          pageDoc.set(getBlockKey(blockId) as any, updatedBlock);

          // Update content in SyncText (remove the prefix)
          const textDocId = `${pageId}:text:${blockId}`;
          const text = synckit.text(textDocId);
          text.init().then(() => {
            const crdtContent = text.get();
            // Find and remove the prefix
            const prefixLength = currentContent.length - cleanContent.length;
            if (prefixLength > 0 && crdtContent.length >= prefixLength) {
              text.delete(0, prefixLength);
            }
          }).catch(err => {
            console.error('[Editor] Failed to update SyncText on type prefix:', err);
          });
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

        // Focus the new block after render
        setPendingFocusBlockId(newBlock.id);
      }

      // Backspace at start: Delete empty block
      // Allow deletion if content is empty or only whitespace
      // Use DOM content since SyncText content may not be in pageData
      const domContent = e.currentTarget.textContent || '';
      if (e.key === 'Backspace' && domContent.trim() === '') {
        e.preventDefault();

        if (blockIds.length > 1) {
          // Count editable (non-image) blocks
          const editableBlocks = blockIds.filter(id => {
            const block = (pageData as any)?.[getBlockKey(id)] as Block | undefined;
            return block && block.type !== BLOCK_TYPES.IMAGE;
          });

          // Don't allow deleting the last editable block via backspace
          const isDeletingEditableBlock = currentBlock.type !== BLOCK_TYPES.IMAGE;
          if (isDeletingEditableBlock && editableBlocks.length <= 1) {
            console.log('⚠️ Cannot delete last text block - page must have at least one editable block');
            return;
          }

          // Remove this block (async, but don't await in event handler)
          const newBlockIds = blockIds.filter((id) => id !== blockId);
          pageDoc.set('blockOrder', JSON.stringify(newBlockIds));
          pageDoc.delete(getBlockKey(blockId) as any);

          // Focus previous block (handled automatically)
        }
      }
    },
    [pageDoc, pageData, pageId, synckit, triggerBlockChangeAnimation]
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
        {/* Playground banner */}
        {pageId === 'playground' && (
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🌍</div>
                <div>
                  <h3 className="font-semibold text-purple-900 dark:text-purple-100">Public Playground</h3>
                  <p className="text-sm text-purple-700 dark:text-purple-300">
                    Everyone here can edit together • Real-time collaboration
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>You + others online</span>
              </div>
            </div>
          </div>
        )}

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
            {/* Snapshot indicator */}
            {snapshotScheduler && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-gray-700 dark:text-gray-300">
                  {pageId === 'playground' ? 'Community Restore' : `Auto-save${lastSnapshotTime ? ': ' + formatTimeSince(lastSnapshotTime) : ''}`}
                </span>
                {pageId !== 'playground' && (
                  <button
                    onClick={() => snapshotScheduler.triggerSnapshot()}
                    className="ml-1 px-2 py-0.5 bg-primary-500 hover:bg-primary-600 text-white rounded text-xs hover:scale-105 active:scale-95 transition-all duration-150"
                    title="Create snapshot now"
                  >
                    Save
                  </button>
                )}
                <button
                  onClick={() => setShowSnapshotDialog(true)}
                  className={`px-2 py-0.5 ${pageId === 'playground' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-600 hover:bg-gray-700'} text-white rounded text-xs hover:scale-105 active:scale-95 transition-all duration-150`}
                  title={pageId === 'playground' ? 'Restore if vandalized (anyone can use this)' : 'Restore from snapshot'}
                >
                  ↺ Restore
                </button>
                {hasRecording() && (
                  <button
                    onClick={() => setShowReplay(true)}
                    className="px-2 py-0.5 bg-purple-500 hover:bg-purple-600 text-white rounded text-xs hover:scale-105 active:scale-95 transition-all duration-150"
                    title="Watch document creation replay"
                  >
                    🎬 Replay
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Blocks */}
        {/* TODO: Add virtual scrolling for 100+ blocks */}
        <div className="space-y-2">
          {blocks.map((block, index) => (
            <div key={block.id} className="relative" data-block-id={block.id}>
              {/* Drop indicator */}
              {dropTargetIndex === index && draggedBlockId !== block.id && (
                <div className="absolute -top-1 left-0 right-0 h-1 bg-primary-500 rounded-full z-10 shadow-lg shadow-primary-500/50 animate-pulse" />
              )}

              <div className={changingBlocks.has(block.id) ? 'animate-block-change' : ''}>
                <CRDTBlockComponent
                  block={block}
                  pageId={pageId!}
                  blockIndex={index}
                  onContentChange={(content) => handleBlockContentChange(block.id, content)}
                  onKeyDown={(e) => handleBlockKeyDown(block.id, e)}
                  onDragStart={handleDragStart(block.id)}
                  onDragOver={handleDragOver(index)}
                  onDrop={handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedBlockId === block.id}
                  autoFocus={block.id === pendingFocusBlockId}
                  onToggleBodyChange={(body) => handleToggleBodyChange(block.id, body)}
                  onToggleStateChange={(collapsed) => handleToggleStateChange(block.id, collapsed)}
                  onDelete={() => handleBlockDelete(block.id)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Warning for large documents */}
        {blocks.length > 100 && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ This page has {blocks.length} blocks. Performance may be affected. Virtual scrolling coming soon.
          </div>
        )}
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

      {/* Snapshot Dialog */}
      {showSnapshotDialog && (
        <SnapshotDialog
          scheduler={snapshotScheduler}
          document={pageDoc}
          onClose={() => setShowSnapshotDialog(false)}
        />
      )}

      {/* Contribution Stats */}
      <ContributionStats
        contributors={contributors}
        localStats={localContributionStats}
        localUserName={userIdentity?.name || 'Anonymous'}
        localUserColor={userIdentity?.color || '#888888'}
      />

      {/* Milestone Celebration Confetti */}
      {showConfetti && (
        <Confetti onComplete={() => setShowConfetti(false)} />
      )}

      {/* Reaction Picker */}
      {reactionPicker && (
        <ReactionPicker
          position={reactionPicker}
          onReact={handleReaction}
          onClose={() => setReactionPicker(null)}
        />
      )}

      {/* Floating Reactions */}
      {floatingReactions.map((reaction) => (
        <FloatingReaction
          key={reaction.id}
          emoji={reaction.emoji}
          position={reaction.position}
          onComplete={() => handleReactionComplete(reaction.id)}
        />
      ))}

      {/* Time-Lapse Replay Overlay */}
      {showReplay && (
        <ReplayOverlay
          session={getSession()!}
          blocks={blocks}
          onClose={() => setShowReplay(false)}
        />
      )}
    </div>
  );
}

// Helper function to format time since last snapshot
function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 120) return '1 min ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 7200) return '1 hour ago';
  return `${Math.floor(seconds / 3600)} hours ago`;
}
