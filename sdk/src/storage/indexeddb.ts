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
  
  constructor(private readonly dbName: string = 'synckit') {}
  
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
      
      request.onsuccess = () => {
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
      
      request.onsuccess = () => {
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
      
      request.onsuccess = () => {
        resolve()
      }
    })
  }
}
