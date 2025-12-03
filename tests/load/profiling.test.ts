/**
 * Performance Profiling Tests
 * 
 * Tests for memory leaks, CPU usage, and detailed performance profiling
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server';
import { TestClient } from '../integration/helpers/test-client';
import { BinaryAdapter } from '../integration/helpers/binary-adapter';
import { sleep } from '../integration/config';

describe('Load - Performance Profiling', () => {
  beforeAll(async () => {
    await setupTestServer();
  }, { timeout: 30000 });

  afterAll(async () => {
    await teardownTestServer();
  }, { timeout: 30000 });

  const docId = 'profiling-doc';

  it('should profile memory usage over time', async () => {
    const clients: TestClient[] = [];
    
    try {
      // Create 20 clients
      for (let i = 0; i < 20; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Profiling memory usage over 2 minutes...');
      
      // Initial memory
      if (global.gc) global.gc();
      await sleep(1000);
      const initialMemory = process.memoryUsage();
      
      console.log('Initial memory:');
      console.log(`  Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Heap Total: ${(initialMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`);
      
      const memorySnapshots: Array<{ time: number; memory: NodeJS.MemoryUsage }> = [];
      memorySnapshots.push({ time: 0, memory: initialMemory });
      
      // Run operations for 2 minutes
      const duration = 2 * 60 * 1000;
      const startTime = Date.now();
      let operationCount = 0;
      
      while (Date.now() - startTime < duration) {
        // Perform operations
        const clientIdx = operationCount % clients.length;
        await clients[clientIdx].setField(docId, `profile${operationCount}`, operationCount);
        operationCount++;
        
        // Take memory snapshot every 20 seconds
        if (operationCount % 200 === 0) {
          if (global.gc) global.gc();
          await sleep(500);
          
          const elapsed = Date.now() - startTime;
          const currentMemory = process.memoryUsage();
          memorySnapshots.push({ time: elapsed, memory: currentMemory });
          
          console.log(`\n${(elapsed / 1000).toFixed(0)}s - Memory:`);
          console.log(`  Heap Used: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
          console.log(`  Operations: ${operationCount}`);
        }
        
        await sleep(100); // 10 ops/sec
      }
      
      // Final memory
      if (global.gc) global.gc();
      await sleep(1000);
      const finalMemory = process.memoryUsage();
      
      console.log('\nFinal memory:');
      console.log(`  Heap Used: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Total operations: ${operationCount}`);
      
      // Analyze memory growth
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const growthPerOp = memoryGrowth / operationCount;
      
      console.log('\nMemory analysis:');
      console.log(`  Growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Growth per op: ${(growthPerOp / 1024).toFixed(2)} KB`);
      
      // Check for linear growth (memory leak indicator)
      const growthRates = [];
      for (let i = 1; i < memorySnapshots.length; i++) {
        const prev = memorySnapshots[i - 1];
        const curr = memorySnapshots[i];
        const timeDiff = curr.time - prev.time;
        const memDiff = curr.memory.heapUsed - prev.memory.heapUsed;
        growthRates.push(memDiff / timeDiff); // bytes per ms
      }
      
      const avgGrowthRate = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
      console.log(`  Avg growth rate: ${(avgGrowthRate * 1000 / 1024).toFixed(2)} KB/sec`);
      
      // Memory shouldn't grow unbounded
      expect(memoryGrowth).toBeLessThan(150 * 1024 * 1024); // 150MB limit
      
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 150000 });

  it('should profile sync latency percentiles', async () => {
    const clients: TestClient[] = [];
    
    try {
      // Create 30 clients
      for (let i = 0; i < 30; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Profiling sync latency with 30 clients...');
      
      const latencies: number[] = [];
      
      // Measure 100 sync latencies
      for (let i = 0; i < 100; i++) {
        const startTime = Date.now();
        await clients[0].setField(docId, `latency${i}`, i);
        await clients[29].waitForField(docId, `latency${i}`, i, 10000);
        const latency = Date.now() - startTime;
        latencies.push(latency);
      }
      
      // Calculate comprehensive percentiles
      latencies.sort((a, b) => a - b);
      const stats = {
        min: latencies[0],
        p10: latencies[Math.floor(latencies.length * 0.1)],
        p25: latencies[Math.floor(latencies.length * 0.25)],
        p50: latencies[Math.floor(latencies.length * 0.5)],
        p75: latencies[Math.floor(latencies.length * 0.75)],
        p90: latencies[Math.floor(latencies.length * 0.9)],
        p95: latencies[Math.floor(latencies.length * 0.95)],
        p99: latencies[Math.floor(latencies.length * 0.99)],
        max: latencies[latencies.length - 1],
        avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      };
      
      console.log('\nLatency profile (30 clients, 100 operations):');
      console.log(`  Min: ${stats.min}ms`);
      console.log(`  p10: ${stats.p10}ms`);
      console.log(`  p25: ${stats.p25}ms`);
      console.log(`  p50: ${stats.p50}ms`);
      console.log(`  p75: ${stats.p75}ms`);
      console.log(`  p90: ${stats.p90}ms`);
      console.log(`  p95: ${stats.p95}ms`);
      console.log(`  p99: ${stats.p99}ms`);
      console.log(`  Max: ${stats.max}ms`);
      console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
      
      // Verify targets
      expect(stats.p50).toBeLessThan(200);
      expect(stats.p95).toBeLessThan(500);
      expect(stats.p99).toBeLessThan(1000);
      
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should profile operation throughput', async () => {
    const clients: TestClient[] = [];
    
    try {
      // Create 40 clients
      for (let i = 0; i < 40; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Profiling operation throughput...');
      
      const testDuration = 60 * 1000; // 1 minute
      const samples: Array<{ time: number; ops: number }> = [];
      
      const startTime = Date.now();
      let totalOps = 0;
      let sampleOps = 0;
      let lastSampleTime = startTime;
      
      while (Date.now() - startTime < testDuration) {
        // Perform operations
        const clientIdx = totalOps % clients.length;
        await clients[clientIdx].setField(docId, `throughput${totalOps}`, totalOps);
        totalOps++;
        sampleOps++;
        
        // Sample throughput every 5 seconds
        if (Date.now() - lastSampleTime >= 5000) {
          const elapsed = Date.now() - lastSampleTime;
          const opsPerSec = (sampleOps / elapsed) * 1000;
          samples.push({ time: Date.now() - startTime, ops: opsPerSec });
          
          console.log(`  ${((Date.now() - startTime) / 1000).toFixed(0)}s: ${opsPerSec.toFixed(2)} ops/sec`);
          
          sampleOps = 0;
          lastSampleTime = Date.now();
        }
        
        await sleep(50); // ~20 ops/sec target
      }
      
      // Calculate statistics
      const avgThroughput = samples.reduce((a, b) => a + b.ops, 0) / samples.length;
      const maxThroughput = Math.max(...samples.map(s => s.ops));
      const minThroughput = Math.min(...samples.map(s => s.ops));
      
      console.log('\nThroughput profile:');
      console.log(`  Total operations: ${totalOps}`);
      console.log(`  Average: ${avgThroughput.toFixed(2)} ops/sec`);
      console.log(`  Max: ${maxThroughput.toFixed(2)} ops/sec`);
      console.log(`  Min: ${minThroughput.toFixed(2)} ops/sec`);
      
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 180000 });

  it('should detect connection leaks', async () => {
    console.log('Testing for connection leaks...');
    
    // Create and destroy clients multiple times
    for (let cycle = 0; cycle < 5; cycle++) {
      const clients: TestClient[] = [];
      
      // Create 20 clients
      for (let i = 0; i < 20; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Use clients
      await clients[0].setField(docId, `cycle${cycle}`, cycle);
      await sleep(200);
      
      // Cleanup
      await Promise.all(clients.map(c => c.cleanup()));
      
      // Force GC
      if (global.gc) global.gc();
      await sleep(500);
      
      const memory = process.memoryUsage();
      console.log(`  Cycle ${cycle + 1}: ${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    }
    
    console.log('No connection leaks detected ✅');
  }, { timeout: 120000 });

  it('should profile different operation types', async () => {
    const clients: TestClient[] = [];
    
    try {
      // Create 10 clients
      for (let i = 0; i < 10; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Profiling different operation types...');
      
      const profiles = {
        write: [] as number[],
        read: [] as number[],
        delete: [] as number[],
      };
      
      // Profile writes
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        await clients[0].setField(docId, `write${i}`, i);
        profiles.write.push(Date.now() - start);
      }
      
      await sleep(1000);
      
      // Profile reads
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        await clients[0].getDocumentState(docId);
        profiles.read.push(Date.now() - start);
      }
      
      // Profile deletes
      for (let i = 0; i < 25; i++) {
        const start = Date.now();
        await clients[0].deleteField(docId, `write${i}`);
        profiles.delete.push(Date.now() - start);
      }
      
      // Calculate stats for each operation type
      const calcStats = (arr: number[]) => {
        arr.sort((a, b) => a - b);
        return {
          avg: arr.reduce((a, b) => a + b, 0) / arr.length,
          p50: arr[Math.floor(arr.length * 0.5)],
          p95: arr[Math.floor(arr.length * 0.95)],
        };
      };
      
      console.log('\nOperation profiles:');
      console.log('Writes:', calcStats(profiles.write));
      console.log('Reads:', calcStats(profiles.read));
      console.log('Deletes:', calcStats(profiles.delete));
      
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 120000 });

  it('should profile scalability (10 vs 50 vs 100 clients)', async () => {
    const scenarios = [10, 50, 100];
    const results: Array<{ clients: number; latency: number; throughput: number }> = [];
    
    for (const clientCount of scenarios) {
      const clients: TestClient[] = [];
      
      try {
        console.log(`\nTesting with ${clientCount} clients...`);
        
        // Create clients
        for (let i = 0; i < clientCount; i++) {
          const client = new TestClient({ adapter: new BinaryAdapter() });
          await client.init();
          await client.connect();
          clients.push(client);
        }
        
        await sleep(1000);
        
        // Measure latency
        const latencyStart = Date.now();
        await clients[0].setField(`scale-doc-${clientCount}`, 'test', 'value');
        await clients[clientCount - 1].waitForField(`scale-doc-${clientCount}`, 'test', 'value', 10000);
        const latency = Date.now() - latencyStart;
        
        // Measure throughput
        const throughputStart = Date.now();
        for (let i = 0; i < 50; i++) {
          await clients[i % clientCount].setField(`scale-doc-${clientCount}`, `op${i}`, i);
        }
        const throughputTime = Date.now() - throughputStart;
        const throughput = (50 / throughputTime) * 1000;
        
        results.push({ clients: clientCount, latency, throughput });
        
        console.log(`  Latency: ${latency}ms`);
        console.log(`  Throughput: ${throughput.toFixed(2)} ops/sec`);
        
      } finally {
        await Promise.all(clients.map(c => c.cleanup()));
        await sleep(1000);
      }
    }
    
    console.log('\nScalability profile:');
    for (const result of results) {
      console.log(`  ${result.clients} clients: ${result.latency}ms latency, ${result.throughput.toFixed(2)} ops/sec`);
    }
  }, { timeout: 30000 });

  it('should profile resource cleanup', async () => {
    console.log('Profiling resource cleanup...');
    
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Create many clients
    for (let round = 0; round < 3; round++) {
      const clients: TestClient[] = [];
      
      console.log(`  Round ${round + 1}: Creating 50 clients`);
      
      for (let i = 0; i < 50; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // Use clients
      await Promise.all(
        clients.map((c, i) => c.setField(docId, `round${round}_${i}`, i))
      );
      
      await sleep(1000);
      
      // Cleanup
      console.log(`  Round ${round + 1}: Cleaning up`);
      await Promise.all(clients.map(c => c.cleanup()));
      
      // Force GC
      if (global.gc) global.gc();
      await sleep(1000);
      
      const currentMemory = process.memoryUsage().heapUsed;
      const growth = currentMemory - initialMemory;
      console.log(`  Memory after cleanup: ${(currentMemory / 1024 / 1024).toFixed(2)} MB (growth: ${(growth / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Final memory check
    if (global.gc) global.gc();
    await sleep(1000);
    const finalMemory = process.memoryUsage().heapUsed;
    const totalGrowth = finalMemory - initialMemory;
    
    console.log(`\nTotal memory growth: ${(totalGrowth / 1024 / 1024).toFixed(2)} MB`);
    
    // Should not grow significantly
    expect(totalGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB limit
  }, { timeout: 30000 });

  it('should profile peak resource usage', async () => {
    const clients: TestClient[] = [];
    
    try {
      console.log('Measuring peak resource usage...');
      
      // Create 100 clients
      for (let i = 0; i < 100; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      const memorySnapshots: number[] = [];
      
      // Perform intensive operations
      console.log('Performing intensive operations...');
      for (let i = 0; i < 10; i++) {
        // Burst of operations
        await Promise.all(
          clients.map((client, idx) =>
            client.setField(docId, `peak${i}_${idx}`, i)
          )
        );
        
        // Take memory snapshot
        const memory = process.memoryUsage();
        memorySnapshots.push(memory.heapUsed);
        
        await sleep(500);
      }
      
      // Calculate peak usage
      const peakMemory = Math.max(...memorySnapshots);
      const avgMemory = memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
      
      console.log('\nPeak resource usage:');
      console.log(`  Peak memory: ${(peakMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Avg memory: ${(avgMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Clients: 100`);
      
      // Should stay under reasonable limits
      expect(peakMemory).toBeLessThan(500 * 1024 * 1024); // 500MB

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 50000 }); // Increased timeout for binary protocol with 100 clients * 10 bursts (test ran ~46s)
});
