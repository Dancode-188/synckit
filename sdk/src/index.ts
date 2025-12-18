/**
 * SyncKit SDK - Default Variant
 * Full-featured production-grade local-first sync (49 KB gzipped WASM)
 *
 * Features: LWW, VectorClock, Network Protocol, Text CRDT, Counters, Sets
 * Recommended for: Most applications (95% of use cases)
 *
 * @packageDocumentation
 * @module @synckit/sdk
 */

// Core exports
export { SyncKit } from './synckit'
export { SyncDocument } from './document'
export { SyncText } from './text'
export { RichText } from './crdt/richtext'
export { SyncCounter } from './counter'
export { SyncSet } from './set'
export { Awareness } from './awareness'
export type { AwarenessState, AwarenessUpdate, AwarenessCallback } from './awareness'

// RichText types
export type {
  RichTextStorageData,
  FormatRange,
  FormatChangeCallback
} from './crdt/richtext'

// Peritext types (for custom formatting)
export type { FormatAttributes } from './crdt/peritext'

// Delta utilities (for Quill interop)
export type { Delta, DeltaOp } from './crdt/delta'
export { DeltaUtils } from './crdt/delta'

// Cross-tab sync
export { CrossTabSync } from './sync/cross-tab'
export type { CrossTabSyncOptions } from './sync/cross-tab'

// Undo/Redo
export { UndoManager } from './undo/undo-manager'
export type { Operation, UndoManagerState } from './undo/undo-manager'

// Storage adapters
export { MemoryStorage, IndexedDBStorage, createStorage } from './storage'
export type { StorageAdapter, StoredDocument } from './storage'

// Types
export type {
  SyncKitConfig,
  NetworkConfig,
  DocumentData,
  FieldPath,
  SubscriptionCallback,
  Unsubscribe,
  QueuedOperation,
  QueueConfig,
  NetworkState,
  ConnectionState,
  SyncState,
  DocumentSyncState,
  NetworkStatus,
} from './types'

// Errors
export {
  SyncKitError,
  StorageError,
  WASMError,
  DocumentError,
  NetworkError,
} from './types'

// Version
export const VERSION = '0.1.0-alpha.1'
export const VARIANT = 'default'
export const WASM_SIZE = '49 KB (gzipped)'

/**
 * Default Variant (Recommended)
 *
 * This is the full-featured SyncKit variant. Recommended for 95% of applications.
 *
 * **Bundle Size:** 49 KB (WASM gzipped)
 *
 * **Features:**
 * - ✅ Last-Write-Wins (LWW) conflict resolution
 * - ✅ Vector Clock for causality tracking
 * - ✅ Network protocol support (Protocol Buffers)
 * - ✅ Text CRDT for collaborative editing
 * - ✅ Counters (distributed increment/decrement)
 * - ✅ Sets (add/remove operations)
 * - ✅ DateTime support
 * - ✅ Server synchronization
 * - ✅ Storage adapters (Memory, IndexedDB)
 *
 * **Use When:**
 * - Building any production application (recommended default)
 * - Need server synchronization
 * - Want all features available
 * - Building collaborative apps
 * - 5 KB difference from Lite variant doesn't matter
 *
 * **Size-Critical Apps:**
 * - If every KB matters → Use `@synckit/sdk/lite` (44 KB, local-only)
 */

/**
 * Quick start example:
 * 
 * ```typescript
 * import { SyncKit } from '@synckit/sdk'
 * 
 * // Initialize SyncKit
 * const sync = new SyncKit({
 *   storage: 'indexeddb',
 *   name: 'my-app'
 * })
 * 
 * await sync.init()
 * 
 * // Create a typed document
 * interface Todo {
 *   title: string
 *   completed: boolean
 * }
 * 
 * const doc = sync.document<Todo>('todo-1')
 * 
 * // Set fields
 * await doc.set('title', 'Buy milk')
 * await doc.set('completed', false)
 * 
 * // Subscribe to changes
 * doc.subscribe((todo) => {
 *   console.log('Todo updated:', todo)
 * })
 * 
 * // Get current state
 * const todo = doc.get()
 * console.log(todo.title) // "Buy milk"
 * ```
 */
