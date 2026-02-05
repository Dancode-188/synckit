/**
 * High-Frequency Updates Tests
 * 
 * Tests system behavior with high-frequency operations (100+ ops/sec)
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server';
import { TestClient } from '../integration/helpers/test-client';
import { BinaryAdapter } from '../integration/helpers/binary-adapter';
import { sleep } from '../integration/config';

describe('Load - High-Frequency Updates', () => {
  beforeAll(async () => {
    await setupTestServer();
  }, { timeout: 30000 });

  afterAll(async () => {
    await teardownTestServer();
  }, { timeout: 30000 });

  // Helper to generate unique document ID per test
  const uniqueDocId = () => `highfreq-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it('should handle 100 ops/sec from single client', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Sending 100 ops/sec for 10 seconds...');
      
      const duration = 10 * 1000; // 10 seconds
      const targetOpsPerSec = 100;
      const delayBetweenOps = 1000 / targetOpsPerSec; // 10ms
      
      const startTime = Date.now();
      let operationCount = 0;
      
      // Run for 10 seconds
      while (Date.now() - startTime < duration) {
        await clients[0].setField(docId, `highfreq${operationCount}`, operationCount);
        operationCount++;
        await sleep(delayBetweenOps);
      }
      
      const totalTime = (Date.now() - startTime) / 1000;
      const actualRate = operationCount / totalTime;
      
      console.log(`Completed ${operationCount} operations in ${totalTime.toFixed(2)}s`);
      console.log(`Actual rate: ${actualRate.toFixed(2)} ops/sec`);
      
      // Wait for sync
      await sleep(5000);
      
      // Verify sync
      const state = await clients[1].getDocumentState(docId);
      const syncedCount = Object.keys(state).length;
      
      console.log(`Synced ${syncedCount}/${operationCount} fields`);
      expect(syncedCount).toBeGreaterThan(operationCount * 0.8); // 80% threshold

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should handle rapid updates to same field', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Rapidly updating same field (200 times)...');
      
      // Rapidly update same field
      for (let i = 0; i < 200; i++) {
        await clients[0].setField(docId, 'rapidField', i);
        await sleep(5); // 200 ops/sec
      }
      
      console.log('Waiting for final value to sync...');
      await sleep(3000);
      
      // Final value should sync
      const value = await clients[1].getField(docId, 'rapidField');
      expect(value).toBe(199); // Last value
      
      console.log('Rapid updates to same field handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 15000 });

  it('should handle high-frequency concurrent writes', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 5 clients
      for (let i = 0; i < 5; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('5 clients sending high-frequency updates...');
      
      // All clients send rapid updates
      await Promise.all(
        clients.map((client, clientIdx) =>
          (async () => {
            for (let i = 0; i < 100; i++) {
              await client.setField(docId, `client${clientIdx}_${i}`, i);
              await sleep(10); // 100 ops/sec per client
            }
          })()
        )
      );
      
      console.log('500 total operations completed');
      
      // Wait for convergence
      await sleep(6000);
      
      // Verify convergence
      const states = await Promise.all(
        clients.map(c => c.getDocumentState(docId))
      );
      
      // All should converge
      expect(states[0]).toEqual(states[1]);
      
      const fieldCount = Object.keys(states[0]).length;
      console.log(`Converged to ${fieldCount}/500 fields`);
      expect(fieldCount).toBeGreaterThan(400);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should handle burst of 500 ops in 1 second', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Sending 500 ops in 1 second...');
      
      const startTime = Date.now();
      
      // Send 500 operations as fast as possible
      const operations = [];
      for (let i = 0; i < 500; i++) {
        operations.push(
          clients[0].setField(docId, `burst${i}`, i)
        );
      }
      await Promise.all(operations);
      
      const burstTime = Date.now() - startTime;
      const rate = (500 / burstTime) * 1000;
      
      console.log(`Sent 500 ops in ${burstTime}ms (${rate.toFixed(0)} ops/sec)`);
      
      // Wait for sync
      await sleep(5000);
      
      // Verify sync
      const state = await clients[1].getDocumentState(docId);
      const syncedCount = Object.keys(state).length;
      
      console.log(`Synced ${syncedCount}/500 fields`);
      expect(syncedCount).toBeGreaterThan(400);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 20000 });

  it('should handle sustained 50 ops/sec for 30 seconds', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Sustained 50 ops/sec for 30 seconds...');
      
      const duration = 30 * 1000; // 30 seconds
      const opsPerSec = 50;
      const delayBetweenOps = 1000 / opsPerSec; // 20ms
      
      const startTime = Date.now();
      let operationCount = 0;
      
      while (Date.now() - startTime < duration) {
        await clients[0].setField(docId, `sustained${operationCount}`, operationCount);
        operationCount++;
        await sleep(delayBetweenOps);
        
        if (operationCount % 250 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`  ${elapsed.toFixed(1)}s: ${operationCount} ops`);
        }
      }
      
      const totalTime = (Date.now() - startTime) / 1000;
      const actualRate = operationCount / totalTime;
      
      console.log(`Completed ${operationCount} ops in ${totalTime.toFixed(2)}s (${actualRate.toFixed(2)} ops/sec)`);
      
      // Wait for sync
      await sleep(8000);
      
      // Verify sync
      const state = await clients[1].getDocumentState(docId);
      const syncedCount = Object.keys(state).length;
      
      console.log(`Synced ${syncedCount}/${operationCount} fields`);
      expect(syncedCount).toBeGreaterThan(operationCount * 0.85);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 60000 });

  it('should handle alternating rapid read/write', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Alternating rapid read/write operations...');
      
      const operations = 300;
      let reads = 0;
      let writes = 0;
      
      for (let i = 0; i < operations; i++) {
        if (i % 2 === 0) {
          // Write
          await clients[0].setField(docId, `rw${writes}`, writes);
          writes++;
        } else {
          // Read
          await clients[0].getDocumentState(docId);
          reads++;
        }
        await sleep(10); // 100 ops/sec
      }
      
      console.log(`Completed ${reads} reads and ${writes} writes`);
      
      await sleep(3000);
      
      const state = await clients[1].getDocumentState(docId);
      expect(Object.keys(state).length).toBeGreaterThan(writes * 0.8);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 20000 });

  it('should handle high-frequency deletes', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Creating 500 fields...');
      
      // Create 500 fields
      for (let i = 0; i < 500; i++) {
        await clients[0].setField(docId, `toDelete${i}`, i);
      }
      
      await sleep(5000);
      
      console.log('Rapidly deleting 250 fields...');
      
      // Rapidly delete half
      for (let i = 0; i < 250; i++) {
        await clients[0].deleteField(docId, `toDelete${i}`);
        await sleep(5); // 200 ops/sec
      }
      
      await sleep(3000);
      
      // Verify deletes synced
      const state = await clients[1].getDocumentState(docId);
      const remaining = Object.keys(state).length;
      
      console.log(`Remaining fields: ${remaining} (expected ~250)`);
      expect(remaining).toBeLessThan(300);
      expect(remaining).toBeGreaterThan(200);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 40000 });

  it('should measure latency at high frequency', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Measuring latency at 50 ops/sec...');
      
      const latencies: number[] = [];
      
      for (let i = 0; i < 50; i++) {
        const startTime = Date.now();
        await clients[0].setField(docId, `latency${i}`, i);
        await clients[1].waitForField(docId, `latency${i}`, i, 5000);
        const latency = Date.now() - startTime;
        latencies.push(latency);
        
        await sleep(20); // 50 ops/sec
      }
      
      // Calculate stats
      latencies.sort((a, b) => a - b);
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      
      console.log('Latency at high frequency:');
      console.log(`  Average: ${avg.toFixed(2)}ms`);
      console.log(`  p50: ${p50}ms`);
      console.log(`  p95: ${p95}ms`);
      console.log(`  p99: ${p99}ms`);
      
      // Verify reasonable latency
      expect(p95).toBeLessThan(1000);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should handle high-frequency updates to multiple documents', async () => {
    const clients: TestClient[] = [];
    
    try {
      // Create 3 clients
      for (let i = 0; i < 3; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('High-frequency updates to 5 documents...');
      
      // Update 5 documents rapidly
      for (let i = 0; i < 250; i++) {
        const docNum = i % 5;
        const docId = `multi-doc-${docNum}`;
        await clients[i % 3].setField(docId, `field${i}`, i);
        await sleep(8); // ~125 ops/sec
      }
      
      console.log('Waiting for sync...');
      await sleep(5000);
      
      // Verify all documents synced
      for (let doc = 0; doc < 5; doc++) {
        const docId = `multi-doc-${doc}`;
        const state = await clients[2].getDocumentState(docId);
        const fieldCount = Object.keys(state).length;
        console.log(`  Doc ${doc}: ${fieldCount} fields`);
        expect(fieldCount).toBeGreaterThan(40);
      }

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should handle high-frequency with conflicts', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 3 clients
      for (let i = 0; i < 3; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('High-frequency conflicting updates...');
      
      // All clients rapidly update same fields
      await Promise.all(
        clients.map((client, clientIdx) =>
          (async () => {
            for (let i = 0; i < 100; i++) {
              const fieldName = `conflict${i % 20}`; // 20 conflict points
              await client.setField(docId, fieldName, `${clientIdx}-${i}`);
              await sleep(10); // 100 ops/sec
            }
          })()
        )
      );
      
      console.log('Waiting for conflict resolution...');
      await sleep(5000);
      
      // All should converge via LWW
      const states = await Promise.all(
        clients.map(c => c.getDocumentState(docId))
      );
      
      expect(states[0]).toEqual(states[1]);
      expect(states[1]).toEqual(states[2]);

      console.log('High-frequency conflicts resolved ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should handle rate spike pattern', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Testing rate spike pattern...');
      
      let operationCount = 0;
      
      // Phase 1: Normal rate (10 ops/sec)
      console.log('  Normal rate: 10 ops/sec');
      for (let i = 0; i < 50; i++) {
        await clients[0].setField(docId, `normal${operationCount++}`, i);
        await sleep(100);
      }
      
      // Phase 2: Spike (100 ops/sec)
      console.log('  Spike: 100 ops/sec');
      for (let i = 0; i < 100; i++) {
        await clients[0].setField(docId, `spike${operationCount++}`, i);
        await sleep(10);
      }
      
      // Phase 3: Back to normal
      console.log('  Back to normal: 10 ops/sec');
      for (let i = 0; i < 50; i++) {
        await clients[0].setField(docId, `normal2${operationCount++}`, i);
        await sleep(100);
      }
      
      console.log('Waiting for sync...');
      await sleep(5000);
      
      // Verify sync
      const state = await clients[1].getDocumentState(docId);
      const syncedCount = Object.keys(state).length;
      
      console.log(`Synced ${syncedCount}/${operationCount} fields`);
      expect(syncedCount).toBeGreaterThan(operationCount * 0.8);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 40000 });

  it('should track operation success rate at high frequency', async () => {
    const docId = uniqueDocId();
    const clients: TestClient[] = [];
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Tracking success rate at 75 ops/sec...');
      
      const stats = {
        attempts: 0,
        successes: 0,
        failures: 0,
      };
      
      // Send 300 operations
      for (let i = 0; i < 300; i++) {
        stats.attempts++;
        try {
          await clients[0].setField(docId, `tracked${i}`, i);
          stats.successes++;
        } catch (error) {
          stats.failures++;
        }
        await sleep(13); // ~75 ops/sec
      }
      
      const successRate = (stats.successes / stats.attempts) * 100;
      
      console.log('High-frequency operation stats:');
      console.log(`  Attempts: ${stats.attempts}`);
      console.log(`  Successes: ${stats.successes}`);
      console.log(`  Failures: ${stats.failures}`);
      console.log(`  Success rate: ${successRate.toFixed(2)}%`);
      
      // Should have high success rate
      expect(successRate).toBeGreaterThan(95);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 20000 });
});
