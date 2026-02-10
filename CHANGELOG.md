# Changelog

All notable changes to SyncKit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### In Progress
- 🚧 Rust server implementation
- 🚧 SQLite storage adapter

---

## [0.3.0] - 2026-02-06

**Production-Ready Multi-Language Servers!**

This release brings full server parity across TypeScript, Python, Go, and C#, with comprehensive security hardening, OPFS storage, and a benchmark suite for cross-server performance comparison.

### Added

#### Multi-Language Servers

- **🐍 Python Server** - Production-ready FastAPI implementation
  - Full WebSocket sync protocol support
  - JWT authentication with RBAC (canRead/canWrite/isAdmin)
  - PostgreSQL storage adapter with asyncpg
  - Redis pub/sub for multi-server coordination
  - Rate limiting and security middleware
  - Periodic awareness cleanup (30-second timeout)
  - Comprehensive test suite

- **🐹 Go Server** - High-performance implementation
  - Gorilla WebSocket with efficient connection handling
  - JWT validation using golang-jwt/v5
  - PostgreSQL storage via pgx/v5
  - Redis pub/sub via go-redis/v9
  - Connection and message rate limiting
  - WebSocket origin validation
  - UNSUBSCRIBE handler for protocol completeness
  - Periodic awareness cleanup to prevent memory leaks
  - Comprehensive test suite (51 tests)

- **🔷 C# Server** - ASP.NET Core implementation (community-contributed by @matthewcorven)
  - Full binary WebSocket protocol support with JSON and binary modes
  - JWT authentication with RBAC (canRead/canWrite/isAdmin)
  - PostgreSQL storage adapter
  - Redis pub/sub for multi-server coordination
  - Rate limiting, CORS, and security header middleware
  - Awareness subsystem with Redis store and TTL cleanup
  - ACK tracking with configurable retries
  - Delta batching service with per-document coalescing
  - Comprehensive test suite (711 tests)

#### Storage

- **💾 OPFS Storage Adapter** - Origin Private File System for browsers
  - 4-30x faster writes than IndexedDB (benchmark verified)
  - 3-6x faster reads than IndexedDB
  - Automatic fallback to IndexedDB for Safari/unsupported browsers
  - Multi-tab coordination via SharedWorker

#### Benchmark Suite

- **📊 Cross-Server Benchmarks** (`benchmarks/`)
  - Server performance comparison (throughput, latency, connections)
  - Memory leak detection with severity classification
  - Sync latency scenarios (single client, multi-client, large docs, burst)
  - CLI runner with quick and full modes
  - Documented methodology and results

#### SDK & Sync

- **📸 Snapshot API** - Document state snapshots with automatic scheduling
  - `doc.createSnapshot()` and `doc.restoreSnapshot()` APIs
  - Automatic snapshot scheduling with configurable intervals
  - Server-side snapshot persistence in PostgreSQL
  - Comprehensive test coverage (850+ lines of tests)

- **🔄 SyncText Persistence** - Fugue CRDT text state persistence
  - Server-side storage for collaborative text documents
  - Automatic state restoration on reconnection
  - Cross-session text synchronization

- **🏠 Rooms API** - `/rooms` endpoint for room management
  - List active rooms with participant counts
  - Per-connection rate limiting

#### Demo Improvements (LocalWrite)

- **✍️ Enhanced Collaborative Editor**
  - Typing indicators for live collaboration
  - Milestone celebrations with confetti
  - Contribution stats dashboard
  - Emoji reactions for text selections
  - Time-lapse replay for document creation
  - Onboarding hints for new visitors
  - Word Wall with live voting and tag cloud

### Security

- **🔒 Security Hardening** - Critical vulnerability fixes
  - SQL injection prevention in cleanup queries (PostgreSQL `make_interval()`)
  - JWT secret enforcement in production (32+ characters required)
  - Anonymous authentication rejection by default
  - Server-only message types removed from client validation
  - Proper auth/authz checks on all protected operations
  - Rate limiting enforcement on all servers
  - WebSocket origin validation (Go server)

### Changed

- **TypeScript Server** - Security and performance improvements
  - JWT secret validation in production mode
  - Parameterized SQL queries for cleanup operations
  - Enhanced rate limiting checks

### Fixed

