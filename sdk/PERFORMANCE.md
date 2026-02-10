# Performance Benchmarks

Performance characteristics of SyncKit v0.3.0 network layer.

## Benchmark Results

### Network Message Operations

| Operation | Performance | Per Operation |
|-----------|-------------|---------------|
| **Encode 1000 messages** | 5.05ms | 0.005ms |
| **Decode 1000 messages** | 19.62ms | 0.020ms |

**Analysis**: Binary message encoding/decoding is highly efficient, with encoding being ~4x faster than decoding. The binary protocol (1B type + 8B timestamp + 4B length + JSON payload) provides excellent performance while maintaining flexibility.

### Offline Queue Operations

| Operation | Performance | Per Operation |
|-----------|-------------|---------------|
| **Enqueue 1000 operations** | 21.21ms | 0.021ms |
| **Get queue stats (1000 calls)** | 0.26ms | 0.0003ms |

**Analysis**: Queue operations are extremely efficient. The persistent queue can handle ~47,000 operations per second, and status checks are effectively instant. This ensures minimal overhead even when operating offline with large queues.

### Vector Clock Operations

| Operation | Performance | Notes |
|-----------|-------------|-------|
| **Merge 100 vector clocks** | 0.30ms | ~300 clocks/ms |
| **Compare 10,000 clocks** | 8.31ms | 0.0008ms each |

**Analysis**: Vector clock operations (used for conflict resolution) are blazing fast. The implementation can handle over 1 million clock comparisons per second, ensuring zero perceptible latency for conflict resolution.

## Bundle Size

**Production Bundle Sizes** (gzipped, what users actually download):

| Build | Total Size | JS | WASM | Use Case |
|-------|------------|----|----- |----------|
| **Full SDK** | **154KB** | 16KB | 138KB | Complete collaboration suite |
| **Lite SDK** | **46KB** | 1.5KB | 44KB | Offline-only, no network |

**Network Layer Overhead**: 14KB gzipped for complete WebSocket + sync implementation

**Uncompressed Sizes** (for reference):

| Build | Total Size | JS | WASM |
|-------|------------|----|----- |
| **Full SDK (ESM)** | 141KB | 48KB | 93KB |
| **Full SDK (CJS)** | 156KB | 63KB | 93KB |
| **Lite SDK (ESM)** | 85KB | 5.1KB | 80KB |
| **Lite SDK (CJS)** | 102KB | 22KB | 80KB |

**Analysis**: The full SDK with complete collaboration features is **154KB gzipped** - includes text CRDTs, rich text, undo/redo, cursors, and framework adapters out of the box. This is **108KB more** than the lite version, which provides:
- WebSocket client with auto-reconnection
- Binary message protocol
- Persistent offline queue
- Vector clock conflict resolution
- Sync state management
- React hooks

## Memory Efficiency

- **No memory leaks** detected in repeated operations
- **Document reuse** efficiently handles repeated updates
- **Queue management** automatically manages memory for failed operations

## Recommendations

### Optimal Use Cases

1. **Real-time collaboration** - Sub-millisecond operation latency
2. **Offline-first apps** - Efficient queue handles thousands of pending operations
3. **Mobile applications** - Efficient memory use and optional lite version (46KB gzipped)
4. **High-frequency updates** - Can handle 47K+ operations/sec

### Performance Tips

1. **Batch operations** when possible - single large update is more efficient than many small ones
2. **Use lite build** for offline-only scenarios - saves 14KB gzipped
3. **Monitor queue size** during extended offline periods
4. **Leverage React hooks** for efficient re-renders based on sync state

## Comparison to Alternatives

All sizes are **gzipped** for fair comparison:

| Feature | SyncKit | Yjs | Automerge | Supabase Realtime |
|---------|---------|-----|-----------|-------------------|
| **Bundle size** | 154KB | ~65KB | ~300KB+ | ~80KB |
| **Offline-first** | ✅ Native | ⚠️ Limited | ✅ Native | ❌ Online-only |
| **React integration** | ✅ Built-in hooks | ⚠️ External | ⚠️ External | ⚠️ External |
| **Binary protocol** | ✅ Custom | ✅ Custom | ✅ Custom | ✅ WebSocket |
| **Vector clocks** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |

## Test Coverage

- **Total tests**: 2,100+ across TypeScript, Rust, Python, Go, and C#
- **Unit tests**: 100% passing ✅
- **Integration tests**: 100% passing ✅
- **Performance tests**: All passing ✅

All critical paths tested and verified across all server implementations.

## Performance Monitoring

To run benchmarks yourself:

```bash
npm test -- performance/benchmarks.test.ts --run
```

## Version History

### v0.3.0 (Current)
- Multi-language server implementations (TypeScript, Python, Go, C#)
- OPFS storage adapter (4-30x faster than IndexedDB)
- Comprehensive benchmark suite
- Performance benchmarks established
- All critical paths optimized
