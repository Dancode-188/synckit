/**
 * Playground utilities
 * Handles playground initialization and archiving
 *
 * The playground is seeded client-side when first accessed.
 * The block.content field is used as fallback seeding in useBlockText.
 */

import type { SyncDocument } from '@synckit-js/sdk';
import { createBlock, PageDocument, BLOCK_TYPES } from './blocks';

/**
 * Seed content for the playground
 * These are used as block.content for fallback seeding in useBlockText
 */
const PLAYGROUND_SEED_BLOCKS = [
  { type: BLOCK_TYPES.HEADING_1, content: 'Welcome to the Public Playground' },
  { type: BLOCK_TYPES.PARAGRAPH, content: 'This is a **shared space** where anyone can edit. Your changes sync in real-time across all connected users.' },
  { type: BLOCK_TYPES.HEADING_2, content: 'Try These Features' },
  { type: BLOCK_TYPES.BULLETED_LIST, content: 'Type `/` to see available block types' },
  { type: BLOCK_TYPES.BULLETED_LIST, content: 'Use `**bold**` and `*italic*` for formatting' },
  { type: BLOCK_TYPES.BULLETED_LIST, content: 'Create links with `[text](url)`' },
  { type: BLOCK_TYPES.PARAGRAPH, content: 'Open this page in another tab or device to see real-time collaboration in action!' },
];

/**
 * Initialize playground document structure with seed content
 *
 * This function sets up the playground if it's completely empty.
 * The block.content field is used by useBlockText for fallback seeding.
 */
export async function initializePlayground(
  doc: SyncDocument<PageDocument>
): Promise<boolean> {
  try {
    // Check if already has blocks (has user content)
    const data = doc.get();
    const existingBlockOrder = data?.blockOrder ? JSON.parse(data.blockOrder as string) : [];

    if (existingBlockOrder.length > 0) {
      console.log('🌍 Playground already has content');
      return false;
    }

    // Create blocks with seed content
    console.log('🌍 Initializing playground with seed content');

    const blocks = PLAYGROUND_SEED_BLOCKS.map(({ type, content }) =>
      createBlock(type, content)
    );
    const blockOrder = blocks.map(b => b.id);

    await doc.set('id', 'playground');
    await doc.set('title', 'Public Playground');
    await doc.set('icon', '🌍');
    await doc.set('blockOrder', JSON.stringify(blockOrder));
    await doc.set('createdAt', Date.now());
    await doc.set('updatedAt', Date.now());

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
