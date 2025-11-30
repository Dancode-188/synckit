/**
 * SyncKit - Main SDK Class
 * Entry point for the SyncKit SDK
 * @module synckit
 */

import type {
  SyncKitConfig,
  StorageAdapter,
  NetworkStatus,
  DocumentSyncState,
  Unsubscribe,
} from './types'
import { SyncKitError } from './types'
import { SyncDocument } from './document'
import { createStorage } from './storage'
import { initWASM } from './wasm-loader'
import { WebSocketClient } from './websocket/client'
import { SyncManager } from './sync/manager'
import { OfflineQueue } from './sync/queue'
import { NetworkStateTracker } from './sync/network-state'

export class SyncKit {
  private storage: StorageAdapter
  private clientId: string
  private initialized = false
  private documents = new Map<string, SyncDocument<any>>()
  private config: SyncKitConfig

  // Network components (initialized only if serverUrl provided)
  private websocket?: WebSocketClient
  private syncManager?: SyncManager
  private offlineQueue?: OfflineQueue
  private networkTracker?: NetworkStateTracker

  constructor(config: SyncKitConfig = {}) {
    this.config = config

    // Generate client ID if not provided
    this.clientId = config.clientId ?? this.generateClientId()

    // Initialize storage
    if (typeof config.storage === 'string') {
      this.storage = createStorage(config.storage, config.name)
    } else if (config.storage) {
      this.storage = config.storage
    } else {
      // Default to IndexedDB in browser, Memory in Node
      const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
      this.storage = createStorage(isBrowser ? 'indexeddb' : 'memory', config.name)
    }
  }
  
  /**
   * Initialize SyncKit
   * Must be called before using any documents
   */
  async init(): Promise<void> {
    if (this.initialized) return

    try {
      // Initialize WASM module
      await initWASM()

      // Initialize storage
      await this.storage.init()

      // Initialize network layer if serverUrl provided
      if (this.config.serverUrl) {
        await this.initNetworkLayer()
      }

      this.initialized = true
    } catch (error) {
      throw new SyncKitError(
        `Failed to initialize SyncKit: ${error}`,
        'INIT_ERROR'
      )
    }
  }

  /**
   * Initialize network components
   * @private
   */
  private async initNetworkLayer(): Promise<void> {
    if (!this.config.serverUrl) return

    const networkConfig = this.config.network ?? {}

    // Initialize network state tracker
    this.networkTracker = new NetworkStateTracker()

    // Initialize offline queue
    this.offlineQueue = new OfflineQueue({
      storage: this.storage,
      maxSize: networkConfig.queue?.maxSize ?? 1000,
      maxRetries: networkConfig.queue?.maxRetries ?? 5,
      retryDelay: networkConfig.queue?.retryDelay ?? 1000,
      retryBackoff: networkConfig.queue?.retryBackoff ?? 2.0,
    })
    await this.offlineQueue.init()

    // Initialize WebSocket client
    this.websocket = new WebSocketClient({
      url: this.config.serverUrl,
      reconnect: {
        initialDelay: networkConfig.reconnect?.initialDelay ?? 1000,
        maxDelay: networkConfig.reconnect?.maxDelay ?? 30000,
        backoffMultiplier: networkConfig.reconnect?.multiplier ?? 1.5,
      },
      heartbeat: {
        interval: networkConfig.heartbeat?.interval ?? 30000,
        timeout: networkConfig.heartbeat?.timeout ?? 5000,
      },
    })

    // Initialize sync manager
    this.syncManager = new SyncManager({
      websocket: this.websocket,
      storage: this.storage,
      offlineQueue: this.offlineQueue,
      clientId: this.clientId,
    })

    // Connect to server
    try {
      await this.websocket.connect()
    } catch (error) {
      // Connection failure is non-fatal - will retry automatically
      console.warn('Initial connection failed, will retry:', error)
    }
  }
  
  /**
   * Create or get a document
   * Documents are cached per ID
   */
  document<T extends Record<string, unknown> = Record<string, unknown>>(
    id: string
  ): SyncDocument<T> {
    if (!this.initialized) {
      throw new SyncKitError(
        'SyncKit not initialized. Call init() first.',
        'NOT_INITIALIZED'
      )
    }

    // Return cached document if exists
    if (this.documents.has(id)) {
      return this.documents.get(id)!
    }

    // Create new document
    const doc = new SyncDocument<T>(id, this.clientId, this.storage, this.syncManager)
    this.documents.set(id, doc)

    // Initialize document asynchronously
    doc.init().catch(error => {
      console.error(`Failed to initialize document ${id}:`, error)
    })

    return doc
  }
  
