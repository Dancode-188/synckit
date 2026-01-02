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
import { SyncCounter } from './counter'
import { SyncSet } from './set'
import { SyncText } from './text'
import { RichText } from './crdt/richtext'
import { Awareness } from './awareness'
import { createStorage } from './storage'
import { initWASM } from './wasm-loader'
import { WebSocketClient } from './websocket/client'
import { SyncManager } from './sync/manager'
import { OfflineQueue } from './sync/queue'
import { NetworkStateTracker } from './sync/network-state'
import { CrossTabSync } from './sync/cross-tab'

export class SyncKit {
  private storage: StorageAdapter
  private clientId: string
  private initialized = false
  private documents = new Map<string, SyncDocument<any>>()
  private counters = new Map<string, SyncCounter>()
  private sets = new Map<string, SyncSet<any>>()
  private texts = new Map<string, SyncText>()
  private richTexts = new Map<string, RichText>()
  private awarenessInstances = new Map<string, Awareness>()
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

      // Setup beforeunload handler to send leave updates
      this.setupBeforeUnloadHandler()

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
   * Create or get a counter CRDT
   * Counters are cached per ID
   */
  counter(id: string): SyncCounter {
    if (!this.initialized) {
      throw new SyncKitError(
        'SyncKit not initialized. Call init() first.',
        'NOT_INITIALIZED'
      )
    }

    // Return cached counter if exists
    if (this.counters.has(id)) {
      return this.counters.get(id)!
    }

    // Create new counter
    const counter = new SyncCounter(id, this.clientId, this.storage, this.syncManager)
    this.counters.set(id, counter)

    // Initialize counter asynchronously
    counter.init().catch(error => {
      console.error(`Failed to initialize counter ${id}:`, error)
    })

    return counter
  }

  /**
   * Create or get a set CRDT
   * Sets are cached per ID
   */
  set<T extends string = string>(id: string): SyncSet<T> {
    if (!this.initialized) {
      throw new SyncKitError(
        'SyncKit not initialized. Call init() first.',
        'NOT_INITIALIZED'
      )
    }

    // Return cached set if exists
    if (this.sets.has(id)) {
      return this.sets.get(id)!
    }

    // Create new set
    const set = new SyncSet<T>(id, this.clientId, this.storage, this.syncManager)
    this.sets.set(id, set)

    // Initialize set asynchronously
    set.init().catch(error => {
      console.error(`Failed to initialize set ${id}:`, error)
    })

    return set
  }

  /**
   * Create or get a text CRDT
   * Texts are cached per ID
   */
  text(id: string): SyncText {
    if (!this.initialized) {
      throw new SyncKitError(
        'SyncKit not initialized. Call init() first.',
        'NOT_INITIALIZED'
      )
    }

    // Return cached text if exists
    if (this.texts.has(id)) {
      return this.texts.get(id)!
    }

    // Create CrossTabSync instance for this document (enables same-browser tab-to-tab sync)
    const crossTabSync = new CrossTabSync(id, { enabled: true })
    // console.log('[SyncKit] Created CrossTabSync for text document:', id)

    // Create new text with cross-tab sync support
    const text = new SyncText(id, this.clientId, this.storage, this.syncManager, crossTabSync)
    this.texts.set(id, text)

    // Initialize text asynchronously
    text.init().catch(error => {
      console.error(`Failed to initialize text ${id}:`, error)
    })

    return text
  }

  /**
   * Create or get a rich text CRDT
   * Rich texts are cached per ID
   */
  richText(id: string): RichText {
    if (!this.initialized) {
      throw new SyncKitError(
        'SyncKit not initialized. Call init() first.',
        'NOT_INITIALIZED'
      )
    }

    // Return cached rich text if exists
    if (this.richTexts.has(id)) {
      return this.richTexts.get(id)!
    }

    // Create CrossTabSync instance for this document (enables same-browser tab-to-tab sync)
    const crossTabSync = new CrossTabSync(id, { enabled: true })
    // console.log('[SyncKit] Created CrossTabSync for document:', id)

    // Create new rich text with cross-tab sync support
    const richText = new RichText(id, this.clientId, this.storage, this.syncManager, crossTabSync)
    this.richTexts.set(id, richText)

    // Initialize rich text asynchronously
    richText.init().catch(error => {
      console.error(`Failed to initialize rich text ${id}:`, error)
    })

    return richText
  }

