/**
 * IndexedDB Storage Adapter
 * Browser-native persistent storage
 * @module storage/indexeddb
 */

import type { StorageAdapter, StoredDocument } from '../types'
import { StorageError } from '../types'

const DB_VERSION = 1
const STORE_NAME = 'documents'

export class IndexedDBStorage implements StorageAdapter {
  private db: IDBDatabase | null = null
  private channel: BroadcastChannel | null = null
  private channelId: string
  private changeListeners: Set<(change: { type: 'set' | 'delete' | 'clear', docId?: string }) => void> = new Set()

  constructor(private readonly dbName: string = 'synckit') {
    this.channelId = `idb-${Math.random().toString(36).substring(2, 9)}`
  }
  
  async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      throw new StorageError('IndexedDB not available in this environment')
    }
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION)
      
      request.onerror = () => {
        reject(new StorageError(`Failed to open IndexedDB: ${request.error}`))
      }
      
      request.onsuccess = () => {
        this.db = request.result

        // Set up BroadcastChannel for multi-tab synchronization
        if (typeof BroadcastChannel !== 'undefined') {
          this.channel = new BroadcastChannel(`synckit-idb-${this.dbName}`)
          this.channel.onmessage = (event) => {
            this.handleStorageMessage(event.data)
          }
        }

        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
    })
  }

  /**
   * Handle incoming storage messages from other tabs
   */
  private handleStorageMessage(message: { type: 'set' | 'delete' | 'clear', docId?: string, source: string, timestamp: number }): void {
    // Ignore messages from this tab
    if (message.source === this.channelId) {
      return
    }

    // Notify change listeners
    this.changeListeners.forEach(listener => {
      try {
        listener(message)
      } catch (error) {
        console.error('Error in storage change listener:', error)
      }
    })
  }

  /**
   * Broadcast a storage change to other tabs
   */
  private broadcast(type: 'set' | 'delete' | 'clear', docId?: string): void {
    if (!this.channel) {
      return
    }

    const message = {
      type,
      docId,
      timestamp: Date.now(),
      source: this.channelId,
    }

    try {
      this.channel.postMessage(message)
    } catch (error) {
      console.error('Failed to broadcast storage change:', error)
    }
  }

  /**
   * Subscribe to storage changes from other tabs
   */
  onChange(listener: (change: { type: 'set' | 'delete' | 'clear', docId?: string }) => void): () => void {
    this.changeListeners.add(listener)

    // Return unsubscribe function
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  async get(docId: string): Promise<StoredDocument | null> {
    if (!this.db) {
      throw new StorageError('Storage not initialized')
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(docId)
      
      request.onerror = () => {
        reject(new StorageError(`Failed to get document: ${request.error}`))
      }
      
      request.onsuccess = () => {
        resolve(request.result ?? null)
      }
    })
  }
  
  async set(docId: string, doc: StoredDocument): Promise<void> {
    if (!this.db) {
      throw new StorageError('Storage not initialized')
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      // Ensure the document has an 'id' field for the keyPath
      const request = store.put({ ...doc, id: docId })

      request.onerror = () => {
        reject(new StorageError(`Failed to save document: ${request.error}`))
      }

      transaction.oncomplete = () => {
        // Broadcast change to other tabs
        this.broadcast('set', docId)
        resolve()
      }
    })
  }
  
  async delete(docId: string): Promise<void> {
    if (!this.db) {
      throw new StorageError('Storage not initialized')
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(docId)

      request.onerror = () => {
        reject(new StorageError(`Failed to delete document: ${request.error}`))
      }

      transaction.oncomplete = () => {
        // Broadcast change to other tabs
        this.broadcast('delete', docId)
        resolve()
      }
    })
  }
  
  async list(): Promise<string[]> {
    if (!this.db) {
      throw new StorageError('Storage not initialized')
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAllKeys()
      
      request.onerror = () => {
        reject(new StorageError(`Failed to list documents: ${request.error}`))
      }
      
      request.onsuccess = () => {
        resolve(request.result as string[])
      }
    })
  }
  
  async clear(): Promise<void> {
    if (!this.db) {
      throw new StorageError('Storage not initialized')
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onerror = () => {
        reject(new StorageError(`Failed to clear storage: ${request.error}`))
      }

      transaction.oncomplete = () => {
        // Broadcast change to other tabs
        this.broadcast('clear')
        resolve()
      }
    })
  }

  /**
   * Close the BroadcastChannel and cleanup listeners
   */
  close(): void {
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }
    this.changeListeners.clear()
  }
}
