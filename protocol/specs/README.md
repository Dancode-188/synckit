# SyncKit Protocol Specifications

This directory contains the Protobuf definitions for the SyncKit sync protocol.

## Overview

The protocol is designed to be:
- **Language-agnostic** - Any language with Protobuf support can implement it
- **Efficient** - Binary encoding reduces bandwidth usage
- **Versioned** - Protocol evolution through backward-compatible changes
- **Type-safe** - Strong typing prevents errors

## Files

### Core Types (`types.proto`)
Fundamental data types used across all protocols:
- `ClientID` - Unique client identifier
- `Timestamp` - Logical timestamp with client ID for tie-breaking
- `VectorClock` - Causality tracking between replicas
- `DocumentID` - Document identifier
- `FieldPath` - Path to field within document
- `Value` - Generic value type (supports JSON-like data)
- `Status` - Operation status codes

### Message Structures (`messages.proto`)
Document and delta representations:
- `Field` - Field with LWW metadata (Tier 1)
- `Document` - Complete document state
- `Delta` - Changes between document states
- `SyncCheckpoint` - Resume point for sync
- `TextOperation` - CRDT text operations (Tier 2)
- `SetOperation` - OR-Set CRDT operations (Tier 3)
- `CounterOperation` - PN-Counter operations (Tier 3)
- `CRDTOperation` - Generic CRDT wrapper

### Sync Protocol (`sync.proto`)
Core synchronization protocol:
- `SyncRequest` - Client requests sync
- `SyncResponse` - Server responds with deltas
- `SyncNotification` - Real-time update push
- `SyncAck` - Client acknowledges update
- `WSMessage` - WebSocket message envelope
- `SubscribeRequest` - Subscribe to document updates
- Heartbeat (Ping/Pong) messages

### Authentication (`auth.proto`)
Authentication and authorization:
- `AuthRequest` - Authentication credentials
- `AuthResponse` - Session token and permissions
- `Permissions` - RBAC (Role-Based Access Control)
- `RefreshRequest/Response` - Token refresh
- `LogoutRequest/Response` - Session termination

## Three-Tier Architecture

### Tier 1: Last-Write-Wins (LWW)
- Simple field-level conflict resolution
- Uses `Field` message with `Timestamp`
- Covers 80% of use cases
- Examples: Task apps, CRMs, note apps

### Tier 2: CRDT Text Editing
- Collaborative text editing
- Uses `TextOperation` messages
- Fugue algorithm for maximal non-interleaving
- Examples: Collaborative editors, documentation

### Tier 3: Custom CRDTs
- Advanced data structures
- OR-Set, PN-Counter, Trees, Graphs
- Uses `CRDTOperation` wrapper
- Examples: Whiteboards, design tools

## Protocol Flow

### Initial Sync
```
Client                          Server
  |                               |
  |------ SyncRequest ----------->|
  |  (checkpoint, pending deltas) |
  |                               |
  |<----- SyncResponse -----------|
  |  (deltas, new checkpoint)     |
  |                               |
```

### Real-Time Updates
```
Client                          Server
  |                               |
  |------ SubscribeRequest ------>|
  |  (document_ids)               |
  |                               |
  |<----- SubscriptionConfirm ----|
  |  (current versions)           |
  |                               |
  |     [Document changes]        |
  |<----- SyncNotification -------|
  |  (delta)                      |
  |                               |
  |------ SyncAck --------------->|
  |  (new version)                |
  |                               |
```

### Authentication
```
Client                          Server
  |                               |
  |------ AuthRequest ----------->|
  |  (JWT/API key)                |
  |                               |
  |<----- AuthResponse -----------|
  |  (session_token, permissions) |
  |                               |
```

## Conflict Resolution

### Last-Write-Wins (LWW)
- Compare timestamps: `remote.timestamp > local.timestamp`
- Tie-breaking: `remote.client_id > local.client_id`
- Deterministic across all replicas

### CRDT Automatic Merge
- Text: Fugue algorithm (maximal non-interleaving)
- Sets: Observed-Remove semantics
- Counters: Positive/Negative split
- No manual conflict resolution needed

## Code Generation

### Rust (for core/)
```bash
# Install protoc compiler
cargo install protobuf-codegen

# Generate Rust code
protoc --rust_out=../core/src/protocol/generated \
  types.proto messages.proto sync.proto auth.proto
```

### TypeScript (for sdk/)
```bash
# Install protoc plugin
npm install -g protoc-gen-ts

# Generate TypeScript code
protoc --ts_out=../sdk/src/protocol/generated \
  types.proto messages.proto sync.proto auth.proto
```

### Python (for server/python/)
```bash
# Generate Python code
protoc --python_out=../server/python/src/protocol \
  types.proto messages.proto sync.proto auth.proto
```

### Go (for server/go/)
```bash
# Generate Go code
protoc --go_out=../server/go/src/protocol \
  types.proto messages.proto sync.proto auth.proto
```

## Versioning

Protocol uses semantic versioning:
- **Major version** (breaking changes): New `syntax` declaration
- **Minor version** (backward-compatible additions): New optional fields
- **Patch version** (bug fixes): Documentation updates

Current version: **v0.1.0** (Phase 1)

## Wire Format

Messages are encoded using Protocol Buffers binary format:
- Compact representation (5-10x smaller than JSON)
- Fast serialization/deserialization
- Language-agnostic
- Backward/forward compatible

### Compression
Optional gzip/Brotli compression over WebSocket:
- Enabled for messages >1KB
- 5-10x additional reduction
- Configurable threshold

## Security Considerations

1. **Authentication**: JWT tokens or API keys
2. **Authorization**: RBAC with document/field-level permissions
3. **Encryption**: TLS for WebSocket connections
4. **E2EE**: Optional end-to-end encryption (client-side)

## Testing

Protocol correctness verified through:
- TLA+ formal specifications (see `../tla/`)
- Property-based testing (1000+ concurrent operations)
- Integration tests (client ↔ server)
- Chaos engineering (network failures)

## References

- [Protocol Buffers Documentation](https://protobuf.dev/)
- [CRDT Overview](https://crdt.tech/)
- [Fugue Algorithm](https://arxiv.org/abs/2305.00583) - Maximal non-interleaving for text CRDTs
- [Vector Clocks](https://en.wikipedia.org/wiki/Vector_clock)

---

**Status:** Phase 1, Day 1 - Protocol specification complete  
**Next:** TLA+ formal verification of LWW merge algorithm