- **🔧 Concurrent Edit Divergence** - Split-to-match merge algorithm (#72)
  - Fixed text divergence when multiple users edit simultaneously
  - Implemented split-to-match merge in Rust Fugue CRDT
  - Ensures eventual consistency across all clients

- **🔧 Bidirectional Real-Time Sync** - CRDT text editing fixes (#67, #68)
  - Fixed one-way sync issues with server-authoritative values
  - Resolved ContentEditable remote update handling
  - Improved cursor stability and new block focus

- **🔧 Delta Batch Message Loss** - Infrastructure fix (#66)
  - Fixed delta_batch messages being dropped on deployed infrastructure
  - Improved WebSocket message handling reliability
  - Enhanced connection error recovery

- **🔧 Server Memory Leaks** - 4 leaks plugged (#56)
  - Fixed connection cleanup in sync coordinator
  - Proper awareness state cleanup on disconnect
  - Subscription map memory management

- **🔧 SDK Awareness Warning** - Downgraded to debug level
  - Reduced noise for unregistered document awareness updates
  - Cleaner console output in production

- **🐛 Test Suite Stability** - Fixed 30 flaky tests in load and chaos suites
  - Increased timeouts for convergence tests
  - Better cleanup between test runs
  - Stabilized concurrent client tests

### Documentation

- **📚 Benchmark Documentation** (`docs/benchmarks/`)
  - `methodology.md` - How benchmarks are conducted
  - `server-results.md` - Performance comparison across servers

### Performance

- **🦀 Rust Core Optimizations** (#69)
  - Improved Fugue CRDT text operations performance
  - Optimized split-to-match merge algorithm
  - Reduced memory allocations in text operations

- **Server Comparison** (50 concurrent clients, 60-second test):
  - Go: ~1,200 ops/sec, p95 ~12ms
  - TypeScript: ~800 ops/sec, p95 ~18ms
  - Python: ~600 ops/sec, p95 ~25ms
  - All servers: No memory leaks detected

- **OPFS vs IndexedDB**:
  - Write (small docs): 30x faster
  - Write (large docs): 5x faster
  - Read: 6x faster
  - Delete: 28x faster

### Migration from v0.2.x

All v0.2.x APIs remain compatible. New multi-language servers are drop-in replacements:

```bash
# TypeScript (existing)
cd server/typescript && bun run start

# Python (new)
cd server/python && uvicorn src.synckit_server.main:app

# Go (new)
cd server/go && go run cmd/server/main.go
```

All servers use the same binary protocol and are interchangeable.

---

## [0.2.3] - 2025-12-30

**Critical bug fix for VERSION export! 🐛**

### Fixed

- **🔧 VERSION Export Bug** - Fixed incorrect VERSION constant exports
  - `sdk/src/index.ts` now exports `'0.2.3'` instead of `'0.1.0-alpha.1'`
  - `sdk/src/index-lite.ts` now exports `'0.2.3-lite'` instead of `'0.1.0-alpha.1-lite'`
  - This bug caused debug logs and version checks to report incorrect version
  - All users should upgrade to ensure accurate version reporting

### Notes

- No API changes or breaking changes
- Safe to upgrade from any 0.2.x version

---

## [0.2.2] - 2025-12-19

**Production-ready demo and cross-tab sync improvements! 🎉**

### Added

- **⚡ Live Demo** - Production-ready collaborative editor deployed at https://synckit-demo.netlify.app
  - Room isolation with unique URL hash-based room IDs
  - Real-time cross-tab synchronization demonstration
  - Copy-paste ready for CodeSandbox deployment
- **📚 Research Credits** - Comprehensive acknowledgments for Fugue, Peritext, Loro, and Ink & Switch research
- **📦 Rust Crate README** - Added README for synckit-core crate (now visible on crates.io)

### Fixed

- **🔄 Cross-Tab Sync for text()** - Added missing CrossTabSync instance to `text()` method (previously only `richText()` had it)
  - Real-time synchronization between browser tabs now works for all document types
  - Uses BroadcastChannel for instant local sync without network latency
- **📝 Documentation Accuracy** - Updated demo messaging for technical accuracy
  - Changed "peer-to-peer" to "local-first architecture" (demo uses BroadcastChannel, not WebRTC)
  - Clarified cross-tab sync is same-browser only (not cross-device)

### Documentation

- Added live demo link to main README
- Removed outdated "coming soon" text for demo
- Updated demo text for technical accuracy (local-first vs P2P)

---

## [0.2.1] - 2025-12-19

**Critical bug fix for lz-string compression**

### Fixed

- **📦 lz-string Import Error** - Fixed module loading errors in browser environments
  - Changed from named exports to default export: `import LZString from 'lz-string'`
  - Updated compress/decompress calls to use `LZString.compress()` and `LZString.decompress()`
  - Resolves `SyntaxError: does not provide an export named 'compress'` in Vite/browser builds

---

## [0.2.0] - 2025-12-18

**Complete local-first collaboration platform! 🚀**

This release transforms SyncKit from a simple sync engine into a production-ready collaboration platform with rich text editing, undo/redo, live cursors, and framework adapters for React, Vue, and Svelte.

### 🎯 Status: Production Core, Beta Features

**Production Ready:**
- Document synchronization and CRDT text editing
- Offline-first architecture with conflict-free merging
- Rich text formatting with Peritext
- WebSocket sync protocol

**Public Beta:**
- React/Vue/Svelte framework adapters
- Cross-tab synchronization
- Awareness and real-time presence
- Editor integrations (Quill)

### Added

#### Text Editing & Collaboration
- **✍️ Rich Text Editing (Peritext)** - Proper formatting conflict resolution for bold, italic, links, and block-level attributes
- **🔁 Undo/Redo Manager** - Cross-tab undo/redo that syncs across sessions with 500ms operation merging
- **👥 Awareness & Presence** - Real-time user tracking with ephemeral state management
- **🖱️ Cursor Sharing** - Live cursor positions with smooth animations and teammate tracking
- **🔢 Custom CRDTs** - PN-Counter (increment/decrement) and OR-Set (add/remove) now exposed in TypeScript SDK
- **🎨 Text CRDT (Fugue)** - Collaborative text editing with conflict-free convergence, now accessible from TypeScript

#### Framework Integration
- **⚛️ React Hooks** - Complete hook library: `useSyncText`, `useRichText`, `useCursor`, `usePresence`, `useOthers`, `useUndo`
- **🟢 Vue 3 Composables** - Idiomatic Composition API integration with reactive state management
- **🔶 Svelte 5 Stores** - Reactive stores with runes support for Svelte 5

#### Core Improvements
- **🔄 Cross-Tab Sync** - BroadcastChannel-based synchronization for same-browser tab-to-tab collaboration
- **📦 Optimized Bundles** - 154KB gzipped (complete) or 46KB (lite variant)
- **🎯 Quill Integration** - First-class support for Quill editor with `QuillBinding`

### Changed

- **Bundle Size:** Increased from 59KB to 154KB gzipped for default variant (2.6x increase for 7+ major features)
  - Added: Rich text CRDT, Undo/Redo, Awareness, Cursors, Framework adapters, Cross-tab sync
  - Lite variant remains at 46KB for size-critical applications
- **Test Suite:** Expanded from 700+ to 1,081+ tests (100% passing, 87% code coverage)
- **Framework Adapters:** Separated into individual bundles (+6KB each) - import only what you need

### Fixed

- **Infinite re-render bug** in usePresence hook - Removed problematic dependency causing render loops
- **Cross-tab awareness** - Fixed awareness updates not broadcasting to other browser tabs
- **Cross-tab formatting** - Rich text formatting now syncs correctly across tabs

### Performance

- **Local Operations:** <1ms (same as v0.1.0)
- **Network Sync:** 10-50ms p95 (unchanged)
- **Bundle Size:** 154KB gzipped total (10KB JS + 144KB WASM, default variant), 46KB gzipped (lite variant)
- **Memory Usage:** ~3MB for 10K documents (stable under 24-hour load testing)
- **Test Suite:** 1,081+ comprehensive tests across TypeScript and Rust (100% pass rate)

### Examples

- **Collaborative Editor** - Real-time text editing with Quill, live cursors, presence, and undo/redo
- New components: `Cursor.tsx`, `UndoRedoToolbar.tsx`, `ParticipantList.tsx`
- Enhanced with cross-tab synchronization demonstration

### Documentation

- Updated API documentation for Rich Text, Undo/Redo, Cursor Sharing
- Added framework adapter guides (React, Vue, Svelte)
- Enhanced guides for cursor sharing and rich text editing
- Updated bundle size documentation with optimization strategies

### Migration from v0.1.0

All v0.1.0 APIs remain compatible. New features are additive:

```typescript
// v0.1.0 code still works
const doc = sync.document<Todo>('todo-1')
await doc.update({ completed: true })

// v0.2.0 adds new capabilities
const text = sync.richText('doc-1')
await text.format(0, 5, { bold: true })

const [presence, setPresence] = usePresence('doc-1', { name: 'Alice' })
```

---

## [0.1.1] - 2025-12-03

**Test coverage improvements and SDK bug fixes**

### Fixed
- **SDK Tests:** Fixed document initialization and integration test failures in TypeScript SDK (PR #10 by @matthewcorven)
  - Resolved async initialization race conditions
  - Fixed integration test suite to properly wait for document initialization
  - Improved test reliability and determinism

### Added
- **Binary Protocol Tests:** Added comprehensive test coverage for production WebSocket binary protocol (7 new tests)
  - Binary protocol integration tests covering all message types
  - Server binary message parsing verification tests
  - Binary encoding/decoding unit tests
  - Validates production protocol used by SDK clients

### Changed
- **Test Infrastructure:** Enhanced test suite to use binary protocol adapters across all test suites
  - All integration tests now use BinaryAdapter (matches production SDK behavior)
  - Load tests updated for binary protocol (73 tests)
  - Chaos tests updated for binary protocol (86 tests)
  - **Total test count:** 410 tests with 100% pass rate ✅ (up from 385 tests)
  - Improved test realism - tests now verify actual production code paths

### Documentation
- Updated test coverage documentation (tests/README.md, ROADMAP.md)
- Test count updated from 385 to 410 tests
- Added binary protocol test category to documentation

### Contributors
- @matthewcorven - SDK test fixes and improvements

---

## [0.1.0] - 2025-11-26

**First production-ready release! 🎉**

This release brings SyncKit from concept to production-ready sync engine with comprehensive testing, documentation, and real-world examples.

### Added

#### Core Engine
- **LWW Sync Algorithm** - Last-Write-Wins merge with field-level granularity
- **Text CRDT** - YATA-based collaborative text editing (in Rust core)
- **Custom CRDTs** - PN-Counter and OR-Set implementations (in Rust core)
- **Binary Protocol** - Custom binary format with efficient encoding (1B type + 8B timestamp + 4B length + JSON payload)
- **Vector Clocks** - Causality tracking for distributed operations
- **Delta Computation** - Efficient delta-based synchronization
- **WASM Compilation** - Optimized WASM bundles (49KB default, 44KB lite variant gzipped)
- **Formal Verification** - TLA+ proofs for LWW, vector clocks, convergence (118,711 states verified)

#### TypeScript SDK
- **Document API** - Simple object sync with `sync.document<T>()`
- **Storage Adapters** - IndexedDB (default), Memory, and abstract adapter interface
- **Network Sync** - WebSocket client with auto-reconnect and exponential backoff
- **Offline Queue** - Persistent operation queue with retry logic (47,000 ops/sec)
- **Network Monitoring** - Connection state, queue status, and sync state tracking
- **React Integration** - `useSyncDocument`, `useSyncField`, `useSyncDocumentList`, `useNetworkStatus`, `useSyncState`, `useSyncKit` hooks
- **TypeScript Support** - Full type safety with generics and strict mode
- **Two Optimized Variants** - Default (~59KB total) and Lite (~45KB total) gzipped

**Note:** v0.1.0 includes full network sync capabilities with WebSocket server, offline queue, and auto-reconnection. Text CRDT and custom CRDTs (Counter, Set) are available in the Rust core but not yet exposed in the TypeScript SDK - coming in future releases.

#### Server (TypeScript)
- **WebSocket Server** - Bun + Hono production-ready server with binary protocol
- **JWT Authentication** - Secure token-based auth with configurable expiration
- **RBAC Permissions** - Role-based access control with document-level ACLs
- **PostgreSQL Storage** - Persistent document storage with JSONB fields
- **Redis Pub/Sub** - Multi-server coordination for horizontal scaling
- **Health Monitoring** - Health checks, metrics, and graceful shutdown
- **Docker Support** - Production-ready Docker and Docker Compose configuration
- **Deployment Guides** - Fly.io, Railway, and Kubernetes deployment instructions

#### Network Layer
- **WebSocket Client** - Binary message protocol with efficient encoding (1B type + 8B timestamp + payload)
- **Auto-Reconnection** - Exponential backoff (1s → 30s max, 1.5x multiplier)
- **Heartbeat/Ping-Pong** - Keep-alive mechanism (30s interval, 5s timeout)
- **Message Queue** - 1000 operation capacity with overflow handling
- **State Management** - Connection state tracking (disconnected/connecting/connected/reconnecting/failed)
- **Authentication Support** - Token provider integration for secure connections
- **Offline Queue** - Persistent storage with FIFO replay and retry logic
- **Network State Tracker** - Online/offline detection using Navigator API

#### Testing Infrastructure
- **Unit Tests** - Comprehensive unit test coverage across all components
- **Integration Tests** - Multi-client sync, offline scenarios, conflict resolution
- **Network Tests** - WebSocket protocol, reconnection, heartbeat, message encoding
- **Chaos Tests** - Network failures, convergence verification, partition healing
- **Property-Based Tests** - Formal verification of CRDT properties with fast-check
- **E2E Tests** - Multi-client testing with Playwright
- **Performance Benchmarks** - Operation latency, throughput, memory profiling
- **700+ Tests** - Comprehensive test suite across TypeScript and Rust (100% SDK pass rate)

#### Documentation
- **User Guides** (8 comprehensive guides)
  - Getting Started (5-minute quick start with working code)
  - Offline-First Patterns (IndexedDB foundations, sync strategies)
  - Conflict Resolution (LWW strategy, field-level resolution)
  - Performance Optimization (bundle size, memory, Web Workers)
  - Testing Guide (property-based tests, chaos engineering, E2E)
- **Migration Guides** (3 detailed guides)
  - From Firebase/Firestore (escape vendor lock-in, add offline support)
  - From Supabase (add true offline functionality)
  - From Yjs/Automerge (simplify stack, reduce complexity)
- **API Reference** - Complete SDK API documentation
  - SDK API (Core document operations, storage, configuration)
  - Network API (WebSocket, offline queue, connection monitoring)
- **Architecture Docs** - System design, protocol specification, storage schema
- **Deployment Guide** - Production deployment with health checks and monitoring

#### Examples
- **Todo App** - Complete CRUD example with offline support and real-time sync
- **Collaborative Editor** - Real-time text editing with CodeMirror 6 and presence
- **Project Management App** - Production-grade kanban board with drag-and-drop, task management, and team collaboration using shadcn/ui

### Performance

- **Local Operations:** <1ms (0.005ms message encoding, 0.021ms queue operations)
- **Network Sync:** 10-50ms p95 (network dependent, auto-reconnect on failure)
- **Bundle Size:** 59KB gzipped total (10KB JS + 49KB WASM, default variant), 45KB gzipped total (1.5KB JS + 44KB WASM, lite variant)
- **Memory Usage:** ~3MB for 10K documents
- **Queue Throughput:** 47,000 operations/sec (offline queue with persistence)
- **Test Suite:** 700+ comprehensive tests across TypeScript and Rust (100% SDK pass rate)

### Quality & Verification

- **Formal Verification:** TLA+ proofs verified 118,711 states (LWW, vector clocks, convergence)
- **Bug Fixes:** 3 edge case bugs discovered and fixed through formal verification
- **Test Suite:** 700+ tests across unit, integration, network, and chaos (100% SDK pass rate)
- **Code Quality:** Full TypeScript strict mode, Rust clippy clean, no warnings
- **Documentation:** 8 comprehensive guides, complete API reference with examples
- **Production Ready:** Docker support, deployment guides, health monitoring

### Network Features (v0.1.0)

This release includes **full network synchronization capabilities**:

- ✅ WebSocket client with binary protocol
- ✅ Auto-reconnection with exponential backoff
- ✅ Offline operation queue with persistence
- ✅ Network status monitoring (`getNetworkStatus`, `onNetworkStatusChange`)
- ✅ Document sync state tracking (`getSyncState`, `onSyncStateChange`)
- ✅ React hooks for network status (`useNetworkStatus`, `useSyncState`)
- ✅ Server-side WebSocket handler with JWT authentication
- ✅ PostgreSQL persistence with JSONB storage
- ✅ Redis pub/sub for multi-server coordination
- ✅ Cross-tab synchronization (server-mediated sync with operation buffering)

### Known Limitations

- **Text CRDT** available in Rust core but not exposed in TypeScript SDK
- **Custom CRDTs** (Counter, Set) available in Rust core but not exposed in TypeScript SDK
- **Vue and Svelte** adapters planned for v0.2+
- **BroadcastChannel-based cross-tab sync** (direct client-to-client) planned for v0.2+

---

## Release Philosophy

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality
- **PATCH** version for backwards-compatible bug fixes

### Release Cadence

- **v0.1.0:** Initial production release with network sync and cross-tab sync (2025-11-26)
- **v0.2.x:** Text CRDT and custom CRDTs in TypeScript SDK, BroadcastChannel-based cross-tab sync
- **v0.3.0:** Multi-language servers (Python, Go), OPFS storage, benchmark suite (current - 2026-02-06)
- **v0.4.x:** SQL sync, advanced RBAC
- **v0.5.x:** SQLite storage, native mobile SDKs
- **v1.0.0:** Stable API, production-ready for enterprise

### Breaking Changes

Breaking changes will be:
- ⚠️ Clearly marked with **BREAKING** in changelog
- 📢 Announced in release notes
- 🔄 Documented with migration guide
- ⏰ Deprecated for at least one minor version before removal

### Security Updates

Security vulnerabilities will be:
- 🚨 Patched immediately in all supported versions
- 📧 Announced via security advisory
- 🔒 Listed in **Security** section of changelog

---

## Upgrade Guide

### From Pre-Release to v0.1.0

If you were using SyncKit during development (Phases 1-9):

```typescript
// No breaking changes! API is stable
import { SyncKit } from '@synckit-js/sdk'

const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'my-app',
  serverUrl: 'ws://localhost:8080'  // Optional - enables network sync
})

await sync.init()

const doc = sync.document<Todo>('todo-1')
await doc.init()
await doc.update({ completed: true })

// Monitor network status
const status = sync.getNetworkStatus()
console.log(status?.queueSize)

// Use React hooks
import { useSyncDocument, useNetworkStatus } from '@synckit-js/sdk'

function MyComponent() {
  const [todo, { update }] = useSyncDocument<Todo>('todo-1')
  const networkStatus = useNetworkStatus()

  return <div>{todo.text}</div>
}
```

### Future Upgrades

Migration guides will be provided for all breaking changes in future versions.

---

## Support

### Supported Versions

| Version | Supported          | End of Life |
|---------|--------------------|-------------|
| 0.3.x   | ✅ Yes (current)   | TBD         |
| 0.2.x   | ✅ Yes             | TBD         |
| 0.1.x   | ✅ Yes             | TBD         |
| Pre-0.1 | ❌ No (development) | 2025-11-26  |

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Instead, email: [danbitengo@gmail.com](mailto:danbitengo@gmail.com)

Include:
- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We'll respond within 48 hours.

---

## Links

- **[Roadmap](ROADMAP.md)** - Development timeline and future features
- **[Contributing](CONTRIBUTING.md)** - How to contribute to SyncKit
- **[License](LICENSE)** - MIT License
- **[GitHub Releases](https://github.com/Dancode-188/synckit/releases)** - Download releases
- **[Documentation](docs/README.md)** - Complete documentation
- **[Examples](examples/)** - Working example applications

---

## Contributors

Special thanks to all contributors who helped make SyncKit possible!

See [AUTHORS](AUTHORS.md) file for complete list.

---

## Notes

### Version 0.1.0 Release (2025-11-26)

This is the **first production-ready release** of SyncKit. We've spent significant effort on:

- 🧪 **Testing:** 700+ comprehensive tests across TypeScript and Rust (100% SDK pass rate)
- 📚 **Documentation:** 8 guides, complete API reference, migration guides
- ✅ **Formal Verification:** TLA+ proofs with 118K states explored
- 🏗️ **Architecture:** Clean, extensible, production-ready design
- 🚀 **Performance:** Sub-millisecond local operations, 47K queue ops/sec
- 🌐 **Network Sync:** Full WebSocket implementation with offline queue

**What's production-ready in v0.1.0:**
- ✅ Core sync engine (Rust + WASM with LWW merge)
- ✅ TypeScript SDK with React integration
- ✅ Network sync (WebSocket, offline queue, auto-reconnect)
- ✅ Cross-tab synchronization (server-mediated with operation buffering)
- ✅ TypeScript server with PostgreSQL + Redis
- ✅ JWT authentication with RBAC
- ✅ Offline-first with persistent storage
- ✅ Conflict resolution (Last-Write-Wins)
- ✅ Complete example applications

**Delivered in v0.2.0:**
- ✅ Text CRDT exposed in TypeScript SDK
- ✅ Custom CRDTs (Counter, Set) exposed in TypeScript SDK
- ✅ BroadcastChannel-based cross-tab sync

**Delivered in v0.3.0:**
- ✅ Multi-language servers (Python, Go)
- ✅ OPFS storage adapter
- ✅ Benchmark suite

**Coming in v0.4+:**
- 🚧 Rust server implementation
- 🚧 SQLite storage adapter
- 🚧 SQL sync

---

<div align="center">

**[View Full Roadmap](ROADMAP.md)** • **[Get Started](docs/guides/getting-started.md)** • **[Report Issues](https://github.com/Dancode-188/synckit/issues)**

</div>
