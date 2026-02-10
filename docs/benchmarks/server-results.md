# Server Performance Results

**Version:** 0.3.0
**Date:** February 2026
**Servers Tested:** TypeScript, Python, Go

> **Note:** The C# server (ASP.NET Core) is also production-ready but was not included in these benchmarks. It ships with its own BenchmarkDotNet suite in `server/csharp/src/SyncKit.Server.Benchmarks/`. Cross-server comparison results for C# will be added in a future update.

## Executive Summary

All three benchmarked SyncKit server implementations (TypeScript, Python, Go) are production-ready with excellent performance characteristics:

- **Go** leads in raw throughput (~1,200 ops/sec) and lowest latency
- **TypeScript** provides balanced performance (~800 ops/sec) with the richest ecosystem
- **Python** delivers solid performance (~600 ops/sec) with excellent debugging and deployment flexibility

All servers show **no memory leaks** under sustained load testing.

## Throughput Comparison

| Server     | Ops/sec | Relative | Notes |
|------------|---------|----------|-------|
| Go         | ~1,200  | 1.5x     | Highest throughput due to goroutines |
| TypeScript | ~800    | 1.0x     | Baseline, excellent for most use cases |
| Python     | ~600    | 0.75x    | Async performance, sufficient for typical loads |

*50 concurrent clients, 60-second test duration, medium-sized documents.*

## Latency Comparison

| Server     | p50   | p95   | p99   | Notes |
|------------|-------|-------|-------|-------|
| Go         | 5ms   | 12ms  | 25ms  | Best latency profile |
| TypeScript | 8ms   | 18ms  | 35ms  | Consistent performance |
| Python     | 12ms  | 25ms  | 50ms  | Acceptable for real-time |

*Single client ping latency, 100 iterations.*

## Concurrent Connections

| Server     | Max Connections | Notes |
|------------|-----------------|-------|
| Go         | 500+            | Goroutine-based, very efficient |
| TypeScript | 400+            | Event loop handles well |
| Python     | 300+            | Async/await pattern works well |

*Tested with authentication per connection.*

## Memory Stability

| Server     | Initial | After 3min | Growth Rate | Leak Status |
|------------|---------|------------|-------------|-------------|
| TypeScript | 45 MB   | 48 MB      | 0.2 KB/s    | ✅ Stable   |
| Python     | 52 MB   | 55 MB      | 0.3 KB/s    | ✅ Stable   |
| Go         | 28 MB   | 30 MB      | 0.1 KB/s    | ✅ Stable   |

*20 clients, continuous operations for 3 minutes.*

## Scenario-Based Latency

### Single Client Operations

| Server     | p50   | p95   | p99   |
|------------|-------|-------|-------|
| Go         | 3ms   | 8ms   | 15ms  |
| TypeScript | 5ms   | 12ms  | 22ms  |
| Python     | 8ms   | 18ms  | 30ms  |

### Multi-Client Sync (5 clients)

| Server     | p50   | p95   | p99   |
|------------|-------|-------|-------|
| Go         | 8ms   | 20ms  | 35ms  |
| TypeScript | 12ms  | 28ms  | 45ms  |
| Python     | 18ms  | 35ms  | 55ms  |

### Large Documents (1000 items)

| Server     | p50   | p95   | p99   |
|------------|-------|-------|-------|
| Go         | 15ms  | 35ms  | 60ms  |
| TypeScript | 22ms  | 48ms  | 80ms  |
| Python     | 30ms  | 65ms  | 100ms |

### Sustained Load (30 seconds)

| Server     | p50   | p95   | p99   | Error Rate |
|------------|-------|-------|-------|------------|
| Go         | 10ms  | 25ms  | 45ms  | 0.01%      |
| TypeScript | 15ms  | 32ms  | 55ms  | 0.02%      |
| Python     | 22ms  | 45ms  | 75ms  | 0.03%      |

## Recommendations

### Choose TypeScript When:
- Full-stack JavaScript team
- Need rich npm ecosystem integration
- Prefer familiar async/await patterns
- Want easiest deployment to Node.js hosting

### Choose Python When:
- Existing Python/Django/FastAPI infrastructure
- Data science or ML integration planned
- Team most comfortable with Python
- Need excellent debugging and profiling tools

### Choose Go When:
- Maximum throughput required
- Running on resource-constrained servers
- Need smallest memory footprint
- Deploying as a single binary

## Test Environment

**Hardware:**
- CPU: Intel Core i7 (4 cores)
- RAM: 16GB
- OS: Windows 11 / Ubuntu 22.04

**Software:**
- Bun: 1.0.x
- Node.js: 20.x
- Python: 3.11.x
- Go: 1.21.x

## Reproducing Results

```bash
# Start all servers
cd server/typescript && bun run dev &
cd server/python && uvicorn src.synckit_server.main:app --port 8081 &
cd server/go && go run cmd/server/main.go --port 8082 &

# Run full benchmark suite
bun run benchmarks/run-benchmarks.ts --all --output results.json
```

## Historical Comparison

| Metric          | v0.2.0 (TS only) | v0.3.0 (TS) | v0.3.0 (Go) |
|-----------------|------------------|-------------|-------------|
| Throughput      | ~750 ops/s       | ~800 ops/s  | ~1,200 ops/s|
| Latency p95     | ~20ms            | ~18ms       | ~12ms       |
| Memory (3min)   | +5 MB            | +3 MB       | +2 MB       |

*Improvements in v0.3.0 due to security optimizations and code cleanup.*

## Conclusion

SyncKit v0.3.0 delivers production-ready performance across all benchmarked server implementations. Choose based on your team's expertise and infrastructure requirements rather than raw performance -- all servers exceed typical real-time collaboration requirements. The C# server is also available for .NET teams.

For most teams, **TypeScript** offers the best balance of performance, ecosystem, and developer experience. Teams with high-throughput requirements or Go expertise should consider the **Go** implementation.
