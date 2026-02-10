#!/usr/bin/env bun
/**
 * SyncKit Benchmark Suite Runner
 *
 * Runs all benchmarks and generates comprehensive results.
 *
 * Usage:
 *   bun run benchmarks/run-benchmarks.ts [options]
 *
 * Options:
 *   --all           Run all benchmarks
 *   --server        Run server performance benchmarks
 *   --memory        Run memory leak detection benchmarks
 *   --latency       Run latency benchmarks
 *   --quick         Run quick benchmarks (shorter duration)
 *   --verbose       Show detailed output
 *   --output <file> Write results to JSON file
 */

import * as fs from 'fs';
import * as path from 'path';
import { runServerBenchmarks } from './server-benchmark';
import { runMemoryBenchmarks } from './memory-benchmark';
import { runLatencyBenchmarks } from './latency-benchmark';
import { DEFAULT_SERVERS, formatDuration } from './types';

interface BenchmarkSuiteOptions {
  runServer: boolean;
  runMemory: boolean;
  runLatency: boolean;
  quick: boolean;
  verbose: boolean;
  outputFile?: string;
}

interface SuiteResults {
  timestamp: string;
  platform: {
    os: string;
    arch: string;
    nodeVersion: string;
  };
  servers: string[];
  serverBenchmarks?: Awaited<ReturnType<typeof runServerBenchmarks>>;
  memoryBenchmarks?: Awaited<ReturnType<typeof runMemoryBenchmarks>>;
  latencyBenchmarks?: Awaited<ReturnType<typeof runLatencyBenchmarks>>;
}

function parseArgs(): BenchmarkSuiteOptions {
  const args = process.argv.slice(2);

  // Default to running all if no specific benchmark is selected
  const hasSpecificBenchmark =
    args.includes('--server') ||
    args.includes('--memory') ||
    args.includes('--latency');

  return {
    runServer: args.includes('--all') || args.includes('--server') || !hasSpecificBenchmark,
    runMemory: args.includes('--all') || args.includes('--memory'),
    runLatency: args.includes('--all') || args.includes('--latency') || !hasSpecificBenchmark,
    quick: args.includes('--quick'),
    verbose: args.includes('--verbose'),
    outputFile: args.includes('--output')
      ? args[args.indexOf('--output') + 1]
      : undefined,
  };
}

