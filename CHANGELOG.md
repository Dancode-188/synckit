# Changelog

All notable changes to SyncKit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### In Progress
- 🚧 Python server implementation
- 🚧 Go server implementation
- 🚧 Rust server implementation
- 🚧 Advanced storage adapters (OPFS, SQLite)

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

- **v0.1.0:** Initial production release with network sync and cross-tab sync (current - 2025-11-26)
- **v0.2.x:** Text CRDT and custom CRDTs in TypeScript SDK, BroadcastChannel-based cross-tab sync
- **v0.3.x:** Multi-language servers (Python, Go, Rust)
- **v0.4.x:** Vue & Svelte adapters
- **v0.5.x:** Advanced storage (OPFS, SQLite)
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

**What's coming in v0.2+:**
- 🚧 Text CRDT exposed in TypeScript SDK
- 🚧 Custom CRDTs (Counter, Set) exposed in TypeScript SDK
- 🚧 BroadcastChannel-based cross-tab sync (direct client-to-client)
- 🚧 Multi-language servers (Python, Go, Rust)
- 🚧 Vue & Svelte adapters
- 🚧 Advanced storage adapters (OPFS, SQLite)

---

<div align="center">

**[View Full Roadmap](ROADMAP.md)** • **[Get Started](docs/guides/getting-started.md)** • **[Report Issues](https://github.com/Dancode-188/synckit/issues)**

</div>
