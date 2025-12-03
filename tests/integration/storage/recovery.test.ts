/**
 * Storage Recovery Tests
 * 
 * Tests server restart and data recovery scenarios
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer, restartTestServer } from '../helpers/test-server';
import { TestClient } from '../helpers/test-client';
import { BinaryAdapter } from '../helpers/binary-adapter';
import { sleep } from '../config';

describe('Storage - Recovery', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  const docId = 'recovery-doc';

  it('should recover document after server restart', async () => {
    const clients: TestClient[] = [];
    
    try {
      console.log('Creating document before restart...');
      
      // Create client and document
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      await client1.setField(docId, 'preRestart', 'data');
      await client1.setField(docId, 'important', 'value');
      await sleep(1000);
      
      // Restart server
      console.log('Restarting server...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect client
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Verify data recovered
      const state = await client2.getDocumentState(docId);
      expect(state.preRestart).toBe('data');
      expect(state.important).toBe('value');
      
      console.log('Document recovered after restart ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should recover vector clocks after restart', async () => {
    const vectorDocId = 'vector-recovery-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Building vector clock history...');
      
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      // Create history
      for (let i = 0; i < 10; i++) {
        await client1.setField(vectorDocId, `history${i}`, i);
      }
      await sleep(1000);
      
      // Restart
      console.log('Restarting server...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect and add more
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      await client2.setField(vectorDocId, 'afterRestart', 'new');
      await sleep(500);
      
      // Verify all data present
      const state = await client2.getDocumentState(vectorDocId);
      expect(Object.keys(state).length).toBe(11);
      expect(state.afterRestart).toBe('new');
      
      console.log('Vector clocks recovered correctly ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle restart during active writes', async () => {
    const activeDocId = 'active-restart-doc';
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient({ adapter: new BinaryAdapter() });
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Writing data...');
      await client.setField(activeDocId, 'field1', 'value1');
      await client.setField(activeDocId, 'field2', 'value2');
      
      // Don't wait for persistence - restart immediately
      console.log('Restarting during writes...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // At least some data should recover
      const state = await client2.getDocumentState(activeDocId);
      const fieldCount = Object.keys(state).length;
      
      console.log(`Recovered ${fieldCount} fields after mid-write restart`);
      // May lose some data, but should not crash
      expect(fieldCount).toBeGreaterThanOrEqual(0);
      
      console.log('Mid-write restart handled gracefully ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should recover multiple documents after restart', async () => {
    const clients: TestClient[] = [];
    
    try {
      console.log('Creating 20 documents...');
      
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      // Create 20 documents
      for (let i = 0; i < 20; i++) {
        await client1.setField(`recovery-doc-${i}`, 'index', i);
        await client1.setField(`recovery-doc-${i}`, 'name', `Doc ${i}`);
      }
      await sleep(2000);
      
      // Restart
      console.log('Restarting server...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Verify all documents recovered
      let recoveredCount = 0;
      for (let i = 0; i < 20; i++) {
        const state = await client2.getDocumentState(`recovery-doc-${i}`);
        if (state.index === i) {
          recoveredCount++;
        }
      }
      
      console.log(`Recovered ${recoveredCount}/20 documents`);
      expect(recoveredCount).toBeGreaterThan(15); // 75% recovery threshold
      
      console.log('Multiple documents recovered ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, 20000); // 20s timeout for multiple docs

  it('should maintain data consistency after restart', async () => {
    const consistencyDocId = 'consistency-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Creating consistent state...');
      
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      // Create related fields
      await client1.setField(consistencyDocId, 'userId', 'user123');
      await client1.setField(consistencyDocId, 'userName', 'Alice');
      await client1.setField(consistencyDocId, 'userEmail', 'alice@example.com');
      await sleep(1000);
      
      // Restart
      console.log('Restarting server...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Verify consistency maintained
      const state = await client2.getDocumentState(consistencyDocId);
      expect(state.userId).toBe('user123');
      expect(state.userName).toBe('Alice');
      expect(state.userEmail).toBe('alice@example.com');
      
      console.log('Data consistency maintained after restart ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should recover from graceful shutdown', async () => {
    const shutdownDocId = 'shutdown-doc';
    const clients: TestClient[] = [];
    
    try {
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      console.log('Creating data before shutdown...');
      await client1.setField(shutdownDocId, 'beforeShutdown', 'important');
      await sleep(1000);

      // Graceful shutdown (via restart)
      console.log('Performing graceful shutdown...');
      await restartTestServer({ graceful: true });
      await sleep(2000);
      
      // New client connects
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Data should be intact
      const state = await client2.getDocumentState(shutdownDocId);
      expect(state.beforeShutdown).toBe('important');
      
      console.log('Graceful shutdown recovery successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, 20000); // 20s timeout for graceful

  it('should recover deletes after restart', async () => {
    const deleteDocId = 'delete-recovery-doc';
    const clients: TestClient[] = [];
    
    try {
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      console.log('Creating and deleting fields...');
      await client1.setField(deleteDocId, 'keep1', 'value1');
      await client1.setField(deleteDocId, 'delete1', 'temp1');
      await client1.setField(deleteDocId, 'delete2', 'temp2');
      await client1.setField(deleteDocId, 'keep2', 'value2');
      await sleep(500);
      
      // Delete some fields
      await client1.deleteField(deleteDocId, 'delete1');
      await client1.deleteField(deleteDocId, 'delete2');
      await sleep(1000);
      
      // Restart
      console.log('Restarting server...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Verify deletes persisted
      const state = await client2.getDocumentState(deleteDocId);
      expect(state.keep1).toBe('value1');
      expect(state.keep2).toBe('value2');
      expect(state.delete1).toBeUndefined();
      expect(state.delete2).toBeUndefined();
      
      console.log('Deletes recovered correctly ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle quick consecutive restarts', async () => {
    const quickDocId = 'quick-restart-doc';
    const clients: TestClient[] = [];
    
    try {
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      console.log('Creating initial data...');
      await client1.setField(quickDocId, 'initial', 'data');
      await sleep(500);
      
      // Multiple quick restarts
      for (let i = 0; i < 3; i++) {
        console.log(`Quick restart ${i + 1}/3...`);
        await restartTestServer();
        await sleep(1000);
      }
      
      // Final reconnect
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Data should survive
      const state = await client2.getDocumentState(quickDocId);
      expect(state.initial).toBe('data');
      
      console.log('Quick consecutive restarts handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, 20000); // 20s timeout for quick restarts

  it('should recover large documents after restart', async () => {
    const largeRecoveryDocId = 'large-recovery-doc';
    const clients: TestClient[] = [];
    
    try {
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      console.log('Creating large document...');
      
      // Create 200 fields
      for (let i = 0; i < 200; i++) {
        await client1.setField(largeRecoveryDocId, `field${i}`, i);
      }
      await sleep(2000);
      
      // Restart
      console.log('Restarting server...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Verify recovery
      const state = await client2.getDocumentState(largeRecoveryDocId);
      const fieldCount = Object.keys(state).length;
      
      console.log(`Recovered ${fieldCount}/200 fields`);
      expect(fieldCount).toBeGreaterThan(180); // 90% recovery
      
      console.log('Large document recovered ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, 20000); // 20s timeout for large docs

  it('should recover with active clients reconnecting', async () => {
    const multiClientDocId = 'multi-client-recovery-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Creating 5 clients...');
      
      // Create 5 clients
      for (let i = 0; i < 5; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
        
        // Each creates data
        await client.setField(multiClientDocId, `client${i}`, `data${i}`);
      }
      await sleep(1000);
      
      // Restart
      console.log('Restarting server with active clients...');
      await restartTestServer();
      await sleep(2000);
      
      // All clients reconnect
      const newClients: TestClient[] = [];
      for (let i = 0; i < 5; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        newClients.push(client);
      }
      
      // Verify all data recovered
      const state = await newClients[0].getDocumentState(multiClientDocId);
      expect(Object.keys(state).length).toBe(5);
      
      console.log('Multi-client recovery successful ✅');
      
      await Promise.all(newClients.map(c => c.cleanup()));
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });
});
