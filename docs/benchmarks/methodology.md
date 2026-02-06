# Benchmark Methodology

This document describes how SyncKit benchmarks are conducted to ensure reproducible, meaningful results.

## Overview

SyncKit benchmarks measure three key aspects:
1. **Server Performance** - Throughput, latency, and concurrent connections
2. **Memory Stability** - Detection of memory leaks over time
3. **Storage Performance** - OPFS vs IndexedDB comparison

## Test Environment

### Recommended Setup
- **OS**: Linux, macOS, or Windows
- **CPU**: 4+ cores recommended
- **RAM**: 8GB+ recommended
- **Network**: localhost (to eliminate network variance)

### Process Isolation
- Close unnecessary applications during benchmarks
- Disable CPU throttling if possible
- Run multiple iterations to average out variance

## Server Performance Benchmarks

### Throughput Measurement

**Methodology:**
1. Create N concurrent WebSocket clients (default: 50)
2. Warm up for 5 seconds
3. Send continuous delta operations for 60 seconds
4. Count successful operations and calculate ops/sec

**Metrics:**
- Operations per second (throughput)
- Error rate (failed operations / total operations)

### Latency Measurement

**Methodology:**
1. Send operation and start timer
2. Wait for ACK response from server
3. Record round-trip time
4. Repeat for N iterations (default: 100)

**Metrics:**
- p50 (median) - typical user experience
- p95 - worst 5% of users
- p99 - worst 1% of users
- min/max - extreme values

### Concurrent Connections

**Methodology:**
1. Attempt to establish connections in batches of 50
2. Authenticate each connection
3. Count successful connections
4. Continue until failures exceed threshold

**Metrics:**
- Maximum concurrent connections achieved
- Time to establish connections

## Memory Leak Detection

### Snapshot Method

**Methodology:**
1. Force garbage collection (if available)
2. Record initial heap size
3. Perform sustained operations for 3+ minutes
4. Take memory snapshots every 30 seconds
5. Calculate linear regression of heap growth

**Leak Classification:**
| Growth Rate | Severity | Classification |
|-------------|----------|----------------|
| < 1 KB/s    | None     | Stable         |
| 1-10 KB/s   | Low      | Minor leak     |
| 10-100 KB/s | Medium   | Moderate leak  |
| > 100 KB/s  | High     | Critical leak  |

### Considerations

- Always run with `--expose-gc` for accurate measurements
- Memory may grow initially due to JIT compilation
- Look for sustained linear growth, not spikes

## Storage Benchmarks

### OPFS vs IndexedDB

**Operations Tested:**
1. **Write** - Store document with varying sizes
2. **Read** - Retrieve document by ID
3. **List** - Enumerate all documents
4. **Delete** - Remove document by ID

**Document Sizes:**
- Small: 10 items (~1KB)
- Medium: 100 items (~10KB)
- Large: 1000 items (~100KB)

**Methodology:**
1. Warm up with 1 operation
2. Run 100 iterations per operation
3. Measure total time and calculate average
4. Compare ops/sec between adapters

## Reproducibility

### Running Benchmarks

```bash
# Quick benchmark (15 seconds per test)
bun run benchmarks/run-benchmarks.ts --quick

# Full benchmark (60 seconds per test)
bun run benchmarks/run-benchmarks.ts --all

# With memory profiling
bun run --expose-gc benchmarks/run-benchmarks.ts --memory
```

### Result Variation

Expected variation between runs:
- Throughput: ±10%
- Latency: ±15%
- Memory: ±5%

Run 3-5 times and use median for reporting.

## Binary Protocol

All benchmarks use SyncKit's binary protocol:

```
┌─────────────┬─────────────┬──────────────┬─────────────┐
│ Type (1B)   │ Timestamp   │ Length (4B)  │ JSON Payload│
│             │ (8B BE)     │ (BE)         │             │
└─────────────┴─────────────┴──────────────┴─────────────┘
```

This ensures benchmarks match real-world SDK behavior.

## Limitations

### What Benchmarks Don't Measure

- Network latency (all tests use localhost)
- Disk I/O for persistence (in-memory mode)
- Cross-server replication (single server tests)
- Browser-specific performance

### Synthetic vs Real Workloads

Benchmarks use synthetic workloads that may not match production:
- Uniform operation distribution
- Small documents (typically)
- No user think time

Real-world performance may vary based on:
- Document size distribution
- Operation patterns
- Network conditions
- Server configuration

## Reporting Results

When sharing benchmark results, include:

1. **Hardware**: CPU, RAM, OS
2. **Software**: Node version, Bun version, server versions
3. **Configuration**: Client count, duration, document size
4. **Date**: Benchmarks may differ between versions
5. **Comparison**: Relative performance, not just absolute numbers

## Future Improvements

Planned benchmark additions:
- [ ] Cross-server replication latency
- [ ] Geographic distribution simulation
- [ ] Browser-based storage benchmarks
- [ ] Long-running stability tests (24+ hours)
