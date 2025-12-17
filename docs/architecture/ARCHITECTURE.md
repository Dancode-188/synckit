# SyncKit System Architecture

**Version:** 0.2.0
**Status:** v0.2.0 Released - Production Ready
**Last Updated:** December 18, 2025

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Core Principles](#core-principles)
4. [Architecture Layers](#architecture-layers)
5. [Component Design](#component-design)
6. [Data Flow](#data-flow)
7. [Storage Architecture](#storage-architecture)
8. [Network Protocol](#network-protocol)
9. [Conflict Resolution](#conflict-resolution)
10. [Performance Characteristics](#performance-characteristics)
11. [Scalability](#scalability)
12. [Security Model](#security-model)

---

## Executive Summary

SyncKit is a **local-first sync engine** designed for modern web and mobile applications. It provides real-time data synchronization with automatic conflict resolution, offline support, and sub-100ms latency.

**Key Differentiators:**
- 🚀 **Performance**: <1ms local operations, <100ms sync (p95)
- 🔄 **Complete CRDT Suite**: Text (Fugue), Rich Text (Peritext), Counter (PN-Counter), Set (OR-Set), LWW Documents
- 📦 **Production Bundle**: 154KB gzipped (46KB lite) - Complete solution with all collaboration features
- 🌐 **Universal**: Works everywhere (browser, Node.js, mobile, desktop)
- 🔒 **Data Integrity**: Formally verified with TLA+ (zero data loss guarantee)
- 🧪 **Battle-Tested**: 1,081 passing tests, 87% coverage, 24-hour stress test

**Target Use Cases:**
- Collaborative applications (Google Docs-style)
- Offline-first mobile apps
- Real-time dashboards
- Multiplayer experiences
- Local-first tools

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT SIDE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │   React      │   │   Vue 3      │   │  Svelte 5    │  │
│  │   Hooks ✅   │   │Composables ✅│   │  Stores ✅   │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘  │
│         │                  │                  │           │
│         └──────────────────┴──────────────────┘           │
│                            │                               │
│                   ┌────────▼────────┐                      │
│                   │  TypeScript SDK │                      │
│                   │  (Developer API)│                      │
│                   └────────┬────────┘                      │
│                            │                               │
│         ┌──────────────────┼──────────────────┐           │
│         │                  │                  │           │
│    ┌────▼─────┐      ┌────▼─────┐      ┌────▼─────┐     │
│    │ Offline  │      │  Storage │      │   WASM   │     │
│    │  Queue   │      │  Adapter │      │   Core   │     │
│    └──────────┘      └──────────┘      └────┬─────┘     │
│                                              │           │
│                      ┌───────────────────────┘           │
│                      │                                   │
│              ┌───────▼────────┐                         │
│              │   Rust Core    │                         │
│              │  (Performance) │                         │
│              │                │                         │
│              │  • LWW Merge   │                         │
│              │  • VectorClock │                         │
│              │  • CRDT Logic  │                         │
│              │  • Protocol    │                         │
│              └───────┬────────┘                         │
│                      │                                   │
└──────────────────────┼───────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   WebSocket     │
              │   Connection    │
              └────────┬────────┘
                       │
┌──────────────────────┼───────────────────────────────────┐
│                      │        SERVER SIDE                │
├──────────────────────┼───────────────────────────────────┤
│              ┌───────▼────────┐                         │
│              │  WebSocket     │                         │
│              │   Handler      │                         │
│              └───────┬────────┘                         │
│                      │                                   │
│         ┌────────────┼────────────┐                     │
│         │            │            │                     │
│    ┌────▼─────┐ ┌───▼────┐ ┌────▼─────┐              │
│    │   Auth   │ │  Sync  │ │  Broad-  │              │
│    │ Manager  │ │ Coord  │ │  cast    │              │
│    └──────────┘ └───┬────┘ └──────────┘              │
│                     │                                   │
│              ┌──────▼──────┐                           │
│              │  PostgreSQL │                           │
│              │   + Redis   │                           │
│              └─────────────┘                           │
└───────────────────────────────────────────────────────────┘
```



---

## Core Principles

1. **Local-First**: All operations work offline, sync happens in background
2. **Performance as a Feature**: Sub-1ms local ops, sub-100ms sync target
3. **Three-Tier Complexity**: Simple for 80%, powerful for 20%
4. **Zero Data Loss**: Formally verified algorithms (TLA+ proof)
5. **Developer Experience**: 5-minute quick start, intuitive API

---

## Architecture Layers

### Layer 1: Rust Core (Performance-Critical)
**Location:** `core/src/`  
**Compiled to:** WASM (web), Native (mobile/desktop)

**Responsibilities:**
- Document structure and operations
- Vector clock causality tracking
- LWW merge algorithm
- CRDT implementations (OR-Set, PN-Counter, Text)
- Binary protocol encoding/decoding
- Delta computation

**Why Rust:**
- Memory safety without garbage collection
- Near-C performance (critical for sync operations)
- Compiles to WASM for web
- Strong type system prevents bugs

### Layer 2: TypeScript SDK (Developer-Facing)
**Location:** `sdk/src/`

**Responsibilities:**
- Simple, intuitive API wrapping Rust core
- Storage adapters (IndexedDB, Memory - v0.1.0; OPFS, SQLite planned for v0.2+)
- Offline operation queue with retry logic
- WebSocket connection management
- Framework integrations (React in v0.1.0; Vue, Svelte planned for v0.2+)

**Why TypeScript:**
- Native to web development
- Type safety for API consumers
- Easy framework integration
- Familiar to most developers

### Layer 3: Server (Multi-Language)
**Location:** `server/{typescript,python,go,rust}/`

**Responsibilities:**
- WebSocket endpoint for real-time sync
- Authentication and authorization (JWT + RBAC)
- Delta distribution to connected clients
- Persistence (PostgreSQL + Redis)
- Horizontal scaling coordination

**Multi-Language Support:**
- Reference implementation: TypeScript (Bun + Hono)
- Protocol-defined, any language can implement
- Choose based on existing stack

---

## Component Design

### Document Structure

```rust
// Core document representation
struct Document {
    id: DocumentID,
    fields: HashMap<FieldPath, Field>,
    version: VectorClock,
}

struct Field {
    value: Value,           // JSON-like value
    timestamp: Timestamp,   // Logical timestamp
    client_id: ClientID,    // For tie-breaking
}

struct VectorClock {
    clocks: HashMap<ClientID, u64>,
}
```

**Key Design Decisions:**
- Field-level granularity (not document-level) for fine-grained conflict resolution
- VectorClock tracks causality between operations
- Timestamp + ClientID tuple ensures deterministic conflict resolution
- HashMap for O(1) field access

### Vector Clock

```rust
impl VectorClock {
    // Increment local clock
    fn tick(&mut self, client_id: ClientID) {
        *self.clocks.entry(client_id).or_insert(0) += 1;
    }
    
    // Merge two clocks (take max of each entry)
    fn merge(&mut self, other: &VectorClock) {
        for (client, &clock) in &other.clocks {
            let entry = self.clocks.entry(*client).or_insert(0);
            *entry = (*entry).max(clock);
        }
    }
    
    // Compare clocks (happens-before relationship)
    fn compare(&self, other: &VectorClock) -> Ordering {
        // Returns: Less, Greater, or Concurrent
    }
}
```

**Properties (Verified by TLA+):**
- Monotonic: Clock values only increase
- Causal: If A → B, then clock(A) < clock(B)
- Transitive: If A → B and B → C, then A → C
- Concurrent detection: Neither A < B nor B < A

### LWW Merge Algorithm

```rust
fn lww_merge(local: &Field, remote: &Field) -> Field {
    if remote.timestamp > local.timestamp {
        remote.clone()
    } else if remote.timestamp == local.timestamp {
        // Deterministic tie-breaking
        if remote.client_id > local.client_id {
            remote.clone()
        } else {
            local.clone()
        }
    } else {
        local.clone()
    }
}
```

**Properties (Verified by TLA+):**
- Convergence: All replicas reach identical state
- Determinism: Same inputs always produce same output
- Idempotence: Applying operation twice has no additional effect
- Commutativity: Order of merges doesn't matter

---

## Data Flow

### Local Write Operation

```
User Action
    ↓
SDK API Call (doc.update({field: "value"}))
    ↓
Generate Timestamp (vector clock tick)
    ↓
Apply to Local State (immediate UI update)
    ↓
Add to Offline Queue
    ↓
Encode Delta (Protobuf)
    ↓
Send to Server (if online)
```

**Latency Target:** <1ms from API call to local state update

### Remote Update Reception

```
Server Push (WebSocket)
    ↓
Decode Delta (Protobuf)
    ↓
Validate Vector Clock (causality check)
    ↓
Merge with Local State (LWW algorithm)
    ↓
Update Storage (IndexedDB/SQLite)
    ↓
Notify Subscribers (React state update)
    ↓
UI Re-render
```

**Latency Target:** <100ms from server push to UI update (p95)

### Offline → Online Transition

```
Network Reconnects
    ↓
Load Pending Operations (from offline queue)
    ↓
Send Checkpoint + Pending Deltas
    ↓
Receive Server Deltas Since Checkpoint
    ↓
Merge All Deltas (LWW for each field)
    ↓
Update Local State
    ↓
Clear Offline Queue (operations now synced)
```

**Target:** <1 second reconnection time for 1000 pending operations

---

## Storage Architecture

### Client-Side Storage

**Browser (v0.1.0):**
```
Primary: IndexedDB
  ↓
ObjectStore: documents
  - key: DocumentID
  - value: Document (JSON)

ObjectStore: deltas (for offline queue)
  - key: OperationID
  - value: Delta (Binary encoded)

Fallback: Memory
  - In-memory storage for Node.js or when IndexedDB unavailable
  - Data lost on page reload
```

**Future Storage Options (v0.2+):**
```
OPFS (Origin Private File System):
  - Faster for large datasets (100K+ records)
  - Not yet available in all browsers

SQLite (Mobile/Desktop):
  - Native mobile/desktop apps
  - Table structure similar to IndexedDB
```

**Storage Schema Design:**
- Documents stored as complete snapshots (not event-sourced)
- Offline queue stores pending operations
- Vector clocks stored as JSON/TEXT for easy debugging
- No joins required (document-oriented, not relational)

### Server-Side Storage

**PostgreSQL Schema:**
```sql
-- Documents table
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,                    -- Document fields
    version JSONB NOT NULL,                 -- VectorClock
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_documents_updated_at ON documents(updated_at);

-- Deltas table (optional, for audit trail)
CREATE TABLE deltas (
    id SERIAL PRIMARY KEY,
    document_id TEXT REFERENCES documents(id),
    delta BYTEA NOT NULL,                   -- Protobuf encoded
    vector_clock JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Redis (for real-time coordination):**
```
Pub/Sub Channels:
  - document:{document_id} → push deltas to subscribers
  
Key-Value Store:
  - session:{session_id} → active connection metadata
  - checkpoint:{client_id}:{doc_id} → last synced version
```

**Why This Design:**
- PostgreSQL JSONB: Flexible schema, fast queries, relational benefits
- Redis Pub/Sub: Real-time delta distribution across servers
- No foreign keys (documents are independent)
- Horizontal scaling via sharding by document_id

---

## Network Protocol

### WebSocket Message Flow

**Initial Sync:**
```
Client                          Server
  |                               |
  |--- SyncRequest -------------→ |
  |    {                          |
  |      document_ids: ["doc1"]   |
  |      checkpoint: {            |
  |        "client1": 42,         |
  |        "client2": 15          |
  |      }                        |
  |    }                          |
  |                               |
  |←-- SyncResponse ------------- |
  |    {                          |
  |      deltas: [                |
  |        {field: "x", value...} |
  |      ],                       |
  |      new_checkpoint: {        |
  |        "client1": 50,         |
  |        "client2": 20          |
  |      }                        |
  |    }                          |
  |                               |
```

**Real-Time Updates:**
```
Client A                 Server                Client B
  |                        |                       |
  |--- Update (field1) -→  |                       |
  |                        |                       |
  |                        |--- Notification ---→ |
  |                        |    (field1 changed)  |
  |                        |                       |
  |←-- Ack (version) ----  |                       |
```

**Heartbeat (Keep-Alive):**
```
Client                          Server
  |                               |
  |--- Ping ------------------→  |
  |    (every 30 seconds)         |
  |                               |
  |←-- Pong -------------------- |
  |    (echo timestamp)           |
  |                               |
```

**Binary Protocol (Custom Format):**
- Header: [type: 1 byte][timestamp: 8 bytes][payload length: 4 bytes]
- Payload: JSON (considered Protobuf for v0.2+ for better compression)
- 13-byte header overhead, efficient for small messages
- Compression over WebSocket (gzip/Brotli)

**Connection Recovery:**
- Automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Resume from last checkpoint
- Pending operations buffered in offline queue

---

## Conflict Resolution

### Tier 1: Last-Write-Wins (LWW)

**Algorithm:**
```
For each field:
  1. Compare timestamps
  2. If equal, compare client IDs (tie-breaking)
  3. Winner's value becomes final
```

**Example:**
```
Initial State:
  field1: {value: "A", timestamp: 10, client: "c1"}

Client1 writes "B" at timestamp 15:
  field1: {value: "B", timestamp: 15, client: "c1"}
  
Client2 writes "C" at timestamp 12:
  field1: {value: "C", timestamp: 12, client: "c2"}
  
Merge:
  Compare timestamps: 15 > 12
  Winner: Client1's "B"
  
Final State:
  field1: {value: "B", timestamp: 15, client: "c1"}
```

**Characteristics:**
- Simple, deterministic
- Low overhead (just timestamp comparison)
- Data loss possible (concurrent updates, last wins)
- Perfect for: task apps, CRMs, metadata

### Tier 2: CRDT Text (YATA Algorithm)

**For collaborative text editing:**
```
Block-based structure:
  - Sequential insertions merged into blocks
  - O(1) append performance
  - O(log n) random insertion
  
Concurrent insertions:
  - Use unique IDs for each character
  - Deterministic ordering by ID
  - No interleaving issues (like Yjs)
```

**Example:**
```
User A types "hello"
User B types "world"

Result: "helloworld" or "worldhello" (deterministic based on IDs)
NOT: "hweolrllod" (no interleaving)
```

**Characteristics:**
- Automatic merge (no manual conflict resolution)
- Convergence guaranteed
- Higher memory overhead (CRDT metadata)
- Perfect for: collaborative editors, note apps

### Tier 3: Custom CRDTs

**OR-Set (Observed-Remove Set):**
```rust
struct ORSet<T> {
    elements: HashMap<T, HashSet<UniqueTag>>,
}

// Add element
fn add(&mut self, element: T) {
    self.elements.entry(element)
        .or_insert_with(HashSet::new)
        .insert(generate_unique_tag());
}

// Remove element
fn remove(&mut self, element: T) {
    // Remove all currently observed tags
    if let Some(tags) = self.elements.get(&element) {
        for tag in tags.clone() {
            self.elements.get_mut(&element).unwrap().remove(&tag);
        }
    }
}

// Query membership
fn contains(&self, element: &T) -> bool {
    self.elements.get(element)
        .map(|tags| !tags.is_empty())
        .unwrap_or(false)
}
```

**Characteristics:**
- Add-wins semantics (concurrent add/remove preserves add)
- No tombstone accumulation (tags are reused)
- Perfect for: tag lists, participant lists

---

## Performance Characteristics

### Latency Targets

| Operation | Target | p95 | p99 |
|-----------|--------|-----|-----|
| Local write | <1ms | 0.5ms | 1ms |
| Local read | <0.1ms | 0.05ms | 0.1ms |
| Remote sync | <100ms | 50ms | 100ms |
| Offline→Online | <1s | 500ms | 1s |
| Initial load | <100ms | 50ms | 100ms |

### Memory Targets

| Dataset Size | Memory Budget | Notes |
|--------------|---------------|-------|
| 100 documents | 1MB | Baseline |
| 1K documents | 5MB | Typical |
| 10K documents | 10MB | Large |
| 100K documents | 50MB | Very large (partial sync) |

### Bundle Size Targets

| Component | Size (gzipped) | Notes |
|-----------|----------------|-------|
| WASM Core (default) | 48KB | Full-featured with all CRDTs |
| WASM Core (lite) | 43KB | Local-only, LWW + vector clocks |
| TypeScript SDK | ~10KB | JavaScript wrapper |
| React Adapter | ~1KB | Hooks (included in SDK) |
| Total (default) | ~59KB | Production-ready (48KB WASM + 10KB JS) |
| Total (lite) | ~45KB | Size-critical apps (43KB WASM + 1.5KB JS) |

### Throughput Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Local operations/sec | 10,000+ | Sequential writes |
| Merge operations/sec | 1,000+ | Concurrent merges |
| Network messages/sec | 100+ | Per connection |
| Concurrent connections | 1,000+ | Per server instance |

### Benchmarking Strategy

**Continuous benchmarking:**
- Run on every commit (CI/CD)
- Compare against baseline
- Alert on regression >10%

**Key benchmarks:**
- LWW merge: 1M operations, measure latency
- Vector clock merge: 100 clients, measure convergence time
- Delta encoding: 10KB document, measure compression ratio
- WASM size: Track bundle size over time

---

## Scalability

### Horizontal Scaling (Server-Side)

**Architecture:**
```
Load Balancer (Sticky Sessions)
    ↓
┌─────────┬─────────┬─────────┐
│ Server1 │ Server2 │ Server3 │
└─────────┴─────────┴─────────┘
     ↓         ↓         ↓
   Redis Pub/Sub (message bus)
     ↓
PostgreSQL (primary + replicas)
```

**How It Works:**
1. Client connects to any server (load balanced)
2. Session affinity (sticky sessions) keeps client on same server
3. Server subscribes to Redis channels for relevant documents
4. When document changes, Redis broadcasts to all subscribed servers
5. Servers push updates to their connected clients

**Scaling Limits:**
- Single server: 1,000-10,000 concurrent connections
- Horizontal: Unlimited (add more servers)
- Database: Shard by document_id for >1M documents

### Client-Side Scaling

**Partial Sync (for large datasets):**
```
Instead of syncing ALL user data:
  1. Sync only visible/relevant documents
  2. Lazy load on demand
  3. Evict stale documents (LRU cache)
  4. Server filters by query (e.g., last 30 days)
```

**Memory Management:**
- Limit: 50MB max per client
- Eviction: LRU (Least Recently Used)
- Persistence: IndexedDB survives page reload
- Mobile: More aggressive eviction (10MB limit)

**Performance Optimization:**
- Web Workers: Run WASM in background thread (don't block UI)
- Batching: Group operations every 100ms
- Compression: Gzip deltas before sending
- Caching: Memoize computed values

---

## Security Model

### Authentication (Phase 1 Scope)

**JWT-Based:**
```
Client Login
    ↓
Server validates credentials
    ↓
Issues JWT (expires in 24h)
    ↓
Client includes JWT in WebSocket handshake
    ↓
Server validates JWT on every message
```

**Token Structure:**
```json
{
  "sub": "user_id",
  "exp": 1699999999,
  "permissions": {
    "doc1": "read-write",
    "doc2": "read-only"
  }
}
```

### Authorization (RBAC)

**Permission Levels:**
- `none`: No access
- `read`: Can sync, cannot write
- `write`: Can read and write
- `admin`: Can read, write, manage permissions

**Enforcement:**
```
Client writes to document
    ↓
Server checks JWT permissions
    ↓
If write permission: accept and broadcast
    ↓
If no permission: reject with 403
```

**Document-Level Permissions:**
- Each document has ACL (Access Control List)
- User can only sync documents they have access to
- Server filters deltas by permission

### End-to-End Encryption (Phase 2)

**Note:** E2EE is Phase 2+ feature. Phase 1 uses TLS only.

**Future E2EE Design (for reference):**
```
1. Generate symmetric key client-side (AES-256)
2. Encrypt document data before sync
3. Server stores encrypted blobs (zero-knowledge)
4. Share keys via asymmetric encryption (RSA)
5. Multi-device: Key distribution via QR code or recovery phrase
```

**Trade-offs with E2EE:**
- ✅ Zero-knowledge (server can't read data)
- ❌ Server-side search impossible
- ❌ Password reset requires recovery phrase
- ❌ Sharing requires key distribution

### Security Best Practices

**In Production:**
- TLS 1.3 for WebSocket connections
- HTTPS for all HTTP endpoints
- Rate limiting (100 requests/min per client)
- Input validation on all messages
- CORS configuration (whitelist origins)
- Content Security Policy (CSP)

**Monitoring:**
- Log authentication failures
- Alert on unusual activity (spikes in writes)
- Monitor for malformed messages (potential attacks)

---

## Summary

SyncKit's architecture is designed for **performance**, **correctness**, and **simplicity**:

✅ **Performance:** Rust core + WASM = sub-1ms local operations
✅ **Correctness:** TLA+ verification = zero data loss guarantee
✅ **Simplicity:** Three-tier approach = right tool for each job
✅ **Scalability:** Horizontal scaling + partial sync = millions of users
✅ **Security:** JWT + RBAC + TLS = production-ready security

**Implementation Status:** All core architecture components implemented and verified in v0.1.0, including cross-tab synchronization via BroadcastChannel API. Future enhancements (Vue/Svelte adapters, Protobuf protocol, OPFS/SQLite storage, Text/Counter/Set CRDT APIs) planned for subsequent releases. Note: CRDT implementations exist in Rust core but are not yet exposed in SDK API.
