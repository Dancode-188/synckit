/**
 * Playground utilities
 * Handles playground initialization and archiving
 *
 * NOTE: Playground seeding is now handled by the seed-playground.ts script.
 * Run `npm run seed-playground` once before launch to populate the playground.
 * This avoids race conditions where multiple clients try to seed simultaneously.
 */

import type { SyncDocument } from '@synckit-js/sdk';
import { createBlock, PageDocument, BLOCK_TYPES } from './blocks';

/**
 * Initialize playground document structure
 *
 * This function only sets up the document if it's completely empty.
 * Actual seed content is populated by the seed-playground.ts script.
 *
 * @deprecated Use `npm run seed-playground` script instead for seeding.
 * This function now only ensures the document has basic structure.
 */
export async function initializePlayground(
  doc: SyncDocument<PageDocument>
): Promise<boolean> {
  try {
    // Check if already has blocks (seeded by script or has user content)
    const data = doc.get();
    const existingBlockOrder = data?.blockOrder ? JSON.parse(data.blockOrder as string) : [];

    if (existingBlockOrder.length > 0) {
      console.log('🌍 Playground already has content');
      return false;
    }

    // If completely empty, create a single empty block so users can start typing
    // The seed-playground script should have run before this, but this is a fallback
    console.log('🌍 Playground is empty - creating minimal structure');

    const emptyBlock = createBlock(BLOCK_TYPES.PARAGRAPH, '');

    await doc.set('id', 'playground');
    await doc.set('title', 'Public Playground');
    await doc.set('icon', '🌍');
    await doc.set('blockOrder', JSON.stringify([emptyBlock.id]));
    await doc.set('createdAt', Date.now());
    await doc.set('updatedAt', Date.now());
    await doc.set(`block:${emptyBlock.id}` as any, emptyBlock);

    console.log('✅ Playground initialized with empty structure');
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
