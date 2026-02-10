/**
 * Server Performance Benchmark
 *
 * Compares throughput, latency, and concurrent connection handling
 * across TypeScript, Python, and Go server implementations.
 */

import {
  BenchmarkResult,
  BenchmarkConfig,
  ServerConfig,
  DEFAULT_CONFIG,
  DEFAULT_SERVERS,
  percentile,
  formatDuration,
  sleep,
  generateDocument,
} from './types';
import { BenchmarkClient } from './benchmark-client';

interface ServerBenchmarkOptions {
  config?: Partial<BenchmarkConfig>;
  servers?: ServerConfig[];
}

/**
 * Run throughput benchmark for a single server
 */
async function benchmarkThroughput(
  server: ServerConfig,
  config: BenchmarkConfig
): Promise<BenchmarkResult> {
  console.log(`\n  [${server.name}] Starting throughput benchmark...`);

  const clients: BenchmarkClient[] = [];
  const docId = `bench-throughput-${Date.now()}`;
  const document = generateDocument(config.documentSize);

  try {
    // Create and connect clients
    console.log(`    Creating ${config.concurrentClients} clients...`);
    for (let i = 0; i < config.concurrentClients; i++) {
      const client = new BenchmarkClient(server);
      try {
        await client.connect(5000);
        await client.authenticate(`user-${i}`);
        await client.subscribe(docId);
        clients.push(client);
      } catch (err) {
        if (config.verbose) {
          console.log(`    Client ${i} failed to connect: ${err}`);
        }
      }

      if ((i + 1) % 10 === 0 && config.verbose) {
        console.log(`    Connected ${i + 1}/${config.concurrentClients} clients`);
      }
    }

    if (clients.length === 0) {
      throw new Error(`No clients could connect to ${server.name}`);
    }

    console.log(`    ${clients.length} clients connected. Warming up...`);

    // Warmup phase
    const warmupEnd = Date.now() + config.warmupDuration;
    while (Date.now() < warmupEnd) {
      const client = clients[Math.floor(Math.random() * clients.length)];
      try {
        await client.sendDelta(docId, { warmup: Date.now() });
      } catch {
        // Ignore warmup errors
      }
      await sleep(10);
    }

    // Reset metrics after warmup
    clients.forEach(c => c.resetMetrics());

    console.log(`    Running benchmark for ${formatDuration(config.testDuration)}...`);

    // Benchmark phase
    const startTime = Date.now();
    const endTime = startTime + config.testDuration;
    let totalOperations = 0;

    while (Date.now() < endTime) {
      // Send concurrent operations
      const batch = clients.slice(0, Math.min(10, clients.length));
      await Promise.all(
        batch.map(async (client, idx) => {
          try {
            await client.sendDelta(docId, {
              [`field${totalOperations + idx}`]: document,
            });
          } catch {
            // Count in error rate
          }
        })
      );
      totalOperations += batch.length;

      // Small delay to prevent overwhelming
      await sleep(5);
    }

    const duration = Date.now() - startTime;

    // Collect metrics from all clients
    const allLatencies: number[] = [];
    let totalErrors = 0;
    let totalOps = 0;

    for (const client of clients) {
      allLatencies.push(...client.getLatencies());
      totalErrors += client.getErrors();
      totalOps += client.getOperations();
    }

    const throughput = (totalOps / duration) * 1000;
    const errorRate = totalOps > 0 ? (totalErrors / (totalOps + totalErrors)) * 100 : 0;

    const result: BenchmarkResult = {
      name: 'throughput',
      server: server.name,
      metrics: {
        throughput,
        latencyP50: percentile(allLatencies, 50),
        latencyP95: percentile(allLatencies, 95),
        latencyP99: percentile(allLatencies, 99),
        errorRate,
      },
      duration,
      operations: totalOps,
      timestamp: new Date().toISOString(),
    };

    console.log(`    Completed: ${throughput.toFixed(2)} ops/sec, p95: ${result.metrics.latencyP95.toFixed(2)}ms`);

    return result;
  } finally {
    // Cleanup
    await Promise.all(clients.map(c => c.disconnect()));
  }
}

/**
 * Run concurrent connections benchmark
 */
async function benchmarkConcurrentConnections(
  server: ServerConfig,
  maxConnections: number = 500
): Promise<{ server: string; maxConnections: number; successfulConnections: number; connectionTime: number }> {
  console.log(`\n  [${server.name}] Testing concurrent connections (max ${maxConnections})...`);

  const clients: BenchmarkClient[] = [];
  const startTime = Date.now();
  let successfulConnections = 0;

  try {
    // Try to establish connections in batches
    const batchSize = 50;
    for (let i = 0; i < maxConnections; i += batchSize) {
      const batch: Promise<void>[] = [];

      for (let j = 0; j < batchSize && i + j < maxConnections; j++) {
        const client = new BenchmarkClient(server);
        clients.push(client);

        batch.push(
          client.connect(5000)
            .then(() => client.authenticate(`conn-user-${i + j}`))
            .then(() => {
              successfulConnections++;
            })
            .catch(() => {
              // Connection failed
            })
        );
      }

      await Promise.all(batch);

      // Check if we've hit the limit
      if (successfulConnections < i + batchSize - 10) {
        console.log(`    Connection limit likely reached at ${successfulConnections}`);
        break;
      }
    }

    const connectionTime = Date.now() - startTime;

    console.log(`    Established ${successfulConnections}/${maxConnections} connections in ${formatDuration(connectionTime)}`);

    return {
      server: server.name,
      maxConnections,
      successfulConnections,
      connectionTime,
    };
  } finally {
    // Cleanup
    await Promise.all(clients.map(c => c.disconnect()));
  }
}

