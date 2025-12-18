# SyncKit Project Structure

This document explains the organization and purpose of each directory in the SyncKit monorepo.

---

## 📂 Top-Level Structure

```
synckit/
├── core/           # Rust core engine (performance-critical code)
├── sdk/            # TypeScript SDK (developer-facing API)
├── server/         # Multi-language server implementations
├── protocol/       # Protocol definitions and formal specs
├── examples/       # Example applications and demos
├── docs/           # Documentation (guides, API, architecture)
├── tests/          # Cross-cutting tests (integration, chaos, load)
└── scripts/        # Build and utility scripts
```

---

## 🦀 `core/` - Rust Core Engine

The heart of SyncKit. Written in Rust for performance, compiled to WASM for web and native for desktop/mobile.

```
core/
├── src/
│   ├── lib.rs                  # Main library entry point
│   ├── document.rs             # Document structure and operations
│   ├── error.rs                # Error types
│   ├── sync/                   # Synchronization algorithms
│   │   ├── mod.rs
│   │   ├── vector_clock.rs     # Vector clock for causality tracking
│   │   ├── lww.rs              # Last-Write-Wins merge
│   │   └── delta.rs            # Delta computation and sync
│   ├── crdt/                   # CRDT data structures
│   │   ├── mod.rs
│   │   ├── or_set.rs           # Observed-Remove Set
│   │   ├── pn_counter.rs       # Positive-Negative Counter
│   │   ├── fractional_index.rs # Fractional indexing
│   │   └── text/               # Text CRDT (YATA-based)
│   │       ├── mod.rs
│   │       ├── text.rs         # Main text CRDT implementation
│   │       ├── item.rs         # Text item structure
│   │       └── id.rs           # Unique identifiers
│   ├── protocol/               # Wire protocol (Protobuf)
│   │   ├── mod.rs
│   │   ├── delta.rs            # Delta protocol messages
│   │   ├── serialize.rs        # Serialization logic
│   │   ├── sync.rs             # Sync protocol
│   │   └── gen/                # Generated Protobuf code
│   ├── storage/                # Storage abstraction
│   │   └── mod.rs              # Storage interface
│   └── wasm/                   # WASM bindings
│       ├── mod.rs
│       ├── bindings.rs         # JavaScript bindings (wasm-bindgen)
│       └── utils.rs            # WASM utilities
├── tests/                      # Rust tests
│   └── property_tests.rs       # Property-based tests (PropTest)
├── benches/                    # Performance benchmarks (Criterion)
│   ├── lww_bench.rs
│   ├── vector_clock_bench.rs
│   └── delta_bench.rs
└── Cargo.toml                  # Rust package configuration
```

**Key Responsibilities:**
- ✅ Sync algorithms (LWW, vector clocks, delta computation)
- ✅ CRDT implementations (OR-Set, PN-Counter, Text)
- ✅ Binary protocol (Protobuf encoding/decoding)
- ✅ Performance-critical operations (<1ms local, <100ms sync)
- ✅ WASM compilation for web browsers

---

## 📦 `sdk/` - TypeScript SDK

Developer-facing API. Wraps the Rust core and provides framework integrations.

```
sdk/
├── src/
│   ├── index.ts                # Main SDK entry point (default variant)
│   ├── index-lite.ts           # Lite variant entry point
│   ├── synckit.ts              # Core SyncKit class (default)
│   ├── synckit-lite.ts         # Core SyncKit class (lite)
│   ├── document.ts             # Document API (LWW sync)
│   ├── wasm-loader.ts          # WASM module loading (default)
│   ├── wasm-loader-lite.ts     # WASM module loading (lite)
│   ├── types.ts                # TypeScript type definitions
│   ├── adapters/               # Framework adapters
│   │   └── react.tsx           # React hooks (useDocument)
│   └── storage/                # Storage adapters
│       ├── index.ts            # Storage exports
│       ├── indexeddb.ts        # IndexedDB implementation
│       └── memory.ts           # In-memory storage
├── wasm/                       # WASM distribution files
│   └── (WASM files copied here during build)
└── package.json                # NPM package configuration
```

**Key Responsibilities:**
- ✅ Simple, intuitive API (`sync.document()`)
- ✅ React integration (hooks: `useDocument`)
- ✅ Two optimized variants (default ~53KB, lite ~48KB gzipped)
- ✅ Storage adapters (IndexedDB, Memory)
- ✅ WASM module loading and management
- 🚧 Vue/Svelte adapters (v0.3.0+)
- 🚧 Text/Counter/Set CRDTs (future releases)

