/**
 * SyncKit SDK - Lite Variant
 * Minimal variant (44 KB gzipped WASM)
 *
 * Features: LWW, VectorClock, Basic Sync
 * Use for: Local-only sync without network protocol
 *
 * @packageDocumentation
 * @module @synckit/sdk/lite
 */

// Core exports
export { SyncKit } from './synckit-lite'
export { SyncDocument } from './document'

// Storage adapters
export { MemoryStorage, IndexedDBStorage, createStorage } from './storage'
export type { StorageAdapter, StoredDocument } from './storage'

// Types
export type {
  SyncKitConfig,
  DocumentData,
  FieldPath,
  SubscriptionCallback,
  Unsubscribe,
  QueuedOperation,
  QueueConfig
} from './types'

// Errors
export {
  SyncKitError,
  StorageError,
  WASMError,
  DocumentError
} from './types'

// Version
export const VERSION = '0.1.0-alpha.1-lite'
export const VARIANT = 'lite'
export const WASM_SIZE = '44 KB (gzipped)'

/**
 * Lite Variant
 *
 * This is the minimal SyncKit variant, optimized for smallest bundle size.
 *
 * **Bundle Size:** 44 KB (WASM gzipped)
 *
 * **Features:**
 * - ✅ Last-Write-Wins (LWW) conflict resolution
 * - ✅ Vector Clock for causality tracking
 * - ✅ Local document synchronization
 * - ✅ Storage adapters (Memory, IndexedDB)
 * - ❌ No network protocol support
 * - ❌ No DateTime library
 * - ❌ No Protocol Buffer serialization
 * - ❌ No Text CRDT
 * - ❌ No Counters or Sets
 *
 * **Use When:**
 * - Building local-only apps without network sync
 * - Bundle size is critical (need smallest possible)
 * - Don't need server synchronization
 * - Basic document sync is sufficient
 *
 * **Not Suitable For:**
 * - Server synchronization → Use default variant
 * - Collaborative text editing → Use default variant
 * - Network protocol needed → Use default variant
 *
 * @example
 * ```typescript
 * import { SyncKit } from '@synckit/sdk/lite'
 *
 * const sync = new SyncKit({
 *   storage: 'indexeddb',
 *   name: 'my-app'
 * })
 *
 * await sync.init()
 *
 * const doc = sync.document<{ title: string }>('todo-1')
 * await doc.set('title', 'Buy milk')
 * ```
 */
