#!/usr/bin/env node
/**
 * Awareness Protocol Integration Test
 * Tests client-server awareness synchronization with multiple clients
 *
 * Prerequisites: Server must be running on ws://localhost:3000
 * Run with: node sdk/tests/awareness-integration-test.mjs
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Awareness Protocol Integration Test\n');

// Test counter
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    failed++;
  }
}

// Helper to wait for condition
function waitFor(conditionFn, timeout = 5000, checkInterval = 100) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      try {
        if (conditionFn()) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for condition'));
        } else {
          setTimeout(check, checkInterval);
        }
      } catch (error) {
        reject(error);
      }
    };

    check();
  });
}

// Helper to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to get awareness and wait for initialization
async function getAwarenessReady(synckit, documentId) {
  const awareness = synckit.getAwareness(documentId);
  await sleep(500); // Wait for async initialization
  return awareness;
}

// Test Setup
console.log('📦 Setting up test environment...\n');

const SERVER_URL = 'ws://127.0.0.1:8080/ws';
const DOCUMENT_ID = 'awareness-test-doc';

// Import SDK
let SyncKit;
try {
  const sdk = await import('../dist/index.mjs');
  SyncKit = sdk.SyncKit;
  console.log('✅ SDK imported successfully\n');
} catch (error) {
  console.error('❌ Failed to import SDK. Make sure it\'s built: cd sdk && npm run build');
  console.error(`   Error: ${error.message}`);
  process.exit(1);
}

// Test 1: Single Client Awareness
console.log('🔷 Test 1: Single Client Awareness\n');

await asyncTest('Initialize client with server connection', async () => {
  const client = new SyncKit({
    storage: 'memory',
    serverUrl: SERVER_URL,
  });

  await client.init();

  if (!client.isInitialized()) {
    throw new Error('Client not initialized');
  }

  console.log(`   Client ID: ${client.getClientId()}`);

  // Wait for connection
  await sleep(1000);

  const networkStatus = client.getNetworkStatus();
  if (!networkStatus) {
    throw new Error('Network status not available');
  }

  console.log(`   Connection state: ${networkStatus.connectionState}`);

  if (networkStatus.connectionState !== 'connected') {
    throw new Error(`Expected connected state, got ${networkStatus.connectionState}`);
  }

  client.dispose();
});

await asyncTest('Create document and get awareness', async () => {
  const client = new SyncKit({
    storage: 'memory',
    serverUrl: SERVER_URL,
  });

  await client.init();
  await sleep(1000); // Wait for connection

  const doc = client.document(DOCUMENT_ID);
  await doc.init();

  const awareness = await getAwarenessReady(client, DOCUMENT_ID);

  if (!awareness) {
    throw new Error('Failed to get awareness');
  }

  console.log(`   Awareness client ID: ${awareness.getClientId()}`);

  // Cleanup
  doc.dispose();
  client.dispose();
});

await asyncTest('Set local awareness state', async () => {
  const client = new SyncKit({
    storage: 'memory',
    serverUrl: SERVER_URL,
  });

  await client.init();
  await sleep(1000);

  const doc = client.document(DOCUMENT_ID + '-1');
  await doc.init();

  const awareness = await getAwarenessReady(client, DOCUMENT_ID + '-1');

  const update = await awareness.setLocalState({
    user: { name: 'Alice', color: '#FF6B6B' },
    cursor: { x: 100, y: 200 }
  });

  if (!update) {
    throw new Error('Failed to set local state');
  }

  console.log(`   Update clock: ${update.clock}`);

  const localState = awareness.getLocalState();
  if (!localState || localState.state.user.name !== 'Alice') {
    throw new Error('Local state not set correctly');
  }

  console.log(`   Local state: ${JSON.stringify(localState.state)}`);

  // Cleanup
  doc.dispose();
  client.dispose();
});

// Test 2: Multi-Client Awareness Sync
console.log('\n🔷 Test 2: Multi-Client Awareness Synchronization\n');

await asyncTest('Two clients see each other\'s awareness', async () => {
  // Create client 1
  const client1 = new SyncKit({
    storage: 'memory',
    serverUrl: SERVER_URL,
  });

  await client1.init();
  await sleep(500);

  const doc1 = client1.document(DOCUMENT_ID + '-2');
  await doc1.init();

  const awareness1 = await getAwarenessReady(client1, DOCUMENT_ID + '-2');

  // Set state for client 1
  await awareness1.setLocalState({
    user: { name: 'Alice', color: '#FF6B6B' }
  });

  console.log(`   Client 1 ID: ${client1.getClientId()}`);

  // Wait for subscription to complete
  await sleep(1000);

  // Create client 2
  const client2 = new SyncKit({
    storage: 'memory',
    serverUrl: SERVER_URL,
  });

  await client2.init();
  await sleep(500);

  const doc2 = client2.document(DOCUMENT_ID + '-2');
  await doc2.init();

  const awareness2 = await getAwarenessReady(client2, DOCUMENT_ID + '-2');

  console.log(`   Client 2 ID: ${client2.getClientId()}`);

  // Set state for client 2
  await awareness2.setLocalState({
    user: { name: 'Bob', color: '#4ECDC4' }
  });

  // Wait for awareness to sync
  await sleep(1000);

  // Check if client 1 sees client 2
  const states1 = awareness1.getStates();
  console.log(`   Client 1 sees ${states1.size} clients`);

  if (states1.size < 2) {
    throw new Error(`Client 1 should see 2 clients, saw ${states1.size}`);
  }

  // Check if client 2 sees client 1
  const states2 = awareness2.getStates();
  console.log(`   Client 2 sees ${states2.size} clients`);

  if (states2.size < 2) {
    throw new Error(`Client 2 should see 2 clients, saw ${states2.size}`);
  }

  // Verify client 2 can see Alice's state
  let foundAlice = false;
  for (const [clientId, state] of states2) {
    if (state.state.user?.name === 'Alice') {
      foundAlice = true;
      console.log(`   Client 2 sees Alice: ${JSON.stringify(state.state)}`);
      break;
    }
  }

  if (!foundAlice) {
    throw new Error('Client 2 did not receive Alice\'s awareness state');
  }

  // Cleanup
  doc1.dispose();
  doc2.dispose();
  client1.dispose();
  client2.dispose();
});

await asyncTest('Three clients with awareness updates', async () => {
  const clients = [];
  const docs = [];
  const awarenesses = [];

  // Create 3 clients
  for (let i = 0; i < 3; i++) {
    const client = new SyncKit({
      storage: 'memory',
      serverUrl: SERVER_URL,
    });

    await client.init();
    await sleep(300);

    const doc = client.document(DOCUMENT_ID + '-3');
    await doc.init();

    const awareness = await getAwarenessReady(client, DOCUMENT_ID + '-3');

    await awareness.setLocalState({
      user: { name: `User${i + 1}`, color: `#${i}${i}${i}` },
      index: i
    });

    clients.push(client);
    docs.push(doc);
    awarenesses.push(awareness);

    console.log(`   Client ${i + 1} ID: ${client.getClientId()}`);
  }

  // Wait for all awareness to sync
  await sleep(1500);

  // Check each client sees all 3 clients
  for (let i = 0; i < 3; i++) {
    const states = awarenesses[i].getStates();
    console.log(`   Client ${i + 1} sees ${states.size} clients`);

    if (states.size < 3) {
      throw new Error(`Client ${i + 1} should see 3 clients, saw ${states.size}`);
    }
  }

  // Update client 2's state
  await awarenesses[1].setLocalState({
    user: { name: 'UpdatedUser2', color: '#UPDATED' },
    index: 1,
    updated: true
  });

  await sleep(1000);

  // Verify client 1 and 3 see the update
  for (const [i, awareness] of [awarenesses[0], awarenesses[2]].entries()) {
    const states = awareness.getStates();
    let foundUpdate = false;

    for (const [clientId, state] of states) {
      if (state.state.updated === true) {
        foundUpdate = true;
        console.log(`   Client ${i === 0 ? 1 : 3} sees updated state: ${JSON.stringify(state.state.user)}`);
        break;
      }
    }

    if (!foundUpdate) {
      throw new Error(`Client ${i === 0 ? 1 : 3} did not see the update`);
    }
  }

  // Cleanup
  for (let i = 0; i < 3; i++) {
    docs[i].dispose();
    clients[i].dispose();
  }
});

// Test 3: Awareness Subscribe Callback
console.log('\n🔷 Test 3: Awareness Subscribe Callback\n');

await asyncTest('Subscribe to awareness changes', async () => {
  const client1 = new SyncKit({
    storage: 'memory',
    serverUrl: SERVER_URL,
  });

  await client1.init();
  await sleep(500);

  const doc1 = client1.document(DOCUMENT_ID + '-4');
  await doc1.init();

  const awareness1 = await getAwarenessReady(client1, DOCUMENT_ID + '-4');

  let updateCount = 0;
  let receivedUpdates = [];

  // Subscribe to changes
  const unsubscribe = awareness1.subscribe((event) => {
    updateCount++;
    receivedUpdates.push(event);
    console.log(`   Received update: ${JSON.stringify(event)}`);
  });

  // Set initial state
  await awareness1.setLocalState({
    user: { name: 'Alice' }
  });

  await sleep(500);

  // Create second client
  const client2 = new SyncKit({
    storage: 'memory',
    serverUrl: SERVER_URL,
  });

  await client2.init();
  await sleep(500);

  const doc2 = client2.document(DOCUMENT_ID + '-4');
  await doc2.init();

  const awareness2 = await getAwarenessReady(client2, DOCUMENT_ID + '-4');

  // Set state on client 2
  await awareness2.setLocalState({
    user: { name: 'Bob' }
  });

  // Wait for update to propagate
  await sleep(1000);

  console.log(`   Total updates received: ${updateCount}`);

  if (updateCount === 0) {
    throw new Error('No awareness updates received');
  }

  // Check if we received Bob's update
  let foundBob = false;
  for (const update of receivedUpdates) {
    if (update.added && update.added.length > 0) {
      const states = awareness1.getStates();
      for (const [clientId, state] of states) {
        if (state.state.user?.name === 'Bob') {
          foundBob = true;
          break;
        }
      }
    }
  }

  if (!foundBob) {
    throw new Error('Did not receive Bob\'s awareness update');
  }

  unsubscribe();
  doc1.dispose();
  doc2.dispose();
  client1.dispose();
  client2.dispose();
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary\n');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed === 0) {
  console.log('\n🎉 ALL TESTS PASSED! Awareness protocol is working!\n');
  console.log('Next steps:');
  console.log('1. Add lifecycle features (heartbeat, beforeunload, reconnection)');
  console.log('2. Create browser examples');
  console.log('3. Add to documentation\n');
  process.exit(0);
} else {
  console.log('\n❌ SOME TESTS FAILED. Fix issues before proceeding.\n');
  process.exit(1);
}
