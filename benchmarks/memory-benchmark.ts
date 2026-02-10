/**
 * Memory Leak Detection Benchmark
 *
 * Detects memory leaks by monitoring heap growth over sustained operations.
 * Runs operations for extended periods and tracks memory snapshots.
 */

import {
  ServerConfig,
  DEFAULT_SERVERS,
  formatBytes,
  formatDuration,
  sleep,
  generateDocument,
} from './types';
import { BenchmarkClient } from './benchmark-client';

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

interface MemoryBenchmarkResult {
  server: string;
  duration: number;
  operations: number;
  snapshots: MemorySnapshot[];
  initialMemory: number;
  finalMemory: number;
  memoryGrowth: number;
  growthRate: number; // bytes per operation
  leakDetected: boolean;
  leakSeverity: 'none' | 'low' | 'medium' | 'high';
}

interface MemoryBenchmarkOptions {
  servers?: ServerConfig[];
  duration?: number;          // ms (default: 3 minutes)
  snapshotInterval?: number;  // ms (default: 30 seconds)
  clientCount?: number;       // number of concurrent clients
  verbose?: boolean;
}

/**
 * Take a memory snapshot
 */
function takeSnapshot(): MemorySnapshot {
  if (global.gc) {
    global.gc();
  }

  const mem = process.memoryUsage();
  return {
    timestamp: Date.now(),
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
  };
}

/**
 * Analyze memory snapshots for leak patterns
 */
function analyzeMemory(snapshots: MemorySnapshot[]): {
  growthRate: number;
  leakDetected: boolean;
  leakSeverity: 'none' | 'low' | 'medium' | 'high';
} {
  if (snapshots.length < 3) {
    return { growthRate: 0, leakDetected: false, leakSeverity: 'none' };
  }

  // Calculate linear regression to detect consistent growth
  const n = snapshots.length;
  const times = snapshots.map(s => s.timestamp - snapshots[0].timestamp);
  const heaps = snapshots.map(s => s.heapUsed);

  const sumX = times.reduce((a, b) => a + b, 0);
  const sumY = heaps.reduce((a, b) => a + b, 0);
  const sumXY = times.reduce((acc, x, i) => acc + x * heaps[i], 0);
  const sumX2 = times.reduce((acc, x) => acc + x * x, 0);

  // Slope of linear regression (bytes per ms)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const growthRate = slope * 1000; // bytes per second

  // Determine leak severity based on growth rate
  // < 1KB/s: none, 1-10KB/s: low, 10-100KB/s: medium, > 100KB/s: high
  let leakSeverity: 'none' | 'low' | 'medium' | 'high' = 'none';
  let leakDetected = false;

  if (growthRate > 100 * 1024) {
    leakSeverity = 'high';
    leakDetected = true;
  } else if (growthRate > 10 * 1024) {
    leakSeverity = 'medium';
    leakDetected = true;
  } else if (growthRate > 1024) {
    leakSeverity = 'low';
    leakDetected = true;
  }

  return { growthRate, leakDetected, leakSeverity };
}

/**
 * Run memory benchmark for a single server
 */
async function benchmarkServerMemory(
  server: ServerConfig,
  options: Required<Omit<MemoryBenchmarkOptions, 'servers'>>
): Promise<MemoryBenchmarkResult> {
  console.log(`\n  [${server.name}] Starting memory benchmark...`);
  console.log(`    Duration: ${formatDuration(options.duration)}`);
  console.log(`    Clients: ${options.clientCount}`);
  console.log(`    Snapshot interval: ${formatDuration(options.snapshotInterval)}`);

  const clients: BenchmarkClient[] = [];
  const snapshots: MemorySnapshot[] = [];
  const docId = `mem-bench-${Date.now()}`;
  let operationCount = 0;

  try {
    // Create clients
    console.log('    Creating clients...');
    for (let i = 0; i < options.clientCount; i++) {
      const client = new BenchmarkClient(server);
      try {
        await client.connect(5000);
        await client.authenticate(`mem-user-${i}`);
        await client.subscribe(docId);
        clients.push(client);
      } catch (err) {
        if (options.verbose) {
          console.log(`    Client ${i} failed: ${err}`);
        }
      }
    }

    if (clients.length === 0) {
      throw new Error(`No clients could connect to ${server.name}`);
    }

    console.log(`    ${clients.length} clients connected`);

    // Take initial snapshot
    await sleep(1000);
    const initialSnapshot = takeSnapshot();
    snapshots.push(initialSnapshot);
    console.log(`    Initial memory: ${formatBytes(initialSnapshot.heapUsed)}`);

    // Run operations
    const startTime = Date.now();
    const endTime = startTime + options.duration;
    let lastSnapshotTime = startTime;

    console.log('    Running sustained operations...');

    while (Date.now() < endTime) {
      // Perform operations
      const document = generateDocument('small');
      const batch = clients.slice(0, Math.min(5, clients.length));

      await Promise.all(
        batch.map(async (client, idx) => {
          try {
            await client.sendDelta(docId, {
              [`op${operationCount + idx}`]: document,
            });
          } catch {
            // Ignore errors
          }
        })
      );

      operationCount += batch.length;

      // Take snapshot at interval
      if (Date.now() - lastSnapshotTime >= options.snapshotInterval) {
        const snapshot = takeSnapshot();
        snapshots.push(snapshot);
        lastSnapshotTime = Date.now();

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const growth = snapshot.heapUsed - initialSnapshot.heapUsed;
        console.log(
          `    ${elapsed}s: ${formatBytes(snapshot.heapUsed)} ` +
          `(${growth >= 0 ? '+' : ''}${formatBytes(growth)}) - ${operationCount} ops`
        );
      }

      await sleep(50);
    }

    // Final snapshot
    await sleep(2000);
    const finalSnapshot = takeSnapshot();
    snapshots.push(finalSnapshot);

    const duration = Date.now() - startTime;
    const memoryGrowth = finalSnapshot.heapUsed - initialSnapshot.heapUsed;
    const analysis = analyzeMemory(snapshots);

    console.log(`\n    Results for ${server.name}:`);
    console.log(`      Duration: ${formatDuration(duration)}`);
    console.log(`      Operations: ${operationCount}`);
    console.log(`      Initial memory: ${formatBytes(initialSnapshot.heapUsed)}`);
    console.log(`      Final memory: ${formatBytes(finalSnapshot.heapUsed)}`);
    console.log(`      Memory growth: ${formatBytes(memoryGrowth)}`);
    console.log(`      Growth rate: ${formatBytes(analysis.growthRate)}/sec`);
    console.log(`      Leak detected: ${analysis.leakDetected ? 'YES' : 'NO'}`);
    if (analysis.leakDetected) {
      console.log(`      Leak severity: ${analysis.leakSeverity.toUpperCase()}`);
    }

    return {
      server: server.name,
      duration,
      operations: operationCount,
      snapshots,
      initialMemory: initialSnapshot.heapUsed,
      finalMemory: finalSnapshot.heapUsed,
      memoryGrowth,
      growthRate: analysis.growthRate,
      leakDetected: analysis.leakDetected,
      leakSeverity: analysis.leakSeverity,
    };
  } finally {
    await Promise.all(clients.map(c => c.disconnect()));
  }
}