  /**
   * Get or create awareness instance for a document
   * Awareness instances are cached per document ID
   */
  getAwareness(documentId: string): Awareness {
    if (!this.initialized) {
      throw new SyncKitError(
        'SyncKit not initialized. Call init() first.',
        'NOT_INITIALIZED'
      )
    }

    // Return cached awareness if exists
    if (this.awarenessInstances.has(documentId)) {
      return this.awarenessInstances.get(documentId)!
    }

    // Create CrossTabSync instance for this document (enables same-browser tab-to-tab awareness sync)
    const crossTabSync = new CrossTabSync(documentId, { enabled: true })

    // Create new awareness with cross-tab sync support
    const awareness = new Awareness(this.clientId, documentId, crossTabSync)
    this.awarenessInstances.set(documentId, awareness)

    // Register with sync manager IMMEDIATELY (before init)
    if (this.syncManager) {
      this.syncManager.registerAwareness(documentId, awareness)

      // Subscribe to awareness updates from server (critical for receiving other clients' cursor updates)
      this.syncManager.subscribeToAwareness(documentId).catch(error => {
        console.error(`Failed to subscribe to awareness for ${documentId}:`, error)
      })
    }

    // Initialize awareness asynchronously
    awareness.init().catch(error => {
      console.error(`Failed to initialize awareness for ${documentId}:`, error)
    })

    return awareness
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
   * Get storage adapter instance
   */
  getStorage(): StorageAdapter {
    return this.storage
  }

  /**
   * Get sync manager instance (only available if serverUrl is configured)
   */
  getSyncManager(): SyncManager | undefined {
    return this.syncManager
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
   * Send leave updates for all awareness instances
   * Call this before closing/navigating to notify other clients
   */
  sendAllLeaveUpdates(): void {
    if (!this.syncManager) return

    for (const documentId of this.awarenessInstances.keys()) {
      try {
        // Fire and forget - can't await in beforeunload handler
        this.syncManager.sendAwarenessLeave(documentId).catch((error) => {
          console.error(`Failed to send leave update for ${documentId}:`, error)
        })
      } catch (error) {
        console.error(`Failed to send leave update for ${documentId}:`, error)
      }
    }
  }

  /**
   * Cleanup and dispose all resources
   */
  dispose(): void {
    // Send leave updates before disposal
    this.sendAllLeaveUpdates()

    // Dispose all documents
    for (const doc of this.documents.values()) {
      doc.dispose()
    }
    this.documents.clear()

    // Dispose all counters
    for (const counter of this.counters.values()) {
      counter.dispose()
    }
    this.counters.clear()

    // Dispose all sets
    for (const set of this.sets.values()) {
      set.dispose()
    }
    this.sets.clear()

    // Dispose all texts
    for (const text of this.texts.values()) {
      text.dispose()
    }
    this.texts.clear()

    // Dispose all awareness instances
    for (const awareness of this.awarenessInstances.values()) {
      awareness.dispose()
    }
    this.awarenessInstances.clear()

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

  /**
   * Setup beforeunload handler to send leave updates when page closes
   */
  private setupBeforeUnloadHandler(): void {
    // Only in browser environment
    if (typeof window === 'undefined') return

    const handleBeforeUnload = () => {
      // Send leave updates synchronously before page unloads
      this.sendAllLeaveUpdates()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  private generateClientId(): string {
    // Generate a random client ID
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 15)
    return `client-${timestamp}-${random}`
  }
}