/**
 * Run ping latency benchmark
 */
async function benchmarkPingLatency(
  server: ServerConfig,
  iterations: number = 100
): Promise<{ server: string; latencies: number[]; avgLatency: number }> {
  console.log(`\n  [${server.name}] Testing ping latency (${iterations} iterations)...`);

  const client = new BenchmarkClient(server);
  const latencies: number[] = [];

  try {
    await client.connect(5000);
    await client.authenticate('ping-user');

    // Warmup
    for (let i = 0; i < 10; i++) {
      await client.ping();
    }

    // Benchmark
    for (let i = 0; i < iterations; i++) {
      const latency = await client.ping();
      latencies.push(latency);
      await sleep(10);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    console.log(`    Avg: ${avgLatency.toFixed(2)}ms, p50: ${percentile(latencies, 50).toFixed(2)}ms, p99: ${percentile(latencies, 99).toFixed(2)}ms`);

    return {
      server: server.name,
      latencies,
      avgLatency,
    };
  } finally {
    await client.disconnect();
  }
}

/**
 * Check if a server is available
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
 * Run all server benchmarks
 */
export async function runServerBenchmarks(options: ServerBenchmarkOptions = {}): Promise<{
  results: BenchmarkResult[];
  connections: Array<{ server: string; successfulConnections: number }>;
  pingLatencies: Array<{ server: string; avgLatency: number }>;
}> {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const servers = options.servers || DEFAULT_SERVERS;

  console.log('='.repeat(60));
  console.log('  SERVER PERFORMANCE BENCHMARK');
  console.log('='.repeat(60));
  console.log(`  Clients: ${config.concurrentClients}`);
  console.log(`  Duration: ${formatDuration(config.testDuration)}`);
  console.log(`  Document size: ${config.documentSize}`);
  console.log('='.repeat(60));

  const results: BenchmarkResult[] = [];
  const connections: Array<{ server: string; successfulConnections: number }> = [];
  const pingLatencies: Array<{ server: string; avgLatency: number }> = [];

  // Check which servers are available
  const availableServers: ServerConfig[] = [];
  for (const server of servers) {
    const available = await isServerAvailable(server);
    if (available) {
      availableServers.push(server);
      console.log(`  [${server.name}] Available at ${server.host}:${server.port}`);
    } else {
      console.log(`  [${server.name}] Not available at ${server.host}:${server.port} - skipping`);
    }
  }

  if (availableServers.length === 0) {
    console.log('\n  No servers available. Please start at least one server.');
    return { results, connections, pingLatencies };
  }

  // Run benchmarks for each available server
  for (const server of availableServers) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  BENCHMARKING: ${server.name.toUpperCase()}`);
    console.log('─'.repeat(60));

    try {
      // 1. Throughput benchmark
      const throughputResult = await benchmarkThroughput(server, config);
      results.push(throughputResult);

      // 2. Concurrent connections benchmark
      const connResult = await benchmarkConcurrentConnections(server, 200);
      connections.push({
        server: connResult.server,
        successfulConnections: connResult.successfulConnections,
      });

      // 3. Ping latency benchmark
      const pingResult = await benchmarkPingLatency(server, 100);
      pingLatencies.push({
        server: pingResult.server,
        avgLatency: pingResult.avgLatency,
      });
    } catch (err) {
      console.log(`  Error benchmarking ${server.name}: ${err}`);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('  BENCHMARK SUMMARY');
  console.log('='.repeat(60));

  if (results.length > 0) {
    console.log('\n  Throughput (ops/sec):');
    for (const r of results) {
      console.log(`    ${r.server.padEnd(12)}: ${r.metrics.throughput.toFixed(2)} ops/sec`);
    }

    console.log('\n  Latency p95 (ms):');
    for (const r of results) {
      console.log(`    ${r.server.padEnd(12)}: ${r.metrics.latencyP95.toFixed(2)}ms`);
    }

    console.log('\n  Concurrent Connections:');
    for (const c of connections) {
      console.log(`    ${c.server.padEnd(12)}: ${c.successfulConnections}`);
    }

    console.log('\n  Ping Latency (avg):');
    for (const p of pingLatencies) {
      console.log(`    ${p.server.padEnd(12)}: ${p.avgLatency.toFixed(2)}ms`);
    }
  }

  console.log('\n' + '='.repeat(60));

  return { results, connections, pingLatencies };
}

// Run if executed directly
if (require.main === module) {
  runServerBenchmarks({
    config: {
      concurrentClients: 50,
      testDuration: 30000, // 30 seconds for quick test
      verbose: true,
    },
  })
    .then(({ results }) => {
      console.log('\nResults JSON:');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch(console.error);
}
