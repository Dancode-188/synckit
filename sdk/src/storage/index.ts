/**
 * Storage Adapters
 * @module storage
 */

import { MemoryStorage } from './memory'
import { IndexedDBStorage } from './indexeddb'
import { OPFSStorage } from './opfs'
import type { StorageAdapter } from '../types'

export { MemoryStorage } from './memory'
export { IndexedDBStorage } from './indexeddb'
export { OPFSStorage } from './opfs'
export type { StorageAdapter, StoredDocument } from '../types'

/**
 * Create a storage adapter based on type string
 */
export function createStorage(type: 'memory' | 'indexeddb' | 'opfs', name: string = 'synckit'): StorageAdapter {
  switch (type) {
    case 'memory':
      return new MemoryStorage()
    case 'indexeddb':
      return new IndexedDBStorage(name)
    case 'opfs':
      return new OPFSStorage(name)
    default:
      throw new Error(`Unknown storage type: ${type}`)
  }
}