function printBanner(): void {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                                                          ║');
  console.log('║              SYNCKIT BENCHMARK SUITE v0.3.0              ║');
  console.log('║                                                          ║');
  console.log('║  Cross-server performance comparison for TypeScript,    ║');
  console.log('║  Python, and Go server implementations.                  ║');
  console.log('║                                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
}

function printUsage(): void {
  console.log('Usage: bun run benchmarks/run-benchmarks.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --all           Run all benchmarks (server, memory, latency)');
  console.log('  --server        Run server performance benchmarks');
  console.log('  --memory        Run memory leak detection benchmarks');
  console.log('  --latency       Run latency benchmarks');
  console.log('  --quick         Run quick benchmarks (shorter duration)');
  console.log('  --verbose       Show detailed output');
  console.log('  --output <file> Write results to JSON file');
  console.log('  --help          Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  bun run benchmarks/run-benchmarks.ts --quick');
  console.log('  bun run benchmarks/run-benchmarks.ts --all --verbose');
  console.log('  bun run benchmarks/run-benchmarks.ts --server --output results.json');
  console.log('');
  console.log('Prerequisites:');
  console.log('  Start the servers you want to benchmark:');
  console.log('    TypeScript: cd server/typescript && bun run dev');
  console.log('    Python:     cd server/python && uvicorn src.synckit_server.main:app --port 8081');
  console.log('    Go:         cd server/go && go run cmd/server/main.go --port 8082');
  console.log('');
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  printBanner();

  const options = parseArgs();
  const startTime = Date.now();

  console.log('Configuration:');
  console.log(`  Server benchmarks: ${options.runServer ? 'YES' : 'NO'}`);
  console.log(`  Memory benchmarks: ${options.runMemory ? 'YES' : 'NO'}`);
  console.log(`  Latency benchmarks: ${options.runLatency ? 'YES' : 'NO'}`);
  console.log(`  Mode: ${options.quick ? 'QUICK' : 'FULL'}`);
  console.log(`  Verbose: ${options.verbose ? 'YES' : 'NO'}`);
  if (options.outputFile) {
    console.log(`  Output file: ${options.outputFile}`);
  }
  console.log('');

  const results: SuiteResults = {
    timestamp: new Date().toISOString(),
    platform: {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    servers: DEFAULT_SERVERS.map(s => s.name),
  };

  // Run server benchmarks
  if (options.runServer) {
    console.log('\n' + '═'.repeat(60));
    console.log('  PHASE 1: SERVER PERFORMANCE BENCHMARKS');
    console.log('═'.repeat(60));

    results.serverBenchmarks = await runServerBenchmarks({
      config: {
        concurrentClients: options.quick ? 20 : 50,
        testDuration: options.quick ? 15000 : 60000,
        warmupDuration: options.quick ? 2000 : 5000,
        verbose: options.verbose,
      },
    });
  }

  // Run memory benchmarks
  if (options.runMemory) {
    console.log('\n' + '═'.repeat(60));
    console.log('  PHASE 2: MEMORY LEAK DETECTION BENCHMARKS');
    console.log('═'.repeat(60));

    results.memoryBenchmarks = await runMemoryBenchmarks({
      duration: options.quick ? 60000 : 180000, // 1 min vs 3 min
      snapshotInterval: options.quick ? 10000 : 30000,
      clientCount: options.quick ? 10 : 20,
      verbose: options.verbose,
    });
  }

  // Run latency benchmarks
  if (options.runLatency) {
    console.log('\n' + '═'.repeat(60));
    console.log('  PHASE 3: SYNC LATENCY BENCHMARKS');
    console.log('═'.repeat(60));

    results.latencyBenchmarks = await runLatencyBenchmarks({
      iterations: options.quick ? 30 : 100,
      verbose: options.verbose,
    });
  }

  // Final summary
  const totalDuration = Date.now() - startTime;

  console.log('\n' + '═'.repeat(60));
  console.log('  BENCHMARK SUITE COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  Total duration: ${formatDuration(totalDuration)}`);
  console.log(`  Timestamp: ${results.timestamp}`);
  console.log('═'.repeat(60));

  // Write results to file if specified
  if (options.outputFile) {
    const outputPath = path.resolve(options.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\nResults written to: ${outputPath}`);
  }

  // Generate markdown summary
  generateMarkdownSummary(results);
}

function generateMarkdownSummary(results: SuiteResults): void {
  console.log('\n' + '─'.repeat(60));
  console.log('  MARKDOWN SUMMARY (copy for docs)');
  console.log('─'.repeat(60));

  const lines: string[] = [
    `## Benchmark Results - ${new Date(results.timestamp).toLocaleDateString()}`,
    '',
    `**Platform:** ${results.platform.os} (${results.platform.arch})`,
    `**Node Version:** ${results.platform.nodeVersion}`,
    '',
  ];

  // Server performance table
  if (results.serverBenchmarks?.results?.length) {
    lines.push('### Server Performance');
    lines.push('');
    lines.push('| Server | Throughput (ops/sec) | Latency p50 | Latency p95 | Error Rate |');
    lines.push('|--------|---------------------|-------------|-------------|------------|');

    for (const r of results.serverBenchmarks.results) {
      lines.push(
        `| ${r.server} | ${r.metrics.throughput.toFixed(2)} | ` +
        `${r.metrics.latencyP50.toFixed(2)}ms | ` +
        `${r.metrics.latencyP95.toFixed(2)}ms | ` +
        `${r.metrics.errorRate.toFixed(2)}% |`
      );
    }
    lines.push('');
  }

  // Memory benchmark table
  if (results.memoryBenchmarks?.length) {
    lines.push('### Memory Stability');
    lines.push('');
    lines.push('| Server | Leak Detected | Memory Growth | Growth Rate |');
    lines.push('|--------|--------------|---------------|-------------|');

    for (const r of results.memoryBenchmarks) {
      const leakStatus = r.leakDetected ? `⚠️ ${r.leakSeverity}` : '✅ None';
      lines.push(
        `| ${r.server} | ${leakStatus} | ` +
        `${(r.memoryGrowth / 1024 / 1024).toFixed(2)} MB | ` +
        `${(r.growthRate / 1024).toFixed(2)} KB/s |`
      );
    }
    lines.push('');
  }

  // Latency benchmark table
  if (results.latencyBenchmarks?.length) {
    lines.push('### Sync Latency');
    lines.push('');
    lines.push('| Server | Scenario | p50 | p95 | p99 |');
    lines.push('|--------|----------|-----|-----|-----|');

    for (const r of results.latencyBenchmarks) {
      lines.push(
        `| ${r.server} | ${r.scenario} | ` +
        `${r.p50.toFixed(2)}ms | ` +
        `${r.p95.toFixed(2)}ms | ` +
        `${r.p99.toFixed(2)}ms |`
      );
    }
    lines.push('');
  }

  console.log('\n```markdown');
  console.log(lines.join('\n'));
  console.log('```\n');
}

// Run
main().catch((err) => {
  console.error('Benchmark suite failed:', err);
  process.exit(1);
});
