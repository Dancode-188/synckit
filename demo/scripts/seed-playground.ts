#!/usr/bin/env npx ts-node
/**
 * Seed Playground Script
 *
 * One-time script to seed the public playground with welcome content.
 * Run this once before launch to populate the playground.
 *
 * Usage:
 *   npm run seed-playground
 *   # or
 *   npx ts-node scripts/seed-playground.ts
 *
 * The script connects to the server, seeds the content, waits for sync,
 * then disconnects. Safe to run multiple times - it checks if content exists.
 */

import { SyncKit, MemoryStorage } from '@synckit-js/sdk';

// Server URL - same as production
const SERVER_URL = 'wss://synckit-localwrite.fly.dev/ws';

// Block types (matching demo/src/lib/constants.ts)
const BLOCK_TYPES = {
  PARAGRAPH: 'paragraph',
  HEADING_1: 'heading1',
  HEADING_2: 'heading2',
  HEADING_3: 'heading3',
  BULLETED_LIST: 'bulletedList',
  NUMBERED_LIST: 'numberedList',
  TODO: 'todo',
  CODE: 'code',
  QUOTE: 'quote',
  IMAGE: 'image',
  TOGGLE: 'toggle',
} as const;

type BlockType = typeof BLOCK_TYPES[keyof typeof BLOCK_TYPES];

interface Block {
  id: string;
  type: BlockType;
  content: string;
  createdAt: number;
  updatedAt: number;
}

function createBlock(type: BlockType, content: string = ''): Block {
  const now = Date.now();
  return {
    id: `block-${now}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    content,
    createdAt: now,
    updatedAt: now,
  };
}

async function seedPlayground() {
  console.log('🌱 Starting playground seeding...');
  console.log(`📡 Connecting to ${SERVER_URL}`);

  // Create SyncKit with memory storage (Node.js compatible)
  const synckit = new SyncKit({
    name: 'localwrite-seeder',
    storage: new MemoryStorage(),
    serverUrl: SERVER_URL,
  });

  try {
    await synckit.init();
    console.log('✅ Connected to server');

    // Get playground document
    const doc = synckit.document<any>('playground');
    await doc.init();

    // Wait for initial sync to pull existing content from server
    console.log('⏳ Waiting for initial sync...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if already has content (from server)
    const existingData = doc.get();
    const existingBlockOrder = existingData?.blockOrder
      ? JSON.parse(existingData.blockOrder as string)
      : [];

    if (existingBlockOrder.length > 0) {
      console.log(`⏭️  Playground already has ${existingBlockOrder.length} blocks, skipping seed`);
      console.log('   (Delete the playground document on server to re-seed)');
      return;
    }

    console.log('📝 Creating seed content...');

    // Create welcome blocks
    const blocks: Block[] = [
      createBlock(BLOCK_TYPES.HEADING_1, 'Welcome to LocalWrite! 👋'),
      createBlock(BLOCK_TYPES.PARAGRAPH, 'This is a **PUBLIC playground** - everyone here right now can edit this together! See those cursors moving? Those are real people collaborating with you.'),
      createBlock(BLOCK_TYPES.HEADING_2, 'Try This:'),
      createBlock(BLOCK_TYPES.BULLETED_LIST, 'Type your name below ↓'),
      createBlock(BLOCK_TYPES.BULLETED_LIST, 'Press `Cmd+B` for **bold**, `Cmd+I` for *italic*'),
      createBlock(BLOCK_TYPES.BULLETED_LIST, 'Type `/` to see block options'),
      createBlock(BLOCK_TYPES.BULLETED_LIST, 'Create a private room for your team →'),
      createBlock(BLOCK_TYPES.PARAGRAPH, '---'),
      createBlock(BLOCK_TYPES.HEADING_3, '💭 Community Prompt'),
      createBlock(BLOCK_TYPES.QUOTE, 'What\'s the weirdest bug you\'ve ever encountered? Share your story below!'),
      createBlock(BLOCK_TYPES.PARAGRAPH, ''),
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

    console.log(`📦 Created ${blocks.length} blocks in document`);

    // Now seed SyncText for each block with content
    console.log('📝 Seeding SyncText content...');

    for (const block of blocks) {
      if (block.content) {
        const textDocId = `playground:text:${block.id}`;
        const text = synckit.text(textDocId);
        await text.init();

        // Only insert if truly empty
        if (text.get() === '') {
          await text.insert(0, block.content);
          console.log(`   ✓ Seeded: "${block.content.substring(0, 40)}${block.content.length > 40 ? '...' : ''}"`);
        }
      }
    }

    // Wait for sync to complete
    console.log('⏳ Waiting for sync to complete...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('');
    console.log('✅ Playground seeded successfully!');
    console.log('');
    console.log('   Blocks created:', blocks.length);
    console.log('   SyncText docs:', blocks.filter(b => b.content).length);
    console.log('');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    // Disconnect
    console.log('👋 Disconnecting...');
    synckit.dispose();
  }
}

// Run the script
seedPlayground()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
