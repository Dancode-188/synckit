# SyncKit Documentation

Welcome to SyncKit! Build collaborative, offline-first apps without the complexity.

---

## ✨ What's New in v0.2.0

**Everything you need for real-time collaboration.**

v0.2.0 is production-ready with features that used to take months to build:

- **✍️ Rich text editing** - Formatting conflicts resolved automatically (Peritext CRDT)
- **↩️ Cross-tab undo/redo** - Works across browser tabs and persists across sessions
- **👥 Live presence** - See who's editing in real-time
- **🖱️ Cursor sharing** - Watch teammates type with animated cursors
- **🎯 Counters & Sets** - PN-Counter and OR-Set CRDTs for distributed state
- **⚛️ Framework adapters** - React, Vue 3, and Svelte 5 ready to use

**Backed by 1,081 passing tests** (87% coverage). Zero critical bugs. Production-ready.

**[Get started in 5 minutes →](guides/getting-started.md)**

---

## 🚀 Getting Started

**New to SyncKit?** Start here:

- **[5-Minute Quick Start](guides/getting-started.md)** - Build your first synced app
- **[Installation Guide](guides/getting-started.md#installation)** - Setup instructions
- **[Quick Start Example](guides/getting-started.md#quick-start-your-first-synced-document)** - Copy-paste code

---

## 📖 User Guides

Learn core concepts and patterns:

### Core Concepts
- **[Offline-First Patterns](guides/offline-first.md)** - True offline architecture, IndexedDB foundations, sync strategies
- **[Conflict Resolution](guides/conflict-resolution.md)** - How conflicts work, LWW strategy, custom handlers
- **[Performance Optimization](guides/performance.md)** - Bundle size, memory optimization, Web Workers
- **[Testing Guide](guides/testing.md)** - Unit tests, property-based testing, chaos engineering, E2E

### Advanced Topics
- **[Rich Text Editing](guides/rich-text-editing.md)** - Peritext CRDT for formatted text
- **[Undo/Redo](guides/undo-redo.md)** - Cross-tab undo with persistent history
- **[Cursor & Selection Sharing](guides/cursor-selection-sharing.md)** - Real-time cursor positions
- **[Counters & Sets](api/COUNTER_SET_API.md)** - PN-Counter and OR-Set CRDTs
- **[Bundle Size Optimization](guides/bundle-size-optimization.md)** - Tree-shaking, code splitting, lite variant
- **[Server Deployment](../server/typescript/DEPLOYMENT.md)** - Production deployment

---

## 🔄 Migration Guides

Switching from another platform or upgrading?

- **[From v0.1.0 to v0.2.0](guides/migration-from-v0.1.0.md)** - Upgrade guide with breaking changes and new features
- **[From Firebase/Firestore](guides/migration-from-firebase.md)** - Escape vendor lock-in, true offline support
- **[From Supabase](guides/migration-from-supabase.md)** - Add offline functionality
- **[From Yjs](guides/migration-from-yjs.md)** - Integrated solution with batteries included

---

## 📚 API Reference

Complete API documentation:

### Core SDK
- **[SDK API Reference](api/SDK_API.md)** - Complete API for `SyncKit`, `Document`, `Text`, `Counter`, `Set`
- **[Network API Reference](api/NETWORK_API.md)** - Network sync, offline queue, connection monitoring
- **[Configuration Options](api/SDK_API.md#configuration-options)** - All SyncKit config options
- **[Storage API](api/SDK_API.md#storage-adapters)** - IndexedDB, memory, OPFS, SQLite

### Framework Adapters
- **[React Hooks](api/SDK_API.md#react-hooks)** - `useSyncText`, `useRichText`, `useCounter`, `useSet`, `usePresence`, `useCursor`, `useUndoRedo`
- **[Vue 3 Integration](guides/vue-integration.md)** - Complete guide with composables and Composition API patterns
- **[Svelte 5 Integration](guides/svelte-integration.md)** - Reactive stores with runes support and context patterns

### Server API
- **[Server API Reference](../server/typescript/README.md)** - TypeScript server documentation
- **[Deployment Guide](../server/typescript/DEPLOYMENT.md)** - Production deployment
- **[Authentication](../server/typescript/README.md#authentication)** - JWT + RBAC

---

## 🏗️ Architecture

Understand how SyncKit works:

- **[System Architecture](architecture/ARCHITECTURE.md)** - High-level design, component interactions
- **[Protocol Specification](architecture/ARCHITECTURE.md#protocol-specification)** - Binary protocol, message format
- **[Storage Schema](architecture/ARCHITECTURE.md#storage-schema)** - IndexedDB structure
- **[Security Model](architecture/ARCHITECTURE.md#security-model)** - Authentication, permissions

---

## 💡 Examples

Learn from working examples:

### Basic Examples
- **[Todo App](../examples/todo-app/)** - Simple CRUD with offline support
  - Demonstrates: Document API, offline persistence, real-time sync

### Advanced Examples
- **[Collaborative Editor](../examples/collaborative-editor/)** - Real-time text editing with CodeMirror 6
  - Demonstrates: Text CRDT, multi-document support, offline-first editing, live presence

- **[Project Management App](../examples/project-management/)** - Production-grade kanban board
  - Demonstrates: Drag-and-drop with @dnd-kit, task management, team collaboration, shadcn/ui components

---

## 🎓 Concepts

### Local-First Principles

**What is Local-First?**
- Local database is the source of truth
- Network is optional (optimization, not requirement)
- Instant UI updates (<1ms)
- Works perfectly offline

**Key Benefits:**
- ✅ Speed: No network round-trips for reads
- ✅ Reliability: Works without internet
- ✅ Privacy: Data stays local by default
- ✅ Ownership: You control your data

**[Learn more about offline-first →](guides/offline-first.md)**

### Conflict Resolution

**How Conflicts Work:**
- Two clients edit same field while disconnected
- Both sync when back online
- SyncKit merges automatically

**Strategies:**
- **LWW (Last-Write-Wins)** - Default, works for 95% of cases
- **Custom Handlers** - Custom logic for specific fields
- **Text CRDTs** - Character-level merge for collaborative editing

**[Learn more about conflicts →](guides/conflict-resolution.md)**

### Performance

**Bundle Size (gzipped):**
- **Default variant:** 154KB (everything included - text editing, rich text, undo/redo, presence, cursors, framework adapters)
- **Lite variant:** 46KB (basic sync only)
- **What you get:** For 154KB, you're shipping production-ready collaboration without building it yourself

**Speed:**
- Local updates: <1ms (instant user feedback)
- Network sync: 10-50ms p95 (faster than most REST APIs)
- Multi-client convergence: <100ms (real-time collaboration)

**Stress-tested:** 24-hour continuous operation, 1,081 tests, zero memory leaks.

**[Learn more about performance →](guides/performance.md)** | **[Bundle size optimization →](guides/bundle-size-optimization.md)**

---

## 🧪 Testing

Learn how to test offline-first apps:

- **[Unit Testing](guides/testing.md#unit-testing-crdt-operations)** - Test CRDT operations
- **[Property-Based Testing](guides/testing.md#property-based-testing-for-crdts)** - Verify CRDT properties (convergence, commutativity)
- **[Network Testing](guides/testing.md#network-condition-testing)** - Simulate offline, slow networks, packet loss
- **[Chaos Engineering](guides/testing.md#chaos-engineering)** - Random failure injection, network partitions
- **[E2E Testing](guides/testing.md#multi-client-e2e-testing)** - Multi-client scenarios with Playwright

**[Full testing guide →](guides/testing.md)**

---

## 🔧 Troubleshooting

### Common Issues

**Module not found: @synckit-js/sdk**
```bash
# Core SDK (includes React hooks via @synckit-js/sdk/react)
npm install @synckit-js/sdk

# React is a peer dependency if you use the React hooks
npm install react
```

**QuotaExceededError: IndexedDB quota exceeded**
```typescript
// Request persistent storage
if (navigator.storage && navigator.storage.persist) {
  await navigator.storage.persist()
}
```

**Changes not syncing across tabs**
```typescript
// ✅ Cross-tab sync via BroadcastChannel is fully implemented
// Changes sync automatically across tabs via BroadcastChannel API
// Multi-tab scenarios work both locally (BroadcastChannel) and via server
const todo = sync.document<Todo>('todo-1')  // Same ID in both tabs - syncs automatically!
```

**TypeScript errors**
```typescript
// Define your interface
interface Todo extends Record<string, unknown> {
  id: string
  text: string
  completed: boolean
  dueDate?: Date  // Optional fields with ?
}

// Use with document
const todo = sync.document<Todo>('todo-1')
```

**[More troubleshooting →](guides/getting-started.md#common-issues)**

---

## 🤝 Community & Support

### Get Help

- **📖 [Documentation](README.md)** - You are here!
- **💬 [Discord Community](#)** - Chat with the community *(coming soon)*
- **🐛 [GitHub Issues](https://github.com/Dancode-188/synckit/issues)** - Report bugs, request features
- **📧 [Email](mailto:danbitengo@gmail.com)** - Direct support for enterprise

### Contributing

We welcome contributions!

- **[Contributing Guide](../CONTRIBUTING.md)** - How to contribute
- **[Code of Conduct](../CODE_OF_CONDUCT.md)** - Community guidelines *(coming soon)*
- **[Roadmap](../ROADMAP.md)** - Development timeline
- **[Architecture Docs](architecture/ARCHITECTURE.md)** - Technical deep-dive

---

## 📊 Status

**Current Release:** v0.2.0 (December 2025)
**Production Ready:** Complete local-first collaboration platform ✅

### What's Complete ✅

- ✅ **Text CRDT (Fugue)** - Collaborative text editing with conflict-free convergence
- ✅ **Rich Text (Peritext)** - Bold, italic, links with formatting conflict resolution
- ✅ **Undo/Redo** - Cross-tab undo with persistent history
- ✅ **Awareness & Presence** - Real-time user tracking
- ✅ **Cursor Sharing** - Live cursor positions with animations
- ✅ **Counters & Sets** - PN-Counter and OR-Set CRDTs
- ✅ **Vue 3 Adapter** - Complete composables with Composition API
- ✅ **Svelte 5 Adapter** - Reactive stores with runes support
- ✅ Core Rust engine (LWW sync, full CRDT suite, protocol)
- ✅ TypeScript SDK (Document, Text, RichText, Counter, Set APIs)
- ✅ Network sync layer (WebSocket, offline queue, auto-reconnect)
- ✅ Cross-tab sync (BroadcastChannel + server-mediated)
- ✅ React integration (complete hook library for all features)
- ✅ TypeScript server (WebSocket sync, JWT auth, PostgreSQL)
- ✅ Example applications (todo app, collaborative editor, project management)
- ✅ **1,081+ tests** (87% coverage)
- ✅ Documentation (complete API reference, guides, migration docs)
- ✅ Formal verification (TLA+, 118K states explored)

### What's Next 🚧

- 🚧 Multi-language servers (Python, Go, Rust)
- 🚧 Advanced storage adapters (OPFS, SQLite)
- 🚧 Performance optimization (large documents >10K chars)

**[Full roadmap →](../ROADMAP.md)**

---

## 📝 License

MIT License - see [LICENSE](../LICENSE) for details.

---

## 🔗 Quick Links

- **[Main README](../README.md)** - Project overview
- **[Getting Started](guides/getting-started.md)** - 5-minute tutorial
- **[API Reference](api/SDK_API.md)** - Complete API docs
- **[Network API](api/NETWORK_API.md)** - Network sync documentation
- **[Examples](../examples/)** - Working examples
- **[GitHub](https://github.com/Dancode-188/synckit)** - Source code
- **[Roadmap](../ROADMAP.md)** - Development timeline

---

<div align="center">

**Happy syncing! 🚀**

Questions? Check the [guides](guides/), [API docs](api/), or [open an issue](https://github.com/Dancode-188/synckit/issues).

</div>