  /**
   * List all document IDs in storage
   */
  async listDocuments(): Promise<string[]> {
    if (!this.initialized) {
      throw new SyncKitError(
        'SyncKit not initialized. Call init() first.',
        'NOT_INITIALIZED'
      )
    }
    
    return this.storage.list()
  }
  
  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<void> {
    if (!this.initialized) {
      throw new SyncKitError(
        'SyncKit not initialized. Call init() first.',
        'NOT_INITIALIZED'
      )
    }
    
    // Remove from cache
    const doc = this.documents.get(id)
    if (doc) {
      doc.dispose()
      this.documents.delete(id)
    }
    
    // Remove from storage
    await this.storage.delete(id)
  }
  
  /**
   * Clear all documents
   */
  async clearAll(): Promise<void> {
    if (!this.initialized) {
      throw new SyncKitError(
        'SyncKit not initialized. Call init() first.',
        'NOT_INITIALIZED'
      )
    }
    
    // Dispose all cached documents
    for (const doc of this.documents.values()) {
      doc.dispose()
    }
    this.documents.clear()
    
    // Clear storage
    await this.storage.clear()
  }
  
  /**
   * Get client ID
   */
  getClientId(): string {
    return this.clientId
  }
  
  /**
   * Check if SyncKit is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Get network status (only available if serverUrl is configured)
   */
  getNetworkStatus(): NetworkStatus | null {
    if (!this.websocket || !this.offlineQueue || !this.networkTracker) {
      return null
    }

    const queueStats = this.offlineQueue.getStats()

    return {
      networkState: this.networkTracker.getState(),
      connectionState: this.websocket.getState(),
      queueSize: queueStats.size,
      failedOperations: queueStats.failed,
      oldestOperation: queueStats.oldestOperation,
    }
  }

  /**
   * Get sync state for a document (only available if serverUrl is configured)
   */
  getSyncState(documentId: string): DocumentSyncState | null {
    if (!this.syncManager) {
      return null
    }

    return this.syncManager.getSyncState(documentId)
  }

  /**
   * Subscribe to sync state changes for a document
   */
  onSyncStateChange(
    documentId: string,
    callback: (state: DocumentSyncState) => void
  ): Unsubscribe | null {
    if (!this.syncManager) {
      return null
    }

    return this.syncManager.onSyncStateChange(documentId, callback)
  }

  /**
   * Subscribe to network status changes
   */
  onNetworkStatusChange(callback: (status: NetworkStatus) => void): Unsubscribe | null {
    if (!this.networkTracker || !this.websocket || !this.offlineQueue) {
      return null
    }

    // Combine listeners from all components
    const listeners: Array<() => void> = []

    const emitStatus = () => {
      const status = this.getNetworkStatus()
      if (status) {
        callback(status)
      }
    }

    listeners.push(this.networkTracker.onChange(emitStatus))
    listeners.push(this.websocket.onStateChange(emitStatus))
    listeners.push(this.offlineQueue.onChange(emitStatus))

    return () => {
      listeners.forEach(unsubscribe => unsubscribe())
    }
  }

  /**
   * Manually trigger sync for a document
   */
  async syncDocument(documentId: string): Promise<void> {
    if (!this.syncManager) {
      throw new SyncKitError(
        'Network layer not initialized. Provide serverUrl in config.',
        'NETWORK_NOT_INITIALIZED'
      )
    }

    await this.syncManager.requestSync(documentId)
  }

  /**
   * Cleanup and dispose all resources
   */
  dispose(): void {
    // Dispose all documents
    for (const doc of this.documents.values()) {
      doc.dispose()
    }
    this.documents.clear()

    // Dispose network components
    if (this.syncManager) {
      this.syncManager.dispose()
    }
    if (this.websocket) {
      this.websocket.disconnect()
    }
    if (this.networkTracker) {
      this.networkTracker.dispose()
    }

    this.initialized = false
  }

  // Private methods
  
  private generateClientId(): string {
    // Generate a random client ID
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 15)
    return `client-${timestamp}-${random}`
  }
}
