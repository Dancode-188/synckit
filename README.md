# SyncKit

<div align="center">

**True offline-first sync for modern apps—without vendor lock-in**

[![npm version](https://badge.fury.io/js/%40synckit-js%2Fsdk.svg)](https://www.npmjs.com/package/@synckit-js/sdk)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Dancode-188/synckit/ci.yml?branch=main)](https://github.com/Dancode-188/synckit/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bundle Size](https://img.shields.io/badge/bundle%20size-~59KB%20(~45KB%20lite)-brightgreen)](https://bundlephobia.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Getting Started](docs/guides/getting-started.md) • [Documentation](docs/README.md) • [Examples](examples/) • [Discussions](https://github.com/Dancode-188/synckit/discussions) • [Roadmap](ROADMAP.md)

</div>

---

## 🎯 What is SyncKit?

SyncKit is a **production-ready sync engine** that makes building local-first applications trivial.

> "Add `sync.document()` to your app, get real-time sync automatically."

**The problem:** Building sync from scratch takes months. Existing solutions are complex (Yjs), expensive (Firebase), or don't work offline (Supabase).

**The solution:** SyncKit gives you production-ready sync in 3 lines of code.

```typescript
const sync = new SyncKit()
await sync.init()
const doc = sync.document<Todo>('todo-123')
await doc.update({ completed: true })
// ✨ Works offline, syncs automatically, resolves conflicts
```

### 🎬 See It In Action

![SyncKit Demo](demo.gif)

**Real-time collaboration with offline resilience:** Watch tasks sync instantly across tabs—even while offline. The example app demonstrates SyncKit's offline-first capabilities combined with smart browser storage to create a seamless collaborative experience.

---

## ✨ Why SyncKit?

### 🚀 **Works When Internet Doesn't**
True offline-first architecture—not just caching. Your app works perfectly on planes, trains, tunnels, and coffee shops with spotty WiFi.

### 📦 **Enterprise Features, Startup Bundle**

**~59 KB gzipped** (10KB SDK + 49KB WASM) - Complete WASM-based sync engine with TypeScript SDK.

Current features (v0.1.0):
- ✅ Offline-first sync (LWW)
- ✅ Real-time collaboration
- ✅ Network protocol support
- ✅ IndexedDB persistence
- ✅ Cross-tab sync (see [example](examples/project-management))

Coming in v0.2.0 (In Progress):
- ⚡ **Text CRDTs** (Fugue algorithm) - **Core complete, optimization in progress**
  - ✅ Works great for small-medium documents (<1000 chars)
  - 🚧 Performance optimization needed for large documents (Phase 1.5)
- 🚧 Counters, Sets (distributed data structures)

**Size-critical apps?** Use Lite variant (~45 KB gzipped: 1.5KB SDK + 44KB WASM, local-only)

**Competitive bundle size:** Larger than Yjs (~19KB pure JS), smaller than Automerge (~60-78KB).

### 🔓 **Your Data, Your Rules**
Open source and self-hostable. No vendor lock-in, no surprise $2,000/month bills, complete data sovereignty.

### ⚡ **Fast by Design**
- <1ms local operations (~5-20μs single field update)
- <100ms sync latency (10-50ms p95)
- ~59KB bundle (10KB SDK + 49KB WASM), ~45KB lite option
- Sub-200KB total with React

### 🛡️ **Data Integrity Guaranteed**
- Zero data loss with automatic conflict resolution (Last-Write-Wins)
- Formal verification with TLA+ (3 bugs found and fixed)
- 700+ comprehensive tests across TypeScript and Rust (unit, integration, chaos, load)

---

## 🆚 Comparison

| Feature | SyncKit | Firebase | Supabase | Yjs | Automerge |
|---------|:-------:|:--------:|:--------:|:---:|:---------:|
| **True Offline-First** | ✅ Native | ⚠️ Cache only<br/>(40MB limit) | ❌ None<br/>([#357](https://github.com/supabase/supabase/issues/357) - 4+ years) | ✅ Full | ✅ Full |
| **Works Without Server** | ✅ Yes | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Bundle Size (gzipped)** | **~59KB**<br/>(45KB lite) | ~150KB | ~45KB | **~19KB** | ~60-78KB |
| **Text CRDT** | 🚧 v0.2.0 | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Counters/Sets** | 🚧 v0.2.0 | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Automatic Conflicts** | ✅ LWW | ✅ LWW | ⚠️ Manual | ✅ CRDT | ✅ CRDT |
| **Self-Hosted** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Multi-Language Server** | ✅ TS<br/>🚧 Py/Go/Rust | ❌ No | ⚠️ Postgres only | ❌ JS only | ❌ JS only |
| **Pricing** | Free (self-host) | $25-$2,000+/mo | $0-$25/mo | Free | Free |
| **TypeScript Support** | ✅ Native | ✅ Good | ✅ Good | ⚠️ Issues | ✅ Good |
| **Learning Curve** | ✅ 5 minutes | ⚠️ Medium | ⚠️ Medium | ⚠️ Steep | ⚠️ Complex |
| **Production Status** | ✅ v0.1.0 ready | ✅ Mature | ✅ Mature | ✅ Mature | ⚠️ Alpha/Beta |

**TL;DR:**
- **vs Firebase:** No vendor lock-in, true offline, predictable costs
- **vs Supabase:** Actually works offline (their [#1 issue](https://github.com/supabase/supabase/issues/357) for 4+ years)
- **vs Yjs:** WASM-based for multi-language server support, simpler API for structured data
- **vs Automerge:** Smaller bundle, faster performance, production-ready

**[See detailed migration guides →](docs/guides/)**

---

## 🚀 Quick Start

### Installation

```bash
npm install @synckit-js/sdk
```

### Your First Synced App

```typescript
import { SyncKit } from '@synckit-js/sdk'
import { SyncProvider, useSyncDocument } from '@synckit-js/sdk/react'

// Initialize (works offline-only, no server needed!)
const sync = new SyncKit()
await sync.init()

function App() {
  return (
    <SyncProvider synckit={sync}>
      <TodoApp />
    </SyncProvider>
  )
}

function TodoApp() {
  const [todo, { update }] = useSyncDocument<Todo>('todo-1')

  if (!todo || !todo.text) return <div>Loading...</div>

  return (
    <div>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={(e) => update({ completed: e.target.checked })}
      />
      <span>{todo.text}</span>
    </div>
  )
}
```

**That's it!** Your app now:
- ✅ Works 100% offline
- ✅ Syncs across tabs automatically
- ✅ Persists data in IndexedDB
- ✅ Resolves conflicts automatically

**Bundle:** SyncKit (~59 KB gzipped) + React (~130 KB) = **~189 KB total**

**Size-critical?** `import { SyncKit } from '@synckit-js/sdk/lite'` (~45 KB gzipped, local-only)

**[Full tutorial (5 minutes) →](docs/guides/getting-started.md)**

---

## 🎓 Features

### Core Capabilities

- **🔄 Real-Time Sync** - WebSocket-based instant sync across devices
- **📴 Offline-First** - Works perfectly with zero connectivity
- **🗄️ Local Persistence** - IndexedDB storage, unlimited capacity
- **🔀 Conflict Resolution** - Automatic Last-Write-Wins (LWW) merge
- **⚡ Fast Operations** - <1ms local updates, <100ms sync latency
- **📦 Compact Bundle** - ~59KB gzipped (10KB SDK + 49KB WASM)
- **🔐 Secure** - JWT authentication, RBAC permissions

### Framework Integration

- **⚛️ React Hooks** - `useSyncDocument`, `useSyncField`, `SyncProvider`
- **🌐 TypeScript Server** - Bun + Hono reference implementation
- **📦 Multi-Variant** - Default (~59KB gzipped) or Lite (~45KB gzipped) builds

### Coming in v0.2.0

- **✍️ Text CRDTs (Fugue Algorithm)** - Collaborative text editing ⚡ **Core Complete!**
  - ✅ Full Rust implementation with WASM bindings
  - ✅ TypeScript SDK & React hooks (`useSyncText`)
  - ✅ 76 tests passing (CRDT correctness validated)
  - ✅ Optimized for small-medium documents (<1000 chars)
  - 🚧 Performance optimization in progress for large documents (Phase 1.5)
  - See [v0.2.0 Roadmap](analysis/v0.2.0_ROADMAP.md) for details
- **🔢 Counters** - Conflict-free increment/decrement
- **📋 Sets & Lists** - Observed-Remove Sets for collections
- **🎨 Framework Adapters** - Vue composables, Svelte stores
- **🌐 Multi-Language Servers** - Python, Go, Rust implementations

---

## 🏗️ Architecture

```mermaid
graph TD
    A[Your Application<br/>React/Vue/Svelte] --> B[SyncKit SDK<br/>TypeScript]

    B -->|Simple API| B1[document, text, counter]
    B -->|Framework adapters| B2[React/Vue/Svelte hooks]
    B -->|Offline queue| B3[Storage adapters]

    B --> C[Rust Core Engine<br/>WASM + Native]

    C -->|80% of use cases| C1[LWW Sync]
    C -->|Collaborative editing| C2[Text CRDTs]
    C -->|Advanced features| C3[Custom CRDTs<br/>counters, sets]

    C --> D[IndexedDB Storage<br/>Your local source of truth]

    D -.->|Optional| E[SyncKit Server<br/>TypeScript/Python/Go/Rust]

    E -->|Real-time sync| E1[WebSocket]
    E -->|Persistence| E2[PostgreSQL/MongoDB]
    E -->|Security| E3[JWT auth + RBAC]

    style A fill:#e1f5ff,stroke:#333,stroke-width:2px,color:#1a1a1a
    style B fill:#fff4e1,stroke:#333,stroke-width:2px,color:#1a1a1a
    style C fill:#ffe1e1,stroke:#333,stroke-width:2px,color:#1a1a1a
    style D fill:#e1ffe1,stroke:#333,stroke-width:2px,color:#1a1a1a
    style E fill:#f0e1ff,stroke:#333,stroke-width:2px,color:#1a1a1a
```

**[Detailed architecture docs →](docs/architecture/ARCHITECTURE.md)**

---

## 📚 Documentation

### Getting Started
- **[5-Minute Quick Start](docs/guides/getting-started.md)** - Build your first synced app
- **[Installation Guide](docs/guides/getting-started.md#installation)** - Setup instructions
- **[API Reference](docs/api/SDK_API.md)** - Complete API documentation

### Core Concepts
- **[Offline-First Patterns](docs/guides/offline-first.md)** - True offline architecture
- **[Conflict Resolution](docs/guides/conflict-resolution.md)** - Automatic LWW merge strategy
- **[Performance Optimization](docs/guides/performance.md)** - Bundle size, memory, sync speed
- **[Testing Guide](docs/guides/testing.md)** - Property-based tests, chaos engineering

### Migration Guides
- **[From Firebase/Firestore](docs/guides/migration-from-firebase.md)** - Escape vendor lock-in
- **[From Supabase](docs/guides/migration-from-supabase.md)** - Add offline support
- **[From Yjs/Automerge](docs/guides/migration-from-yjs.md)** - Simplify your stack

### Examples
- **[Todo App](examples/todo-app/)** - Simple CRUD with filters
- **[Collaborative Editor](examples/collaborative-editor/)** - Real-time text editing with CodeMirror 6
- **[Project Management](examples/project-management/)** - Production-grade kanban app with drag-and-drop

**[Browse all docs →](docs/README.md)**

---

## 🎯 Use Cases

### Tier 1: Simple Object Sync (LWW)
**Perfect for:** Task apps, CRMs, project management, note apps (80% of applications)

```typescript
// Initialize once
const sync = new SyncKit()
await sync.init()

// Use anywhere
const doc = sync.document<Project>('project-123')
await doc.update({ status: 'completed' })
// Conflicts resolved automatically with Last-Write-Wins
```

### Tier 2: Collaborative Text Editing *(Coming Soon)*
**Perfect for:** Collaborative editors, documentation, notes

```typescript
// Note: Text CRDT API is planned for v0.2.0
const text = sync.text('document-456')
await text.insert(0, 'Hello ')
text.subscribe(content => editor.setValue(content))
// Character-level sync, conflict-free convergence
```

### Tier 3: Custom CRDTs *(Coming Soon)*
**Perfect for:** Whiteboards, design tools, specialized apps

```typescript
// Note: Counter API is planned for v0.2.0
const counter = sync.counter('likes-789')
await counter.increment()
// Conflict-free counter (additions never conflict)
```

---

## 📦 Packages

### Core
- **`@synckit-js/sdk`** - Core SDK (TypeScript) + WASM engine
- **`@synckit-js/sdk/react`** - React hooks and components (export from SDK)
- **`@synckit-js/sdk/lite`** - Lightweight version (local-only, 45KB gzipped)

### Servers
- **`@synckit-js/server`** - Bun + Hono reference server (production-ready)

---

## 🚦 Status

**Current Version:** v0.1.0
**Production Ready:** Core sync engine, React hooks, TypeScript server ✅

### What's Complete ✅

- ✅ **Core Rust Engine** - LWW sync engine with CRDT foundation
- ✅ **WASM Compilation** - 59KB gzipped (45KB lite), optimized performance
- ✅ **TypeScript SDK** - Document API, IndexedDB storage, offline queue
- ✅ **Cross-Tab Sync** - Server-mediated sync with operation buffering for multi-tab coordination
- ✅ **React Integration** - `useSyncDocument`, `useSyncField`, `SyncProvider` hooks
- ✅ **TypeScript Server** - WebSocket sync server with Bun + Hono
- ✅ **Example Applications** - Todo app, collaborative editor, project management demos
- ✅ **Documentation** - Comprehensive guides and API reference
- ✅ **Build System** - Complete toolchain with benchmarks and CI

### What's Next 🚧

- 🚧 **Text CRDTs** - Collaborative text editing (`useText` hook) for character-level sync
- 🚧 **Counter CRDTs** - Distributed counters (`useCounter` hook) for conflict-free increments
- 🚧 **BroadcastChannel Cross-Tab** - Direct client-to-client sync without server (offline multi-tab)
- 🚧 **Framework Adapters** - Vue composables (`@synckit-js/sdk/vue`), Svelte stores (`@synckit-js/sdk/svelte`)
- 🚧 **Multi-Language Servers** - Python, Go, Rust server implementations (TypeScript complete)
- 🚧 **Advanced Storage** - OPFS (Origin Private File System), SQLite adapter
- 🚧 **Conflict UI** - Visual conflict resolution interface for complex merge scenarios

**[Full roadmap →](ROADMAP.md)**

---

## 🤝 Contributing

We welcome contributions from the community!

**Ways to contribute:**
- 🐛 **Bug Reports** - [Open an issue](https://github.com/Dancode-188/synckit/issues)
- 📚 **Documentation** - Improve guides, fix typos
- 🧪 **Tests** - Add test coverage
- 🌐 **Servers** - Implement Python/Go/Rust servers
- 💡 **Features** - Propose new features in discussions

**[Contributing guide →](CONTRIBUTING.md)**

---

## 🏢 Enterprise

Need enterprise support?

- 🎯 **Managed Hosting** - We host SyncKit servers for you
- 🔒 **Priority Support** - 24/7 support, SLA guarantees
- 📊 **Monitoring & Analytics** - Dashboard, alerts, insights
- 🎓 **Training & Consulting** - Onboarding, architecture review

**Contact:** [danbitengo@gmail.com](mailto:danbitengo@gmail.com)

---

## 📊 Benchmarks

### Bundle Size (gzipped)
```
Yjs:                ~19 KB ████
SyncKit (lite):     ~45 KB █████████
SyncKit (default):  ~59 KB ████████████
Automerge:       ~60-78 KB ████████████████
Firebase:          ~150 KB ████████████████████████████████
```

### Sync Performance
```
Local update:       <1 ms  ████
Cross-tab sync:     <1 ms  ████
Network sync:    10-50 ms  ████████
Firebase (cold):  2-30 s   ████████████████████████████████
```

### Memory Usage (10K documents)
```
SyncKit:       3 MB  ████
Yjs:           8 MB  █████████
Automerge:   180 MB  ████████████████████████████████████████
```

**[Detailed benchmarks →](docs/guides/performance.md)**

---

## 🙏 Acknowledgments

Built with inspiration from:
- **[Yjs](https://github.com/yjs/yjs)** - Text CRDT concepts and performance optimization
- **[Automerge](https://github.com/automerge/automerge)** - CRDT theory and formal verification
- **[Linear](https://linear.app)** - Pragmatic approach to sync
- **[Figma](https://figma.com)** - Custom sync architecture patterns
- **[RxDB](https://rxdb.info/)** - Local-first database patterns

Special thanks to the local-first community for pioneering this movement.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

Copyright (c) 2025 Daniel Bitengo

---

## 🔗 Links

- **[Documentation](docs/README.md)** - Complete guides and API reference
- **[GitHub](https://github.com/Dancode-188/synckit)** - Source code
- **[Issues](https://github.com/Dancode-188/synckit/issues)** - Bug reports and features
- **[Roadmap](ROADMAP.md)** - Development timeline
- **[Discussions](https://github.com/Dancode-188/synckit/discussions)** - Community discussions
- **[LinkedIn](https://www.linkedin.com/in/daniel-bitengo/)** - Connect and follow updates

---

<div align="center">

**Built with ❤️ for the local-first future**

[⭐ Star us on GitHub](https://github.com/Dancode-188/synckit) • [📖 Read the docs](docs/README.md) • [🚀 Get started](docs/guides/getting-started.md)

</div>
