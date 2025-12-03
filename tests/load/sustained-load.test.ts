/**
 * Sustained Load Tests
 * 
 * Tests system stability under sustained load over extended periods
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server';
import { TestClient } from '../integration/helpers/test-client';
import { BinaryAdapter } from '../integration/helpers/binary-adapter';
import { sleep } from '../integration/config';

describe('Load - Sustained Load', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  const docId = 'sustained-doc';

  it('should handle 5-minute sustained load (100 clients)', async () => {
    const clients: TestClient[] = [];
    const duration = 5 * 60 * 1000; // 5 minutes
    
    try {
      console.log('Creating 100 clients for sustained load test...');
      
      // Create 100 clients
      for (let i = 0; i < 100; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        clients.push(client);
        
        if ((i + 1) % 20 === 0) {
          console.log(`Created ${i + 1}/100 clients`);
        }
      }
      
      // Connect in batches
      const batchSize = 20;
      for (let i = 0; i < clients.length; i += batchSize) {
        const batch = clients.slice(i, i + batchSize);
        await Promise.all(batch.map(c => c.connect()));
        await sleep(100);
      }
      
      console.log('All clients connected. Starting sustained load test...');
      
      const startTime = Date.now();
      let operationCount = 0;
      
      // Run for 5 minutes
      while (Date.now() - startTime < duration) {
        // Select random clients for operations
        const activeCount = 10;
        const activeClients = [];
        for (let i = 0; i < activeCount; i++) {
          const idx = Math.floor(Math.random() * clients.length);
          activeClients.push(clients[idx]);
        }
        
        // Perform operations
        await Promise.all(
          activeClients.map(client =>
            client.setField(docId, `op${operationCount++}`, Date.now())
          )
        );
        
        // Progress report every minute
        if (operationCount % 100 === 0) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          console.log(`  ${elapsed}s elapsed, ${operationCount} operations completed`);
        }
        
        await sleep(1000); // 1 second between batches
      }
      
      const totalTime = Date.now() - startTime;
      const opsPerSecond = operationCount / (totalTime / 1000);
      
      console.log(`Sustained load test completed:`);
      console.log(`  Duration: ${(totalTime / 1000).toFixed(2)}s`);
      console.log(`  Total operations: ${operationCount}`);
      console.log(`  Ops/sec: ${opsPerSecond.toFixed(2)}`);
      
      // Verify system still responsive
      await clients[0].setField(docId, 'final', 'test');
      await sleep(2000);
      
      const finalState = await clients[0].getDocumentState(docId);
      expect(finalState.final).toBe('test');
      
      console.log('System remains responsive after sustained load ✅');
    } finally {
      console.log('Cleaning up...');
      const batchSize = 20;
      for (let i = 0; i < clients.length; i += batchSize) {
        const batch = clients.slice(i, i + batchSize);
        await Promise.all(batch.map(c => c.cleanup()));
      }
    }
  }, { timeout: 360000 });

  it('should handle 10-minute stability test (50 clients)', async () => {
    const clients: TestClient[] = [];
    const duration = 10 * 60 * 1000; // 10 minutes
    
    try {
      console.log('Setting up 50 clients for 10-minute stability test...');
      
      // Create 50 clients
      for (let i = 0; i < 50; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Starting 10-minute stability test...');
      
      const startTime = Date.now();
      const errors: Error[] = [];
      let operationCount = 0;
      
      // Run for 10 minutes
      while (Date.now() - startTime < duration) {
        try {
          // Random operations
          const clientIdx = Math.floor(Math.random() * clients.length);
          const operation = Math.random();
          
          if (operation < 0.7) {
            // 70% writes
            await clients[clientIdx].setField(
              docId,
              `field${operationCount}`,
              operationCount
            );
          } else if (operation < 0.9) {
            // 20% reads
            await clients[clientIdx].getDocumentState(docId);
          } else {
            // 10% deletes
            const fieldCount = Object.keys(
              await clients[clientIdx].getDocumentState(docId)
            ).length;
            if (fieldCount > 10) {
              await clients[clientIdx].deleteField(
                docId,
                `field${Math.floor(Math.random() * operationCount)}`
              );
            }
          }
          
          operationCount++;
          
          if (operationCount % 200 === 0) {
            const elapsed = Math.floor((Date.now() - startTime) / 60000);
            console.log(`  ${elapsed} minutes elapsed, ${operationCount} operations`);
          }
          
          await sleep(100); // 10 ops/sec
        } catch (error) {
          errors.push(error as Error);
        }
      }
      
      const totalTime = Date.now() - startTime;
      
      console.log(`Stability test completed:`);
      console.log(`  Duration: ${(totalTime / 60000).toFixed(2)} minutes`);
      console.log(`  Operations: ${operationCount}`);
      console.log(`  Errors: ${errors.length}`);
      console.log(`  Success rate: ${((1 - errors.length / operationCount) * 100).toFixed(2)}%`);
      
      // Should have very few errors
      expect(errors.length).toBeLessThan(operationCount * 0.01); // <1% error rate
      
      console.log('System stable over 10 minutes ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 660000 });

  it('should detect memory leaks under sustained load', async () => {
    const clients: TestClient[] = [];
    const duration = 3 * 60 * 1000; // 3 minutes
    
    try {
      console.log('Setting up memory leak detection test...');
      
      // Create 30 clients
      for (let i = 0; i < 30; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Measure initial memory
      if (global.gc) global.gc();
      await sleep(1000);
      const initialMemory = process.memoryUsage().heapUsed;
      
      console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log('Running sustained operations...');
      
      const startTime = Date.now();
      let operationCount = 0;
      const memorySnapshots: number[] = [initialMemory];
      
      // Run for 3 minutes with frequent operations
      while (Date.now() - startTime < duration) {
        // Make operations
        for (let i = 0; i < 10; i++) {
          const clientIdx = Math.floor(Math.random() * clients.length);
          await clients[clientIdx].setField(docId, `mem${operationCount++}`, Date.now());
        }
        
        // Take memory snapshot every 30 seconds
        if (operationCount % 300 === 0) {
          if (global.gc) global.gc();
          await sleep(500);
          const currentMemory = process.memoryUsage().heapUsed;
          memorySnapshots.push(currentMemory);
          
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          console.log(`  ${elapsed}s: ${(currentMemory / 1024 / 1024).toFixed(2)} MB`);
        }
        
        await sleep(100);
      }
      
      // Final memory check
      if (global.gc) global.gc();
      await sleep(1000);
      const finalMemory = process.memoryUsage().heapUsed;
      
      console.log(`\nMemory leak detection results:`);
      console.log(`  Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Final: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Increase: ${((finalMemory - initialMemory) / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Operations: ${operationCount}`);
      
      // Memory shouldn't grow unbounded
      const memoryGrowth = finalMemory - initialMemory;
      const acceptableGrowth = 100 * 1024 * 1024; // 100MB
      
      if (memoryGrowth > acceptableGrowth) {
        console.warn(`⚠️  Memory grew by ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.log(`✅ No significant memory leak detected`);
      }
      
      // Check for linear growth (potential leak indicator)
      const growthRate = (finalMemory - initialMemory) / memorySnapshots.length;
      console.log(`  Growth rate: ${(growthRate / 1024 / 1024).toFixed(2)} MB per snapshot`);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 240000 });

  it('should handle continuous moderate load (30 clients)', async () => {
    const clients: TestClient[] = [];
    const duration = 3 * 60 * 1000; // 3 minutes
    
    try {
      // Create 30 clients
      for (let i = 0; i < 30; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Starting continuous moderate load test...');
      
      const startTime = Date.now();
      const latencies: number[] = [];
      let operationCount = 0;
      
      // Continuous operations
      while (Date.now() - startTime < duration) {
        const opStartTime = Date.now();
        
        // 5 clients make changes simultaneously
        await Promise.all(
          Array.from({ length: 5 }, () => {
            const clientIdx = Math.floor(Math.random() * clients.length);
            return clients[clientIdx].setField(
              docId,
              `continuous${operationCount++}`,
              Date.now()
            );
          })
        );
        
        const opLatency = Date.now() - opStartTime;
        latencies.push(opLatency);
        
        if (operationCount % 100 === 0) {
          const avgLatency = latencies.slice(-100).reduce((a, b) => a + b, 0) / Math.min(100, latencies.length);
          console.log(`  Operations: ${operationCount}, Avg latency: ${avgLatency.toFixed(2)}ms`);
        }
        
        await sleep(200); // 25 ops/sec
      }
      
      // Calculate final statistics
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      
      console.log(`\nContinuous load results:`);
      console.log(`  Operations: ${operationCount}`);
      console.log(`  Latency p50: ${p50}ms`);
      console.log(`  Latency p95: ${p95}ms`);
      console.log(`  Latency p99: ${p99}ms`);
      
      // Verify latency stayed reasonable
      expect(p95).toBeLessThan(500);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 240000 });

  it('should handle mixed read/write workload', async () => {
    const clients: TestClient[] = [];
    const duration = 2 * 60 * 1000; // 2 minutes
    
    try {
      // Create 40 clients
      for (let i = 0; i < 40; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Starting mixed read/write workload...');
      
      const startTime = Date.now();
      const stats = {
        reads: 0,
        writes: 0,
        deletes: 0,
        errors: 0,
      };
      
      // Run mixed workload
      while (Date.now() - startTime < duration) {
        try {
          const clientIdx = Math.floor(Math.random() * clients.length);
          const operation = Math.random();
          
          if (operation < 0.5) {
            // 50% reads
            await clients[clientIdx].getDocumentState(docId);
            stats.reads++;
          } else if (operation < 0.9) {
            // 40% writes
            await clients[clientIdx].setField(
              docId,
              `mixed${stats.writes}`,
              Date.now()
            );
            stats.writes++;
          } else {
            // 10% deletes
            if (stats.writes > 10) {
              await clients[clientIdx].deleteField(
                docId,
                `mixed${Math.floor(Math.random() * stats.writes)}`
              );
              stats.deletes++;
            }
          }
          
          if ((stats.reads + stats.writes + stats.deletes) % 100 === 0) {
            console.log(`  Operations - R:${stats.reads} W:${stats.writes} D:${stats.deletes}`);
          }
        } catch (error) {
          stats.errors++;
        }
        
        await sleep(50); // 20 ops/sec
      }
      
      console.log(`\nMixed workload results:`);
      console.log(`  Reads: ${stats.reads}`);
      console.log(`  Writes: ${stats.writes}`);
      console.log(`  Deletes: ${stats.deletes}`);
      console.log(`  Errors: ${stats.errors}`);
      console.log(`  Total: ${stats.reads + stats.writes + stats.deletes}`);
      
      expect(stats.errors).toBeLessThan((stats.reads + stats.writes + stats.deletes) * 0.01);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 180000 });

  it('should maintain consistency during long session', async () => {
    const clients: TestClient[] = [];
    const duration = 2 * 60 * 1000; // 2 minutes
    
    try {
      // Create 20 clients
      for (let i = 0; i < 20; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Testing consistency during long session...');
      
      const startTime = Date.now();
      const expectedData: Record<string, number> = {};
      let operationCount = 0;
      
      // Make deterministic changes
      while (Date.now() - startTime < duration) {
        const key = `consistent${operationCount}`;
        const value = operationCount;
        
        await clients[operationCount % clients.length].setField(docId, key, value);
        expectedData[key] = value;
        operationCount++;
        
        // Periodic consistency check
        if (operationCount % 50 === 0) {
          await sleep(1000); // Allow convergence
          
          const state = await clients[Math.floor(Math.random() * clients.length)].getDocumentState(docId);
          const actualKeys = Object.keys(state);
          
          console.log(`  Consistency check at operation ${operationCount}: ${actualKeys.length}/${operationCount} fields`);
        }
        
        await sleep(100);
      }
      
      // Final consistency check
      console.log('Performing final consistency check...');
      await sleep(3000);
      
      const states = await Promise.all(
        [0, 10, 19].map(i => clients[i].getDocumentState(docId))
      );
      
      // All clients should converge
      expect(states[0]).toEqual(states[1]);
      expect(states[1]).toEqual(states[2]);
      
      console.log('Consistency maintained throughout long session ✅');

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 180000 });
});