/**
 * Check if server is available
 */
async function isServerAvailable(server: ServerConfig): Promise<boolean> {
  const client = new BenchmarkClient(server);
  try {
    await client.connect(3000);
    await client.disconnect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Run memory benchmarks for all servers
 */
export async function runMemoryBenchmarks(
  options: MemoryBenchmarkOptions = {}
): Promise<MemoryBenchmarkResult[]> {
  const servers = options.servers || DEFAULT_SERVERS;
  const duration = options.duration || 3 * 60 * 1000; // 3 minutes
  const snapshotInterval = options.snapshotInterval || 30 * 1000; // 30 seconds
  const clientCount = options.clientCount || 20;
  const verbose = options.verbose || false;

  console.log('='.repeat(60));
  console.log('  MEMORY LEAK DETECTION BENCHMARK');
  console.log('='.repeat(60));
  console.log(`  Duration: ${formatDuration(duration)}`);
  console.log(`  Snapshot interval: ${formatDuration(snapshotInterval)}`);
  console.log(`  Clients per server: ${clientCount}`);
  console.log('='.repeat(60));

  const results: MemoryBenchmarkResult[] = [];

  // Check which servers are available
  const availableServers: ServerConfig[] = [];
  for (const server of servers) {
    const available = await isServerAvailable(server);
    if (available) {
      availableServers.push(server);
      console.log(`  [${server.name}] Available`);
    } else {
      console.log(`  [${server.name}] Not available - skipping`);
    }
  }

  if (availableServers.length === 0) {
    console.log('\n  No servers available. Please start at least one server.');
    return results;
  }

  // Run benchmarks
  for (const server of availableServers) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  TESTING: ${server.name.toUpperCase()}`);
    console.log('─'.repeat(60));

    try {
      const result = await benchmarkServerMemory(server, {
        duration,
        snapshotInterval,
        clientCount,
        verbose,
      });
      results.push(result);
    } catch (err) {
      console.log(`  Error testing ${server.name}: ${err}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  MEMORY BENCHMARK SUMMARY');
  console.log('='.repeat(60));

  for (const r of results) {
    const status = r.leakDetected
      ? `⚠️  LEAK DETECTED (${r.leakSeverity})`
      : '✅ No leak detected';

    console.log(`\n  ${r.server}:`);
    console.log(`    ${status}`);
    console.log(`    Growth: ${formatBytes(r.memoryGrowth)} over ${formatDuration(r.duration)}`);
    console.log(`    Rate: ${formatBytes(r.growthRate)}/sec`);
    console.log(`    Operations: ${r.operations}`);
  }

  console.log('\n' + '='.repeat(60));

  return results;
}

// Run if executed directly
if (require.main === module) {
  // Enable garbage collection for accurate measurements
  if (!global.gc) {
    console.log('Note: Run with --expose-gc for more accurate memory measurements');
    console.log('  bun run --expose-gc benchmarks/memory-benchmark.ts');
    console.log('');
  }

  runMemoryBenchmarks({
    duration: 60 * 1000, // 1 minute for quick test
    snapshotInterval: 10 * 1000, // 10 seconds
    clientCount: 10,
    verbose: true,
  })
    .then(results => {
      console.log('\nResults JSON:');
      console.log(JSON.stringify(results.map(r => ({
        server: r.server,
        leakDetected: r.leakDetected,
        leakSeverity: r.leakSeverity,
        memoryGrowth: r.memoryGrowth,
        growthRate: r.growthRate,
        operations: r.operations,
      })), null, 2));
    })
    .catch(console.error);
}
