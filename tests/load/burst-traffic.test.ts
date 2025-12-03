/**
 * Burst Traffic Tests
 * 
 * Tests system behavior under sudden traffic spikes and bursts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server';
import { TestClient } from '../integration/helpers/test-client';
import { BinaryAdapter } from '../integration/helpers/binary-adapter';
import { sleep } from '../integration/config';

describe('Load - Burst Traffic', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  // Helper to generate unique document ID per test
  const uniqueDocId = () => `burst-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it('should handle sudden spike to 100 clients', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      console.log('Starting with 10 baseline clients...');
      
      // Start with 10 clients
      for (let i = 0; i < 10; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Make baseline changes
      await clients[0].setField(docId, 'baseline', 'data');
      await sleep(500);
      
      console.log('Spiking to 100 clients...');
      const spikeStart = Date.now();
      
      // Sudden spike: add 90 clients
      const newClients = await Promise.all(
        Array.from({ length: 90 }, async () => {
          const client = new TestClient({ adapter: new BinaryAdapter() });
          await client.init();
          return client;
        })
      );
      
      // All connect simultaneously
      await Promise.all(newClients.map(c => c.connect()));
      clients.push(...newClients);
      
      const spikeTime = Date.now() - spikeStart;
      console.log(`Spike completed in ${spikeTime}ms`);
      
      // System should handle spike
      expect(spikeTime).toBeLessThan(10000);
      
      // Make post-spike changes
      await clients[50].setField(docId, 'afterSpike', 'data');
      await sleep(2000);
      
      // Verify system still responsive
      const state = await clients[99].getDocumentState(docId);
      expect(state.afterSpike).toBe('data');
      
      console.log('System handled traffic spike successfully ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle burst of operations', async () => {
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
      
      console.log('Sending burst of 200 operations...');
      const burstStart = Date.now();
      
      // Burst: 200 operations as fast as possible
      const operations = [];
      for (let i = 0; i < 200; i++) {
        const clientIdx = i % clients.length;
        operations.push(
          clients[clientIdx].setField(docId, `burst${i}`, i)
        );
      }
      
      await Promise.all(operations);
      const burstTime = Date.now() - burstStart;
      
      console.log(`Burst completed in ${burstTime}ms (${(200000/burstTime).toFixed(0)} ops/sec)`);
      
      // Wait for convergence
      await sleep(4000);
      
      // Verify all operations succeeded
      const state = await clients[0].getDocumentState(docId);
      expect(Object.keys(state).length).toBe(200);
      
      console.log('Burst operations handled successfully ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 15000 });

  it('should handle multiple burst cycles', async () => {
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
      
      console.log('Testing multiple burst cycles...');
      
      // Multiple burst cycles
      for (let cycle = 0; cycle < 5; cycle++) {
        console.log(`  Burst cycle ${cycle + 1}/5`);
        
        // Burst: 50 simultaneous operations
        await Promise.all(
          clients.map((client, idx) =>
            client.setField(docId, `cycle${cycle}_${idx}`, cycle)
          )
        );
        
        // Quiet period
        await sleep(1000);
      }
      
      // Verify all data present
      await sleep(2000);
      const state = await clients[0].getDocumentState(docId);
      expect(Object.keys(state).length).toBe(250); // 5 cycles * 50 clients
      
      console.log('Multiple burst cycles handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 25000 }); // Increased timeout for binary protocol overhead with 50 clients

  it('should handle spike then drop pattern', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      console.log('Creating 100 clients for spike...');
      
      // Create 100 clients
      for (let i = 0; i < 100; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Spike: all make changes
      console.log('Spike: 100 clients active...');
      await Promise.all(
        clients.map((client, idx) =>
          client.setField(docId, `spike${idx}`, idx)
        )
      );
      
      await sleep(2000);
      
      // Drop: disconnect 80 clients
      console.log('Drop: disconnecting 80 clients...');
      const toDrop = clients.slice(20);
      await Promise.all(toDrop.map(c => c.disconnect()));
      
      // Remaining clients continue
      const remaining = clients.slice(0, 20);
      await remaining[0].setField(docId, 'afterDrop', 'data');
      
      await sleep(1000);
      
      // Verify remaining clients work
      const state = await remaining[10].getDocumentState(docId);
      expect(state.afterDrop).toBe('data');
      
      console.log('Spike-then-drop pattern handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 20000 }); // Increased timeout for binary protocol with 100 clients

  it('should handle burst of connections', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      console.log('Creating 200 clients...');
      
      // Create 200 clients
      for (let i = 0; i < 200; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        clients.push(client);
      }
      
      console.log('Burst connect: 200 clients simultaneously...');
      const connectStart = Date.now();
      
      // All connect at once
      await Promise.all(clients.map(c => c.connect()));
      
      const connectTime = Date.now() - connectStart;
      console.log(`200 clients connected in ${connectTime}ms`);
      
      expect(connectTime).toBeLessThan(15000); // Should handle within 15s
      
      // Verify system responsive
      await clients[0].setField(docId, 'test', 'data');
      await sleep(1000);
      
      const state = await clients[199].getDocumentState(docId);
      expect(state.test).toBe('data');
      
      console.log('Burst connections handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle burst writes to same field', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 40 clients
      for (let i = 0; i < 40; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Burst: 40 clients writing to same field...');
      
      // All write to same field simultaneously
      await Promise.all(
        clients.map((client, idx) =>
          client.setField(docId, 'conflictField', `value${idx}`)
        )
      );
      
      // Wait for resolution
      await sleep(2000);
      
      // Should resolve via LWW to single value
      const states = await Promise.all(
        [clients[0], clients[20], clients[39]].map(c => c.getDocumentState(docId))
      );
      
      // All should converge
      expect(states[0]).toEqual(states[1]);
      expect(states[1]).toEqual(states[2]);
      
      // Should have single winner
      expect(states[0].conflictField).toBeDefined();
      
      console.log('Burst conflict resolved via LWW ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle alternating burst and quiet periods', async () => {
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
      
      console.log('Testing alternating burst/quiet pattern...');
      
      let totalOps = 0;
      
      for (let cycle = 0; cycle < 4; cycle++) {
        // Burst phase
        console.log(`  Burst phase ${cycle + 1}`);
        await Promise.all(
          Array.from({ length: 30 }, (_, i) => {
            const clientIdx = i % clients.length;
            return clients[clientIdx].setField(
              docId,
              `alt${totalOps++}`,
              cycle
            );
          })
        );
        
        // Quiet phase
        await sleep(2000);
        console.log(`  Quiet phase ${cycle + 1}`);
      }
      
      // Verify convergence
      await sleep(2000);
      const state = await clients[0].getDocumentState(docId);
      expect(Object.keys(state).length).toBe(totalOps);
      
      console.log('Alternating pattern handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 20000 });

  it('should handle burst with mixed operations', async () => {
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
      
      // Create initial data
      for (let i = 0; i < 50; i++) {
        await clients[0].setField(docId, `initial${i}`, i);
      }
      await sleep(1000);
      
      console.log('Burst: mixed operations...');
      
      // Burst of mixed operations
      const operations = [];
      for (let i = 0; i < 100; i++) {
        const clientIdx = i % clients.length;
        const opType = Math.random();
        
        if (opType < 0.6) {
          // 60% writes
          operations.push(
            clients[clientIdx].setField(docId, `burst${i}`, i)
          );
        } else if (opType < 0.8) {
          // 20% reads
          operations.push(
            clients[clientIdx].getDocumentState(docId)
          );
        } else {
          // 20% deletes
          operations.push(
            clients[clientIdx].deleteField(docId, `initial${i % 50}`)
          );
        }
      }
      
      await Promise.all(operations);
      
      await sleep(2000);
      
      // System should remain consistent
      const states = await Promise.all(
        [clients[0], clients[15], clients[29]].map(c => c.getDocumentState(docId))
      );
      
      expect(states[0]).toEqual(states[1]);
      expect(states[1]).toEqual(states[2]);
      
      console.log('Mixed burst operations handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 15000 });

  it('should measure latency during burst', async () => {
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
      
      console.log('Measuring latency during burst...');
      
      const latencies: number[] = [];
      
      // Send burst and measure latency
      for (let i = 0; i < 50; i++) {
        const startTime = Date.now();
        await clients[0].setField(docId, `latency${i}`, i);
        await clients[49].waitForField(docId, `latency${i}`, i, 5000);
        const latency = Date.now() - startTime;
        latencies.push(latency);
      }
      
      // Calculate stats
      latencies.sort((a, b) => a - b);
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      
      console.log('Latency during burst:');
      console.log(`  Average: ${avg.toFixed(2)}ms`);
      console.log(`  p50: ${p50}ms`);
      console.log(`  p95: ${p95}ms`);
      console.log(`  p99: ${p99}ms`);
      
      // Should maintain reasonable latency even during burst
      expect(p95).toBeLessThan(1000);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should recover quickly after burst', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 60 clients
      for (let i = 0; i < 60; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Send massive burst
      console.log('Sending massive burst...');
      await Promise.all(
        Array.from({ length: 300 }, (_, i) => {
          const clientIdx = i % clients.length;
          return clients[clientIdx].setField(docId, `massive${i}`, i);
        })
      );
      
      console.log('Burst complete, measuring recovery...');
      
      // Measure recovery time
      const recoveryStart = Date.now();
      
      // Should be able to perform operation quickly
      await clients[0].setField(docId, 'recovery', 'test');
      await clients[59].waitForField(docId, 'recovery', 'test', 10000);
      
      const recoveryTime = Date.now() - recoveryStart;
      console.log(`Recovery time: ${recoveryTime}ms`);

      // Should recover within reasonable time
      expect(recoveryTime).toBeLessThan(60000);

      console.log('System recovered quickly after burst ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 120000 });

  it('should handle flash crowd scenario', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      console.log('Simulating flash crowd...');
      
      // Wave 1: 50 clients
      console.log('  Wave 1: 50 clients');
      for (let i = 0; i < 50; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      await sleep(500);
      
      // Wave 2: Another 50 clients
      console.log('  Wave 2: +50 clients (100 total)');
      for (let i = 0; i < 50; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      await sleep(500);
      
      // Wave 3: Final 50 clients
      console.log('  Wave 3: +50 clients (150 total)');
      for (let i = 0; i < 50; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Flash crowd assembled: 150 clients');
      
      // All make changes
      await Promise.all(
        clients.map((client, idx) =>
          client.setField(docId, `crowd${idx}`, idx)
        )
      );
      
      // Wait for convergence
      await sleep(6000);
      
      // Verify system handled crowd
      const state = await clients[75].getDocumentState(docId);
      expect(Object.keys(state).length).toBe(150);
      
      console.log('Flash crowd handled successfully ✅');
    } finally {
      // Cleanup in waves
      for (let i = 0; i < clients.length; i += 50) {
        const batch = clients.slice(i, i + 50);
        await Promise.all(batch.map(c => c.cleanup()));
        await sleep(100);
      }
    }
  }, { timeout: 30000 });

  it('should handle burst with document churn', async () => {
    const clients: TestClient[] = [];
    
    try {
      // Create 40 clients
      for (let i = 0; i < 40; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Burst with document churn...');
      
      // Burst: multiple documents being created/updated
      const operations = [];
      for (let i = 0; i < 100; i++) {
        const clientIdx = i % clients.length;
        const docNum = i % 10; // 10 different documents
        operations.push(
          clients[clientIdx].setField(`doc${docNum}`, `field${i}`, i)
        );
      }
      
      await Promise.all(operations);
      
      await sleep(3000);
      
      // Verify different documents synced
      const doc0 = await clients[0].getDocumentState('doc0');
      const doc5 = await clients[0].getDocumentState('doc5');
      const doc9 = await clients[0].getDocumentState('doc9');
      
      expect(Object.keys(doc0).length).toBeGreaterThan(0);
      expect(Object.keys(doc5).length).toBeGreaterThan(0);
      expect(Object.keys(doc9).length).toBeGreaterThan(0);
      
      console.log('Document churn handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 15000 });
});