---

## 🖥️ `server/` - Multi-Language Servers

Reference server implementations in multiple languages. All implement the same Protobuf protocol.

```
server/
└── typescript/                 # TypeScript server (v0.1.0)
    ├── src/
    │   ├── index.ts            # Server entry point
    │   ├── config.ts           # Configuration
    │   ├── auth/               # Authentication
    │   ├── middleware/         # Hono middleware
    │   ├── routes/             # HTTP routes
    │   ├── services/           # Business logic
    │   ├── storage/            # Database layer (PostgreSQL)
    │   ├── sync/               # Sync coordination
    │   └── websocket/          # WebSocket handlers
    ├── tests/                  # Server tests (Bun)
    │   ├── unit/               # Unit tests
    │   ├── integration/        # Integration tests
    │   └── benchmarks/         # Performance benchmarks
    └── package.json            # Bun package config

Note: Python, Go, and Rust server implementations planned for future releases.
```

**Key Responsibilities:**
- ✅ WebSocket connection management
- ✅ Delta distribution to connected clients
- ✅ Authentication and authorization (JWT + RBAC)
- ✅ Database persistence (PostgreSQL, MongoDB)
- ✅ Redis pub/sub for multi-server coordination

---

## 📡 `protocol/` - Protocol Definitions

Protocol specifications and formal verification.

```
protocol/
├── specs/                      # Protobuf specifications
│   ├── types.proto             # Shared types (VectorClock, etc.)
│   ├── messages.proto          # Message formats
│   ├── sync.proto              # Core sync protocol
│   ├── auth.proto              # Authentication messages
│   └── README.md               # Protocol documentation
└── tla/                        # TLA+ formal specifications
    ├── lww_merge.tla           # LWW merge algorithm
    ├── lww_merge.cfg           # TLA+ config
    ├── vector_clock.tla        # Vector clock properties
    ├── vector_clock.cfg        # TLA+ config
    ├── convergence.tla         # Convergence proof
    ├── convergence.cfg         # TLA+ config
    └── README.md               # How to run TLA+ model checking
```

**Key Responsibilities:**
- ✅ Language-agnostic protocol definition
- ✅ Formal verification of algorithms
- ✅ Binary message format specification
- ✅ Contract between client and server

---

## 📚 `examples/` - Example Applications

Real-world examples demonstrating different tiers of SyncKit.

```
examples/
├── todo-app/                   # Complete CRUD example with offline support
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── types.ts
│   │   └── components/
│   └── package.json
├── collaborative-editor/       # Real-time text editing (skeleton)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── store.ts
│   │   ├── types.ts
│   │   └── components/
│   └── package.json
└── project-management/         # Production-grade example with shadcn/ui (skeleton)
    ├── src/
    │   ├── App.tsx
    │   ├── store.ts
    │   ├── types.ts
    │   ├── components/         # shadcn/ui components
    │   ├── hooks/              # Custom hooks
    │   └── lib/                # Utilities
    └── package.json
```

**Key Responsibilities:**
- ✅ Demonstrate best practices
- ✅ Onboarding new developers (copy-paste ready)
- ✅ Showcase different use cases
- ✅ Serve as integration tests

---

## 📖 `docs/` - Documentation

Comprehensive documentation for developers and users.

```
docs/
├── README.md                   # Documentation index
├── api/                        # API reference documentation
│   └── SDK_API.md              # Complete SDK API reference
├── architecture/               # System design documentation
│   └── ARCHITECTURE.md         # System architecture and design
└── guides/                     # User guides (8 comprehensive guides)
    ├── getting-started.md      # 5-minute quick start
    ├── choosing-variant.md     # Default vs Lite variant guide
    ├── offline-first.md        # Offline-first patterns
    ├── conflict-resolution.md  # Handling conflicts
    ├── performance.md          # Performance optimization
    ├── testing.md              # Testing guide
    ├── migration-from-firebase.md     # Firebase migration
    ├── migration-from-supabase.md     # Supabase migration
    └── migration-from-yjs.md          # Yjs/Automerge migration
```

**Key Responsibilities:**
- ✅ Complete API documentation
- ✅ Architecture explanations
- ✅ User guides and tutorials
- ✅ Migration guides from competitors

---

## 🧪 `tests/` - Cross-Cutting Tests

Tests that span multiple components (client + server).

