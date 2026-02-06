# SyncKit Benchmark Suite

Comprehensive performance benchmarks comparing TypeScript, Python, and Go server implementations.

## Quick Start

```bash
# Run quick benchmark suite (recommended for first run)
bun run benchmarks/run-benchmarks.ts --quick

# Run full benchmark suite
bun run benchmarks/run-benchmarks.ts --all

# Run specific benchmarks
bun run benchmarks/run-benchmarks.ts --server  # Server performance only
bun run benchmarks/run-benchmarks.ts --latency # Latency benchmarks only
bun run benchmarks/run-benchmarks.ts --memory  # Memory leak detection

# Save results to file
bun run benchmarks/run-benchmarks.ts --all --output results.json
```

## Prerequisites

Start the servers you want to benchmark:

```bash
# TypeScript server (port 8080)
cd server/typescript && bun run dev

# Python server (port 8081)
cd server/python && uvicorn src.synckit_server.main:app --port 8081

# Go server (port 8082)
cd server/go && go run cmd/server/main.go --port 8082
```

## Benchmarks

### 1. Server Performance (`--server`)

Measures:
- **Throughput**: Operations per second under concurrent load
- **Latency**: p50, p95, p99 response times
- **Concurrent Connections**: Maximum sustainable connections
- **Ping Latency**: Raw round-trip time

### 2. Memory Leak Detection (`--memory`)

Detects memory leaks by:
- Taking periodic heap snapshots during sustained operations
- Calculating linear regression of memory growth
- Categorizing leak severity: none, low, medium, high

### 3. Sync Latency (`--latency`)

Measures latency across scenarios:
- **Single Client**: Individual operation latency
- **Multi-Client Sync**: Propagation time across clients
- **Large Documents**: Latency with 1000+ item documents
- **Sustained Load**: Latency under continuous traffic
- **Burst**: Rapid-fire operation latency

## Results

### Expected Performance (Reference)

| Server     | Throughput | Latency p95 | Memory Stable |
|------------|------------|-------------|---------------|
| TypeScript | ~800 ops/s | ~15ms       | ✅ Yes        |
| Python     | ~600 ops/s | ~20ms       | ✅ Yes        |
| Go         | ~1200 ops/s| ~10ms       | ✅ Yes        |

*Actual results depend on hardware and system load.*

### Storage Comparison

For OPFS vs IndexedDB storage benchmarks, see:
- `sdk/benchmarks/BENCHMARK_RESULTS.md` - Detailed results
- `sdk/benchmarks/storage-comparison.ts` - Benchmark code

## Configuration

Default server ports:
- TypeScript: `localhost:8080`
- Python: `localhost:8081`
- Go: `localhost:8082`

Modify `types.ts` to change:
- Server addresses and ports
- Test duration and iterations
- Concurrent client counts

## File Structure

```
benchmarks/
├── README.md              # This file
├── run-benchmarks.ts      # Main runner
├── server-benchmark.ts    # Server performance tests
├── memory-benchmark.ts    # Memory leak detection
├── latency-benchmark.ts   # Sync latency tests
├── benchmark-client.ts    # WebSocket client for benchmarks
└── types.ts               # Shared types and utilities
```

## Adding New Benchmarks

1. Create a new benchmark file (e.g., `my-benchmark.ts`)
2. Export a main function that returns results
3. Import and call from `run-benchmarks.ts`
4. Add CLI flag for the new benchmark

## Interpreting Results

### Throughput
- Higher is better
- Measured in operations per second
- Affected by network, CPU, and memory

### Latency
- Lower is better
- p50 = median (typical user experience)
- p95 = worst 5% of users
- p99 = worst 1% of users

### Memory
- Stable is good (no continuous growth)
- Growth rate < 1 KB/s is acceptable
- > 100 KB/s indicates a leak

## Tips

- Run benchmarks on a quiet system (minimal background processes)
- Use `--expose-gc` for accurate memory measurements
- Run multiple times for consistent results
- Compare relative performance, not absolute numbers
