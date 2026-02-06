/**
 * Sync Latency Benchmark
 *
 * Measures sync latency across different scenarios:
 * - Single client operations
 * - Multi-client sync propagation
 * - Large document operations
 * - Sustained load latency
 */

import {
  ServerConfig,
  DEFAULT_SERVERS,
  percentile,
  formatDuration,
  sleep,
  generateDocument,
} from './types';
import { BenchmarkClient } from './benchmark-client';

interface LatencyResult {
  scenario: string;
  server: string;
  latencies: number[];
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  operations: number;
}

interface LatencyBenchmarkOptions {
  servers?: ServerConfig[];
  iterations?: number;
  verbose?: boolean;
}

/**
 * Single client operation latency
 */
async function benchmarkSingleClient(
  server: ServerConfig,
  iterations: number
): Promise<LatencyResult> {
  console.log(`    Single client operations (${iterations} iterations)...`);

  const client = new BenchmarkClient(server);
  const latencies: number[] = [];
  const docId = `latency-single-${Date.now()}`;

  try {
    await client.connect(5000);
    await client.authenticate('latency-user');
    await client.subscribe(docId);

    // Warmup
    for (let i = 0; i < 10; i++) {
      await client.sendDelta(docId, { warmup: i });
    }

    // Benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await client.sendDelta(docId, { operation: i, timestamp: Date.now() });
      latencies.push(performance.now() - start);
    }

    return createResult('single-client', server.name, latencies);
  } finally {
    await client.disconnect();
  }
}

/**
 * Multi-client sync propagation latency
 * Measures time for a change to propagate from one client to others
 */
async function benchmarkMultiClientSync(
  server: ServerConfig,
  clientCount: number,
  iterations: number
): Promise<LatencyResult> {
  console.log(`    Multi-client sync (${clientCount} clients, ${iterations} iterations)...`);

  const clients: BenchmarkClient[] = [];
  const latencies: number[] = [];
  const docId = `latency-multi-${Date.now()}`;

  try {
    // Create clients
    for (let i = 0; i < clientCount; i++) {
      const client = new BenchmarkClient(server);
      await client.connect(5000);
      await client.authenticate(`sync-user-${i}`);
      await client.subscribe(docId);
      clients.push(client);
    }

    // Warmup
    for (let i = 0; i < 5; i++) {
      await clients[0].sendDelta(docId, { warmup: i });
      await sleep(50);
    }

    // Benchmark - measure round-trip for concurrent operations
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // All clients send simultaneously
      await Promise.all(
        clients.map((client, idx) =>
          client.sendDelta(docId, { [`client${idx}_op${i}`]: Date.now() })
        )
      );

      latencies.push(performance.now() - start);
      await sleep(20);
    }

    return createResult('multi-client-sync', server.name, latencies);
  } finally {
    await Promise.all(clients.map(c => c.disconnect()));
  }
}

/**
 * Large document operation latency
 */
async function benchmarkLargeDocument(
  server: ServerConfig,
  iterations: number
): Promise<LatencyResult> {
  console.log(`    Large document operations (${iterations} iterations)...`);

  const client = new BenchmarkClient(server);
  const latencies: number[] = [];
  const docId = `latency-large-${Date.now()}`;

  try {
    await client.connect(5000);
    await client.authenticate('large-doc-user');
    await client.subscribe(docId);

    // Generate large document
    const largeDoc = generateDocument('large');

    // Warmup with smaller docs
    for (let i = 0; i < 5; i++) {
      await client.sendDelta(docId, { warmup: generateDocument('small') });
    }

    // Benchmark with large documents
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await client.sendDelta(docId, { [`large_${i}`]: largeDoc });
      latencies.push(performance.now() - start);
      await sleep(50); // Allow server to process
    }

    return createResult('large-document', server.name, latencies);
  } finally {
    await client.disconnect();
  }
}

/**
 * Sustained load latency
 * Measures latency under continuous load
 */
async function benchmarkSustainedLoad(
  server: ServerConfig,
  duration: number,
  clientCount: number
): Promise<LatencyResult> {
  console.log(`    Sustained load (${clientCount} clients, ${formatDuration(duration)})...`);

  const clients: BenchmarkClient[] = [];
  const latencies: number[] = [];
  const docId = `latency-sustained-${Date.now()}`;

  try {
    // Create clients
    for (let i = 0; i < clientCount; i++) {
      const client = new BenchmarkClient(server);
      await client.connect(5000);
      await client.authenticate(`sustained-user-${i}`);
      await client.subscribe(docId);
      clients.push(client);
    }

    const startTime = Date.now();
    const endTime = startTime + duration;
    let opCount = 0;

    while (Date.now() < endTime) {
      const clientIdx = opCount % clients.length;
      const start = performance.now();

      try {
        await clients[clientIdx].sendDelta(docId, {
          op: opCount,
          time: Date.now(),
        });
        latencies.push(performance.now() - start);
      } catch {
        // Ignore errors, just track successful latencies
      }

      opCount++;
      await sleep(10);
    }

    return createResult('sustained-load', server.name, latencies);
  } finally {
    await Promise.all(clients.map(c => c.disconnect()));
  }
}

