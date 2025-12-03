/**
 * Concurrent Clients Load Tests
 * 
 * Tests system behavior with 10, 100, and 1000+ concurrent clients
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server';
import { TestClient } from '../integration/helpers/test-client';
import { BinaryAdapter } from '../integration/helpers/binary-adapter';
import { sleep } from '../integration/config';

describe('Load - Concurrent Clients', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  // Helper to generate unique document ID per test
  const uniqueDocId = () => `concurrent-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it('should handle 10 concurrent clients', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 10 clients
      for (let i = 0; i < 10; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        clients.push(client);
      }
      
      // All connect simultaneously
      const startTime = Date.now();
      await Promise.all(clients.map(c => c.connect()));
      const connectTime = Date.now() - startTime;
      
      console.log(`10 clients connected in ${connectTime}ms`);
      expect(connectTime).toBeLessThan(3000);
      
      // Each client makes a change
      await Promise.all(
        clients.map((client, idx) =>
          client.setField(docId, `client${idx}`, `value${idx}`)
        )
      );
      
      // Wait for convergence
      await sleep(2000);
      
      // Verify all clients have all changes
      const states = await Promise.all(
        clients.map(c => c.getDocumentState(docId))
      );
      
      // All should have 10 fields
      expect(Object.keys(states[0]).length).toBe(10);
      
      // All states should be identical
      for (let i = 1; i < states.length; i++) {
        expect(states[i]).toEqual(states[0]);
      }
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle 100 concurrent clients', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 100 clients
      console.log('Creating 100 clients...');
      for (let i = 0; i < 100; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        clients.push(client);
      }
      
      // Connect in batches to avoid overwhelming
      console.log('Connecting 100 clients...');
      const batchSize = 20;
      for (let i = 0; i < clients.length; i += batchSize) {
        const batch = clients.slice(i, i + batchSize);
        await Promise.all(batch.map(c => c.connect()));
        await sleep(100);
      }
      
      console.log('All 100 clients connected');
      
      // Random clients make changes
      const activeClients = clients.slice(0, 20); // Use 20 active clients
      await Promise.all(
        activeClients.map((client, idx) =>
          client.setField(docId, `active${idx}`, `value${idx}`)
        )
      );
      
      // Wait for convergence
      await sleep(4000);
      
      // Sample verification (check 10 random clients)
      const sampleClients = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(i => clients[i]);
      const states = await Promise.all(
        sampleClients.map(c => c.getDocumentState(docId))
      );
      
      // Should have 20 fields
      expect(Object.keys(states[0]).length).toBe(20);
      
      // All sampled states should be identical
      for (let i = 1; i < states.length; i++) {
        expect(states[i]).toEqual(states[0]);
      }
      
      console.log('100 clients test passed');
    } finally {
      console.log('Cleaning up 100 clients...');
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should handle 1000 concurrent clients', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 1000 clients
      console.log('Creating 1000 clients...');
      const startCreate = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        clients.push(client);
        
        if ((i + 1) % 100 === 0) {
          console.log(`Created ${i + 1}/1000 clients`);
        }
      }
      
      console.log(`Created 1000 clients in ${Date.now() - startCreate}ms`);
      
      // Connect in batches
      console.log('Connecting 1000 clients...');
      const startConnect = Date.now();
      const batchSize = 50;
      
      for (let i = 0; i < clients.length; i += batchSize) {
        const batch = clients.slice(i, i + batchSize);
        await Promise.all(batch.map(c => c.connect()));
        
        if ((i + batchSize) % 100 === 0) {
          console.log(`Connected ${Math.min(i + batchSize, 1000)}/1000 clients`);
        }
        
        await sleep(50); // Small delay between batches
      }
      
      const connectTime = Date.now() - startConnect;
      console.log(`All 1000 clients connected in ${connectTime}ms`);
      expect(connectTime).toBeLessThan(60000); // Should connect within 1 minute
      
      // Use subset for actual operations
      console.log('Performing operations with 50 active clients...');
      const activeClients = clients.slice(0, 50);
      await Promise.all(
        activeClients.map((client, idx) =>
          client.setField(docId, `load${idx}`, `value${idx}`)
        )
      );
      
      // Wait for convergence
      await sleep(8000);
      
      // Sample verification (check 20 random clients from different ranges)
      const sampleIndices = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
      const sampleClients = sampleIndices.map(i => clients[i]);
      
      console.log('Verifying convergence across 1000 clients...');
      const states = await Promise.all(
        sampleClients.map(c => c.getDocumentState(docId))
      );
      
      // Should have 50 fields
      expect(Object.keys(states[0]).length).toBe(50);
      
      // All sampled states should be identical
      for (let i = 1; i < states.length; i++) {
        expect(states[i]).toEqual(states[0]);
      }
      
      console.log('1000 clients test passed ✅');
    } finally {
      console.log('Cleaning up 1000 clients...');
      // Cleanup in batches
      const cleanupBatchSize = 100;
      for (let i = 0; i < clients.length; i += cleanupBatchSize) {
        const batch = clients.slice(i, i + cleanupBatchSize);
        await Promise.all(batch.map(c => c.cleanup()));

        if ((i + cleanupBatchSize) % 200 === 0) {
          console.log(`Cleaned up ${Math.min(i + cleanupBatchSize, 1000)}/1000 clients`);
        }
      }
      console.log('Cleanup complete');
    }
  }, { timeout: 120000 });

  it('should measure connection throughput', async () => {
    const clients: TestClient[] = [];
    const connectionTimes: number[] = [];
    
    try {
      // Measure time to connect each client
      for (let i = 0; i < 50; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        clients.push(client);
        
        const startTime = Date.now();
        await client.connect();
        const connectTime = Date.now() - startTime;
        
        connectionTimes.push(connectTime);
      }
      
      // Calculate statistics
      const avgTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
      const maxTime = Math.max(...connectionTimes);
      const minTime = Math.min(...connectionTimes);
      
      console.log('Connection time statistics:');
      console.log(`  Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  Min: ${minTime}ms`);
      console.log(`  Max: ${maxTime}ms`);
      
      // Average should be reasonable
      expect(avgTime).toBeLessThan(500);
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle concurrent writes from many clients', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 50 clients
      for (let i = 0; i < 50; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // All write simultaneously
      const startTime = Date.now();
      await Promise.all(
        clients.map((client, idx) =>
          client.setField(docId, `concurrent${idx}`, idx)
        )
      );
      const writeTime = Date.now() - startTime;
      
      console.log(`50 concurrent writes completed in ${writeTime}ms`);
      
      // Wait for convergence
      await sleep(3000);
      
      // Verify all writes succeeded
      const state = await clients[0].getDocumentState(docId);
      expect(Object.keys(state).length).toBe(50);
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle clients joining during active session', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Start with 10 clients
      for (let i = 0; i < 10; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Make some changes
      await clients[0].setField(docId, 'initial', 'data');
      await sleep(500);
      
      // Add 40 more clients while session is active
      for (let i = 0; i < 40; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
        
        // Make a change immediately
        await client.setField(docId, `joined${i}`, i);
      }
      
      // Wait for convergence
      await sleep(4000);
      
      // All clients should have all data
      const states = await Promise.all(
        [clients[0], clients[25], clients[49]].map(c => c.getDocumentState(docId))
      );
      
      // Should have 41 fields (1 initial + 40 joined)
      expect(Object.keys(states[0]).length).toBe(41);
      expect(states[0]).toEqual(states[1]);
      expect(states[1]).toEqual(states[2]);
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 20000 });

  it('should handle mass disconnection and reconnection', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 30 clients
      for (let i = 0; i < 30; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Make changes
      await clients[0].setField(docId, 'before', 'disconnect');
      await sleep(500);
      
      // Mass disconnect
      await Promise.all(clients.map(c => c.disconnect()));
      await sleep(500);
      
      // Mass reconnect
      const startReconnect = Date.now();
      await Promise.all(clients.map(c => c.connect()));
      const reconnectTime = Date.now() - startReconnect;
      
      console.log(`30 clients reconnected in ${reconnectTime}ms`);
      
      // Make changes after reconnect
      await clients[0].setField(docId, 'after', 'reconnect');
      await sleep(2000);
      
      // Verify convergence
      const states = await Promise.all(
        [clients[0], clients[15], clients[29]].map(c => c.getDocumentState(docId))
      );
      
      expect(states[0]).toEqual(states[1]);
      expect(states[1]).toEqual(states[2]);
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should maintain performance with many idle clients', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 100 clients (mostly idle)
      for (let i = 0; i < 100; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Only 5 clients are active
      const activeClients = clients.slice(0, 5);
      
      const startTime = Date.now();
      for (let i = 0; i < 10; i++) {
        await activeClients[i % 5].setField(docId, `active${i}`, i);
      }
      const operationTime = Date.now() - startTime;
      
      console.log(`10 operations with 100 idle clients: ${operationTime}ms`);
      
      // Should still be fast
      expect(operationTime).toBeLessThan(3000);
      
      // Wait for convergence
      await sleep(2000);
      
      // Verify idle clients also receive updates
      const state = await clients[99].getDocumentState(docId);
      expect(Object.keys(state).length).toBe(10);
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle gradual client increase', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Gradually add clients
      for (let i = 0; i < 50; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
        
        // Make a change
        await client.setField(docId, `gradual${i}`, i);
        
        // Small delay
        await sleep(50);
      }
      
      // Wait for full convergence
      await sleep(4000);
      
      // All clients should have all data
      const states = await Promise.all(
        [clients[0], clients[24], clients[49]].map(c => c.getDocumentState(docId))
      );
      
      expect(Object.keys(states[0]).length).toBe(50);
      expect(states[0]).toEqual(states[1]);
      expect(states[1]).toEqual(states[2]);
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 20000 });

  it('should handle client churn (connections/disconnections)', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create base clients
      for (let i = 0; i < 20; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Simulate churn: some disconnect, new ones join
      for (let cycle = 0; cycle < 5; cycle++) {
        // Disconnect 5 clients
        const toDisconnect = clients.slice(cycle * 5, cycle * 5 + 5);
        await Promise.all(toDisconnect.map(c => c.disconnect()));
        
        // Add 5 new clients
        for (let i = 0; i < 5; i++) {
          const client = new TestClient({ adapter: new BinaryAdapter() });
          await client.init();
          await client.connect();
          clients.push(client);
        }
        
        // Make a change
        await clients[clients.length - 1].setField(docId, `churn${cycle}`, cycle);
        
        await sleep(300);
      }
      
      // Wait for convergence
      await sleep(3000);
      
      // Connected clients should converge
      const connectedClients = clients.filter(c => c.isConnected);
      const states = await Promise.all(
        connectedClients.slice(0, 5).map(c => c.getDocumentState(docId))
      );
      
      expect(states[0]).toEqual(states[1]);
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 20000 });

  it('should measure latency percentiles with many clients', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    const latencies: number[] = [];
    
    try {
      // Create 50 clients
      for (let i = 0; i < 50; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Measure sync latency
      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();
        await clients[0].setField(docId, `latency${i}`, i);
        await clients[49].waitForField(docId, `latency${i}`, i, 5000);
        const latency = Date.now() - startTime;
        latencies.push(latency);
      }
      
      // Calculate percentiles
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      
      console.log('Latency percentiles (50 clients):');
      console.log(`  p50: ${p50}ms`);
      console.log(`  p95: ${p95}ms`);
      console.log(`  p99: ${p99}ms`);
      
      // Verify targets
      expect(p50).toBeLessThan(200); // Relaxed for load test environment
      expect(p95).toBeLessThan(500);
      expect(p99).toBeLessThan(1000);
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle different document access patterns', async () => {
    const clients: TestClient[] = [];
    
    try {
      // Create 30 clients
      for (let i = 0; i < 30; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Group 1: All access same document
      const group1 = clients.slice(0, 10);
      await Promise.all(
        group1.map((client, idx) =>
          client.setField('shared-doc', `g1_${idx}`, idx)
        )
      );
      
      // Group 2: Each has own document
      const group2 = clients.slice(10, 20);
      await Promise.all(
        group2.map((client, idx) =>
          client.setField(`private-doc-${idx}`, 'data', idx)
        )
      );
      
      // Group 3: Mix of shared and private
      const group3 = clients.slice(20, 30);
      await Promise.all(
        group3.map((client, idx) =>
          Promise.all([
            client.setField('shared-doc', `g3_${idx}`, idx),
            client.setField(`private-doc-${idx + 10}`, 'data', idx),
          ])
        )
      );
      
      // Wait for convergence
      await sleep(3000);
      
      // Verify shared document has all updates
      const sharedState = await clients[0].getDocumentState('shared-doc');
      expect(Object.keys(sharedState).length).toBe(20); // Group 1 + Group 3
      
      console.log('Different access patterns handled successfully');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });
});
