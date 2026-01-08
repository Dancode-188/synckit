/**
 * Playground utilities
 * Handles playground initialization, seed content, and archiving
 */

import type { SyncDocument } from '@synckit-js/sdk';
import { createBlock, PageDocument, BLOCK_TYPES } from './blocks';

/**
 * Initialize playground with welcoming seed content
 * Only runs if playground is empty
 */
export async function initializePlayground(doc: SyncDocument<PageDocument>): Promise<boolean> {
  try {
    // Check if already initialized
    const data = doc.get();
    const hasContent = data && Object.keys(data).length > 0;

    if (hasContent) {
      console.log('🌍 Playground already initialized');
      return false;
    }

    console.log('🌱 Initializing playground with seed content...');

    // Create welcome blocks
    const welcomeHeading = createBlock(BLOCK_TYPES.HEADING_1, 'Welcome to LocalWrite! 👋');
    const introText = createBlock(BLOCK_TYPES.PARAGRAPH, 'This is a **PUBLIC playground** - everyone here right now can edit this together! See those cursors moving? Those are real people collaborating with you.');

    const tryHeading = createBlock(BLOCK_TYPES.HEADING_2, 'Try This:');
    const tryItem1 = createBlock(BLOCK_TYPES.BULLETED_LIST, 'Type your name below ↓');
    const tryItem2 = createBlock(BLOCK_TYPES.BULLETED_LIST, 'Press `Cmd+B` for **bold**, `Cmd+I` for *italic*');
    const tryItem3 = createBlock(BLOCK_TYPES.BULLETED_LIST, 'Type `/` to see block options');
    const tryItem4 = createBlock(BLOCK_TYPES.BULLETED_LIST, 'Create a private room for your team →');

    const divider = createBlock(BLOCK_TYPES.PARAGRAPH, '---');

    const promptHeading = createBlock(BLOCK_TYPES.HEADING_3, '💭 Community Prompt');
    const promptText = createBlock(BLOCK_TYPES.QUOTE, 'What\'s the weirdest bug you\'ve ever encountered? Share your story below!');

    const emptyBlock = createBlock(BLOCK_TYPES.PARAGRAPH, '');

    // Collect all blocks
    const blocks = [
      welcomeHeading,
      introText,
      tryHeading,
      tryItem1,
      tryItem2,
      tryItem3,
      tryItem4,
      divider,
      promptHeading,
      promptText,
      emptyBlock,
    ];

    // Create block order
    const blockOrder = blocks.map(b => b.id);

    // Set document metadata
    await doc.set('id', 'playground');
    await doc.set('title', 'Public Playground');
    await doc.set('icon', '🌍');
    await doc.set('blockOrder', JSON.stringify(blockOrder));
    await doc.set('createdAt', Date.now());
    await doc.set('updatedAt', Date.now());

    // Set all blocks
    for (const block of blocks) {
      await doc.set(`block:${block.id}` as any, block);
    }

    console.log('✅ Playground initialized with seed content');
    return true;
  } catch (error) {
    console.error('Failed to initialize playground:', error);
    return false;
  }
}

/**
 * Check if playground needs archiving (approaching block limit)
 */
export function needsArchiving(blockCount: number): boolean {
  return blockCount >= 900; // Archive at 900 blocks (safety margin before 1000 limit)
}

/**
 * Get archive document ID for current date
 */
export function getArchiveDocumentId(): string {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return `playground-archive-${dateStr}`;
}

/**
 * Archive old blocks from playground
 * Moves oldest 400 blocks to archive document
 */
export async function archiveOldBlocks(
  playgroundDoc: SyncDocument<PageDocument>,
  synckit: any // Use any to avoid complex type constraints
): Promise<number> {
  try {
    const data = playgroundDoc.get();
    if (!data || !data.blockOrder) return 0;

    const blockOrder = JSON.parse(data.blockOrder as string);

    if (blockOrder.length < 900) {
      return 0; // No need to archive yet
    }

    console.log('🗄️ Archiving old playground blocks...');

    // Take oldest 400 blocks
    const blocksToArchive = blockOrder.slice(0, 400);
    const remainingBlocks = blockOrder.slice(400);

    // Create archive document
    const archiveDocId = getArchiveDocumentId();
    const archiveDoc = synckit.document(archiveDocId);
    await archiveDoc.init();

    // Check if archive already has content
    const archiveData = archiveDoc.get();
    const existingArchiveOrder = archiveData?.blockOrder
      ? JSON.parse(archiveData.blockOrder as string)
      : [];

    // Move blocks to archive
    const archiveBlockOrder = [...existingArchiveOrder];

    for (const blockId of blocksToArchive) {
      const blockKey = `block:${blockId}`;
      const block = (data as any)[blockKey];

      if (block) {
        // Add to archive
        await archiveDoc.set(blockKey as any, block);
        archiveBlockOrder.push(blockId);

        // Remove from playground
        await playgroundDoc.delete(blockKey as any);
      }
    }

    // Update archive metadata
    await archiveDoc.set('id', archiveDocId);
    await archiveDoc.set('title', `Playground Archive (${new Date().toLocaleDateString()})`);
    await archiveDoc.set('icon', '🗄️');
    await archiveDoc.set('blockOrder', JSON.stringify(archiveBlockOrder));
    await archiveDoc.set('updatedAt', Date.now());
    if (!archiveData?.createdAt) {
      await archiveDoc.set('createdAt', Date.now());
    }

    // Update playground block order
    await playgroundDoc.set('blockOrder', JSON.stringify(remainingBlocks));
    await playgroundDoc.set('updatedAt', Date.now());

    console.log(`✅ Archived ${blocksToArchive.length} blocks to ${archiveDocId}`);
    return blocksToArchive.length;
  } catch (error) {
    console.error('Failed to archive blocks:', error);
    return 0;
  }
}