/**
 * Burst latency - rapid fire operations
 */
async function benchmarkBurst(
  server: ServerConfig,
  burstSize: number,
  bursts: number
): Promise<LatencyResult> {
  console.log(`    Burst operations (${bursts} bursts of ${burstSize})...`);

  const client = new BenchmarkClient(server);
  const latencies: number[] = [];
  const docId = `latency-burst-${Date.now()}`;

  try {
    await client.connect(5000);
    await client.authenticate('burst-user');
    await client.subscribe(docId);

    // Warmup
    for (let i = 0; i < 10; i++) {
      await client.sendDelta(docId, { warmup: i });
    }

    // Benchmark bursts
    for (let burst = 0; burst < bursts; burst++) {
      const burstLatencies: number[] = [];

      for (let i = 0; i < burstSize; i++) {
        const start = performance.now();
        await client.sendDelta(docId, { burst, op: i });
        burstLatencies.push(performance.now() - start);
      }

      latencies.push(...burstLatencies);

      // Rest between bursts
      await sleep(500);
    }

    return createResult('burst', server.name, latencies);
  } finally {
    await client.disconnect();
  }
}

/**
 * Create a LatencyResult from collected latencies
 */
function createResult(scenario: string, server: string, latencies: number[]): LatencyResult {
  const sorted = [...latencies].sort((a, b) => a - b);

  return {
    scenario,
    server,
    latencies,
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    avg: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    operations: latencies.length,
  };
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
 * Run all latency benchmarks
 */
export async function runLatencyBenchmarks(
  options: LatencyBenchmarkOptions = {}
): Promise<LatencyResult[]> {
  const servers = options.servers || DEFAULT_SERVERS;
  const iterations = options.iterations || 100;
  const verbose = options.verbose || false;

  console.log('='.repeat(60));
  console.log('  SYNC LATENCY BENCHMARK');
  console.log('='.repeat(60));
  console.log(`  Iterations per test: ${iterations}`);
  console.log('='.repeat(60));

  const results: LatencyResult[] = [];

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

  // Run benchmarks for each server
  for (const server of availableServers) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  TESTING: ${server.name.toUpperCase()}`);
    console.log('─'.repeat(60));

    try {
      // 1. Single client
      const singleResult = await benchmarkSingleClient(server, iterations);
      results.push(singleResult);
      printResult(singleResult);

      // 2. Multi-client sync
      const multiResult = await benchmarkMultiClientSync(server, 5, Math.floor(iterations / 2));
      results.push(multiResult);
      printResult(multiResult);

      // 3. Large document
      const largeResult = await benchmarkLargeDocument(server, Math.floor(iterations / 4));
      results.push(largeResult);
      printResult(largeResult);

      // 4. Sustained load
      const sustainedResult = await benchmarkSustainedLoad(server, 30000, 10);
      results.push(sustainedResult);
      printResult(sustainedResult);

      // 5. Burst
      const burstResult = await benchmarkBurst(server, 20, 5);
      results.push(burstResult);
      printResult(burstResult);
    } catch (err) {
      console.log(`  Error testing ${server.name}: ${err}`);
    }
  }

  // Summary comparison
  console.log('\n' + '='.repeat(60));
  console.log('  LATENCY BENCHMARK SUMMARY');
  console.log('='.repeat(60));

  const scenarios = [...new Set(results.map(r => r.scenario))];

  for (const scenario of scenarios) {
    console.log(`\n  ${scenario}:`);
    const scenarioResults = results.filter(r => r.scenario === scenario);

    for (const r of scenarioResults) {
      console.log(
        `    ${r.server.padEnd(12)}: ` +
        `p50=${r.p50.toFixed(1)}ms, p95=${r.p95.toFixed(1)}ms, p99=${r.p99.toFixed(1)}ms`
      );
    }
  }

  console.log('\n' + '='.repeat(60));

  return results;
}

function printResult(result: LatencyResult): void {
  console.log(
    `      → p50: ${result.p50.toFixed(2)}ms, ` +
    `p95: ${result.p95.toFixed(2)}ms, ` +
    `p99: ${result.p99.toFixed(2)}ms`
  );
}

// Run if executed directly
if (require.main === module) {
  runLatencyBenchmarks({
    iterations: 50,
    verbose: true,
  })
    .then(results => {
      console.log('\nResults JSON:');
      console.log(JSON.stringify(
        results.map(r => ({
          scenario: r.scenario,
          server: r.server,
          p50: r.p50,
          p95: r.p95,
          p99: r.p99,
          avg: r.avg,
          operations: r.operations,
        })),
        null,
        2
      ));
    })
    .catch(console.error);
}