```
tests/
├── integration/                # End-to-end integration tests (244 tests)
│   ├── config.ts               # Test configuration
│   ├── setup.ts                # Test setup
│   ├── framework.test.ts       # Framework tests
│   ├── helpers/                # Test helpers
│   ├── offline/                # Offline scenario tests
│   ├── storage/                # Storage tests
│   └── sync/                   # Sync protocol tests
├── chaos/                      # Chaos engineering tests (80 tests)
│   ├── chaos-helpers.ts        # Chaos testing utilities
│   ├── network-simulator.ts    # Network simulation
│   ├── convergence.test.ts     # Convergence verification
│   ├── disconnections.test.ts  # Disconnection scenarios
│   ├── latency.test.ts         # High latency simulation
│   ├── message-corruption.test.ts  # Message corruption
│   └── packet-loss.test.ts     # Packet loss simulation
├── load/                       # Load and performance tests (61 tests)
│   ├── burst-traffic.test.ts   # Burst traffic handling
│   ├── concurrent-clients.test.ts  # Concurrent operations
│   ├── high-frequency.test.ts  # High-frequency updates
│   ├── large-documents.test.ts # Large document handling
│   ├── profiling.test.ts       # Performance profiling
│   └── sustained-load.test.ts  # Sustained load testing
└── package.json                # Test suite configuration (Bun)
```

**Key Responsibilities:**
- ✅ Verify end-to-end functionality
- ✅ Test under adverse network conditions
- ✅ Ensure performance targets met
- ✅ Catch integration issues early

---

## 🛠️ `scripts/` - Build and Utility Scripts

Automation scripts for building WASM and verifying bundle sizes.

```
scripts/
├── build-wasm.sh               # Build WASM (lite or default variant)
└── check-sizes.sh              # Verify bundle sizes (gzipped vs uncompressed)
```

**Usage:**
- `./scripts/build-wasm.sh lite` - Build lite variant (46KB)
- `./scripts/build-wasm.sh default` - Build default variant (154KB)
- `./scripts/check-sizes.sh` - Report actual bundle sizes for documentation
- `npm run build` - Build SDK
- `npm test` - Run all tests (SDK + core + server)

**Key Responsibilities:**
- ✅ Build optimized WASM with wasm-opt
- ✅ Support both lite and default variants
- ✅ Verify bundle sizes match documentation claims

---

## 🔗 Dependency Flow

```
┌─────────────────┐
│   Examples      │ (use SDK + Server)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│      SDK        │ (wraps Rust Core)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Rust Core     │ (implements Protocol)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Protocol      │ (defines contract)
└─────────────────┘
         ▲
         │
┌────────┴────────┐
│    Server(s)    │ (implements Protocol)
└─────────────────┘
```

**Key Insight:** Protocol is the source of truth. Both client and server implement it independently.

---

## 📦 Build Artifacts

After building, you'll have:

```
# Build outputs are .gitignored, but after building you'll have:

core/pkg/                       # WASM build output
├── synckit_core_bg.wasm        # WASM binary (~49KB gzipped)
├── synckit_core_bg.wasm.gz     # Gzipped WASM
├── synckit_core.js             # JS bindings
└── synckit_core.d.ts           # TypeScript types

sdk/dist/                       # SDK build output
├── index.js/mjs/d.ts           # Main entry (default variant)
├── index-lite.js/mjs/d.ts      # Main entry (lite variant)
└── adapters/
    └── react.js/mjs/d.ts       # React hooks

sdk/wasm/                       # WASM files copied during build
└── (WASM distribution files)

Note: Build artifacts (pkg-*, dist/, target/) are not tracked in git.
```

---

## 🚀 Getting Started

To start developing:

```bash
# 1. Install dependencies
npm install

# 2. Install server dependencies (not a workspace)
cd server/typescript && bun install && cd ../..

# 3. Build WASM (optional - pre-built WASM included)
# Only needed if modifying Rust code
./scripts/build-wasm.sh default  # or "lite" for lite variant

# 4. Build SDK
npm run build

# 5. Run all tests
npm test

# 6. Start development server
cd server/typescript && bun run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed setup instructions.

---

## 📝 Notes

**Monorepo Management:**
- We use a monorepo for easier cross-component development
- Rust workspace for core + WASM
- NPM workspaces for TypeScript packages
- Independent versioning per package

**Why This Structure?**
- ✅ Clear separation of concerns
- ✅ Easy to navigate and understand
- ✅ Supports multi-language development
- ✅ Independent testing per component
- ✅ Scalable as project grows

---

**Questions about the structure?** See [ROADMAP.md](ROADMAP.md) for implementation timeline or reach out in discussions!