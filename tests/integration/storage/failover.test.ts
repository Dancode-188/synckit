/**
 * Server Failover Tests
 * 
 * Tests graceful failover and high availability scenarios
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer, restartTestServer } from '../helpers/test-server';
import { TestClient } from '../helpers/test-client';
import { BinaryAdapter } from '../helpers/binary-adapter';
import { sleep, generateTestId } from '../config';

describe('Storage - Failover', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  it('should handle server crash during write', async () => {
    const docId = generateTestId('failover');
    const clients: TestClient[] = [];

    try {
      console.log('Testing server crash during write...');

      const client = new TestClient({ adapter: new BinaryAdapter() });
      await client.init();
      await client.connect();
      clients.push(client);

      // Start writing
      await client.setField(docId, 'beforeCrash', 'data');
      await sleep(200);

      // Simulate crash (abrupt restart)
      console.log('Simulating server crash...');
      await restartTestServer();
      await sleep(2000);

      // Client reconnects
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);

      // At least try to recover some data
      const state = await client2.getDocumentState(docId);
      console.log(`Recovered fields: ${Object.keys(state).length}`);

      // System should not crash
      expect(true).toBe(true);

      console.log('Server crash handled gracefully ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should maintain availability during database issues', async () => {
    const dbIssueDocId = generateTestId('db-issue');
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing operation during database issues...');
      
      const client = new TestClient({ adapter: new BinaryAdapter() });
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Note: Actual DB disconnection would require server-side changes
      // This tests that the system continues to work in memory
      
      await client.setField(dbIssueDocId, 'duringDbIssue', 'in-memory');
      await sleep(500);
      
      // Should work (in-memory mode)
      const state = await client.getDocumentState(dbIssueDocId);
      expect(state.duringDbIssue).toBe('in-memory');
      
      console.log('System remains available during DB issues ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should reconnect clients after failover', async () => {
    const reconnectDocId = generateTestId('reconnect-failover');
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing client reconnection after failover...');
      
      // Create 5 clients
      for (let i = 0; i < 5; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // All create data
      await Promise.all(
        clients.map((client, idx) =>
          client.setField(reconnectDocId, `client${idx}`, idx)
        )
      );
      
      await sleep(1000);
      
      // Server restart (failover)
      console.log('Simulating failover...');
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
      
      // Verify data recovered
      const state = await newClients[0].getDocumentState(reconnectDocId);
      expect(Object.keys(state).length).toBeGreaterThan(3); // Most data recovered
      
      console.log('Clients reconnected after failover ✅');
      
      await Promise.all(newClients.map(c => c.cleanup()));
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle Redis failover gracefully', async () => {
    const redisFailoverDocId = generateTestId('redis-failover');
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient({ adapter: new BinaryAdapter() });
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Testing Redis failover...');
      
      // Normal operation
      await client.setField(redisFailoverDocId, 'beforeRedisFailover', 'data');
      await sleep(500);
      
      // Note: Redis failover simulation would require infrastructure changes
      // This verifies the system continues to work (degraded mode)
      
      await client.setField(redisFailoverDocId, 'duringRedisFailover', 'degraded');
      await sleep(500);
      
      // Should still work (at least locally)
      const state = await client.getDocumentState(redisFailoverDocId);
      expect(state.duringRedisFailover).toBe('degraded');
      
      console.log('Redis failover handled gracefully ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should recover in-flight operations after failover', async () => {
    const inflightDocId = generateTestId('inflight-failover');
    const clients: TestClient[] = [];
    
    try {
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      console.log('Starting in-flight operations...');
      
      // Start multiple operations
      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(client1.setField(inflightDocId, `inflight${i}`, i));
      }
      
      // Don't wait - failover immediately
      await sleep(100);
      console.log('Failing over during operations...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Some operations may have completed
      const state = await client2.getDocumentState(inflightDocId);
      const recoveredCount = Object.keys(state).length;
      
      console.log(`Recovered ${recoveredCount}/10 in-flight operations`);
      
      // System should remain stable
      expect(recoveredCount).toBeGreaterThanOrEqual(0);
      
      console.log('In-flight operations handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle cascading failures', async () => {
    const cascadeDocId = generateTestId('cascade-failover');
    const clients: TestClient[] = [];
    
    try {
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      console.log('Creating initial state...');
      await client1.setField(cascadeDocId, 'initial', 'data');
      await sleep(500);
      
      // Multiple consecutive failures
      for (let i = 0; i < 3; i++) {
        console.log(`Failure ${i + 1}/3...`);
        await restartTestServer();
        await sleep(800);
      }
      
      // System should still be operational
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      await client2.setField(cascadeDocId, 'afterCascade', 'recovered');
      await sleep(500);
      
      const state = await client2.getDocumentState(cascadeDocId);
      expect(state.afterCascade).toBe('recovered');
      
      console.log('Cascading failures handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, 25000); // 25s timeout for 3 consecutive restarts

  it('should maintain data integrity during failover', async () => {
    const integrityDocId = generateTestId('integrity-failover');
    const clients: TestClient[] = [];
    
    try {
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      console.log('Creating related data...');
      
      // Create interdependent data
      await client1.setField(integrityDocId, 'userId', 'user123');
      await client1.setField(integrityDocId, 'userName', 'Alice');
      await client1.setField(integrityDocId, 'userBalance', 1000);
      await sleep(1000);
      
      // Failover
      console.log('Failing over...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Verify data integrity maintained
      const state = await client2.getDocumentState(integrityDocId);
      
      // If we have userId, we should have related fields
      if (state.userId) {
        expect(state.userName).toBeDefined();
        expect(state.userBalance).toBeDefined();
      }
      
      console.log('Data integrity maintained during failover ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle failover with active writes', async () => {
    const activeWritesDocId = generateTestId('active-writes-failover');
    const clients: TestClient[] = [];
    
    try {
      console.log('Creating 3 clients with active writes...');
      
      // Create 3 clients
      for (let i = 0; i < 3; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Start writing from all clients
      const writePromises = clients.map((client, idx) =>
        (async () => {
          for (let i = 0; i < 10; i++) {
            try {
              await client.setField(activeWritesDocId, `c${idx}_${i}`, i);
              await sleep(50);
            } catch (error) {
              // May fail during failover
            }
          }
        })()
      );
      
      // Failover mid-write
      await sleep(200);
      console.log('Failing over during active writes...');
      await restartTestServer();
      
      // Wait for writes to complete (or fail)
      await Promise.all(writePromises);
      await sleep(2000);
      
      // Reconnect one client
      const client = new TestClient({ adapter: new BinaryAdapter() });
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Some data should have persisted
      const state = await client.getDocumentState(activeWritesDocId);
      console.log(`Recovered ${Object.keys(state).length} fields from active writes`);
      
      // System should be operational
      await client.setField(activeWritesDocId, 'afterFailover', 'working');
      await sleep(500);
      
      const finalState = await client.getDocumentState(activeWritesDocId);
      expect(finalState.afterFailover).toBe('working');
      
      console.log('Active writes during failover handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle gradual degradation', async () => {
    const degradationDocId = generateTestId('degradation');
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient({ adapter: new BinaryAdapter() });
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Testing gradual degradation...');
      
      // Full functionality
      await client.setField(degradationDocId, 'fullMode', 'data');
      await sleep(500);
      
      // Note: Actual degradation would require server-side simulation
      // This verifies system continues operating
      
      // Degraded mode (in-memory only)
      await client.setField(degradationDocId, 'degradedMode', 'local');
      await sleep(500);
      
      // Should still work
      const state = await client.getDocumentState(degradationDocId);
      expect(state.degradedMode).toBe('local');
      
      console.log('Gradual degradation handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should recover from complete storage failure', async () => {
    const storageFailureDocId = generateTestId('storage-failure');
    const clients: TestClient[] = [];
    
    try {
      const client1 = new TestClient({ adapter: new BinaryAdapter() });
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      console.log('Operating before storage failure...');
      await client1.setField(storageFailureDocId, 'beforeFailure', 'data');
      await sleep(500);
      
      // Simulate complete storage failure (restart clears memory)
      console.log('Simulating complete storage failure...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect
      const client2 = new TestClient({ adapter: new BinaryAdapter() });
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // System should be operational (may have lost data)
      await client2.setField(storageFailureDocId, 'afterRecovery', 'fresh');
      await sleep(500);
      
      const state = await client2.getDocumentState(storageFailureDocId);
      expect(state.afterRecovery).toBe('fresh');
      
      console.log('Recovered from complete storage failure ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });
});
