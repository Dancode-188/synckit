/**
 * Sync Manager
 *
 * Coordinates synchronization between local documents and remote server.
 * Handles subscriptions, conflict resolution, and sync state management.
 *
 * @module sync/manager
 */

import type { StorageAdapter, Unsubscribe } from '../types'
import type { WebSocketClient } from '../websocket/client'
import type { OfflineQueue, Operation, VectorClock } from './queue'
import { AwarenessManager } from './awareness-manager'
import type { Awareness } from '../awareness'

// Re-export types from queue for easier importing
export type { Operation, VectorClock } from './queue'

// ====================
// Configuration Types
// ====================

export interface SyncManagerConfig {
  /** WebSocket client instance for sync/delta traffic */
  websocket: WebSocketClient

  /** WebSocket client instance for awareness traffic (optional, uses main websocket if not provided) */
  awarenessWebsocket?: WebSocketClient

  /** Storage adapter for persistence */
  storage: StorageAdapter

  /** Offline queue instance */
  offlineQueue: OfflineQueue
}

// ====================
// State Types
// ====================

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

export interface DocumentSyncState {
  documentId: string
  state: SyncState
  lastSyncedAt: number | null
  error: string | null
  pendingOperations: number
}

// ====================
// Document Interface
// ====================

export interface SyncableDocument {
  getId(): string
  getVectorClock(): VectorClock
  setVectorClock(clock: VectorClock): void
  applyRemoteOperation(operation: Operation): void
}

// ====================
// Sync Manager
// ====================

export class SyncManager {
  private websocket: WebSocketClient
  private awarenessWebsocket: WebSocketClient  // Separate connection for awareness
  private offlineQueue: OfflineQueue
  private awarenessManager: AwarenessManager

  // Document subscriptions
  private subscriptions = new Set<string>()
  private documents = new Map<string, SyncableDocument>()

  // Sync state tracking
  private syncStates = new Map<string, DocumentSyncState>()
  private pendingOperations = new Map<string, Operation[]>()

  // Buffer for operations that arrive before documents are registered
  private bufferedOperations = new Map<string, Operation[]>()


  // Listeners
  private stateChangeListeners = new Map<string, Set<(state: DocumentSyncState) => void>>()

  // Delta batching (temporarily disabled)
  private deltaBatchQueue = new Map<string, Operation[]>()
  private deltaBatchTimers = new Map<string, NodeJS.Timeout>()
  private readonly DELTA_BATCH_DELAY = 50
  private readonly DELTA_BATCH_MAX_SIZE = 50

  constructor(config: SyncManagerConfig) {
    this.websocket = config.websocket
    // Use separate awareness websocket if provided, otherwise fall back to main websocket
    this.awarenessWebsocket = config.awarenessWebsocket ?? config.websocket
    this.offlineQueue = config.offlineQueue

    // Initialize awareness manager with its own dedicated websocket
    this.awarenessManager = new AwarenessManager({
      websocket: this.awarenessWebsocket,
    })

    this.setupMessageHandlers()
    this.setupConnectionHandlers()
  }

  /**
   * Register a document with the sync manager
   * Must be called before subscribing
   */
  registerDocument(document: SyncableDocument): void {
    const documentId = document.getId()
    // console.log('[SyncManager] Registering document:', documentId)
    this.documents.set(documentId, document)
    // console.log('[SyncManager] Total registered documents:', this.documents.size, 'IDs:', Array.from(this.documents.keys()))

    // Initialize sync state
    if (!this.syncStates.has(documentId)) {
      this.syncStates.set(documentId, {
        documentId,
        state: 'idle',
        lastSyncedAt: null,
        error: null,
        pendingOperations: 0,
      })
    }

    // Apply any buffered operations that arrived before registration
    const buffered = this.bufferedOperations.get(documentId)
    if (buffered && buffered.length > 0) {
      // console.log(`📦 [SyncManager] Applying ${buffered.length} buffered operations for ${documentId}`)
      for (const operation of buffered) {
        // console.log(`📦 [SyncManager] Applying buffered: ${operation.field}=${operation.value}`)
        document.applyRemoteOperation(operation)
        this.mergeVectorClocks(document, operation.clock)
      }
      // Clear the buffer
      this.bufferedOperations.delete(documentId)
      // console.log(`📦 [SyncManager] ✅ All buffered operations applied for ${documentId}`)
    }
  }

  /**
   * Unregister a document from sync manager
   */
  unregisterDocument(documentId: string): void {
    this.documents.delete(documentId)
    if (this.subscriptions.has(documentId)) {
      this.unsubscribeDocument(documentId)
    }
  }

  /**
   * Subscribe document to real-time sync
   * Requests initial state from server if not in local storage
   */
  async subscribeDocument(documentId: string): Promise<void> {
    // console.log('[SyncManager] subscribeDocument called for:', documentId)

    // Check if already subscribed
    if (this.subscriptions.has(documentId)) {
      // console.log('[SyncManager] Already subscribed to:', documentId)
      return
    }

    // If offline, defer subscription until reconnection
    if (!this.websocket.isConnected()) {
      // console.log('[SyncManager] Offline, deferring subscription for:', documentId)
      this.updateSyncState(documentId, {
        state: 'offline',
        error: null,
      })
      // Subscription will be attempted on reconnection
      return
    }

    // console.log('[SyncManager] Sending subscription request for:', documentId)

    // Update state
    this.updateSyncState(documentId, { state: 'syncing' })

    try {
      // Send subscription message to server
      this.websocket.send({
        type: 'subscribe',
        payload: { documentId },
        timestamp: Date.now(),
      })

      // Wait for sync response
      await this.waitForSyncResponse(documentId)

      // Mark as subscribed
      this.subscriptions.add(documentId)
      // console.log('[SyncManager] ✓ Subscribed to:', documentId, 'Total subscriptions:', this.subscriptions.size)
      this.updateSyncState(documentId, {
        state: 'synced',
        lastSyncedAt: Date.now(),
      })
    } catch (error) {
      console.error('[SyncManager] ❌ Subscription failed for:', documentId, error)
      this.updateSyncState(documentId, {
        state: 'error',
        error: String(error),
      })
      throw error
    }
  }

  /**
   * Unsubscribe document from sync
   * Does not delete local data
   */
  async unsubscribeDocument(documentId: string): Promise<void> {
    if (!this.subscriptions.has(documentId)) {
      return
    }

    if (this.websocket.isConnected()) {
      this.websocket.send({
        type: 'unsubscribe',
        payload: { documentId },
        timestamp: Date.now(),
      })
    }

    this.subscriptions.delete(documentId)
    this.updateSyncState(documentId, { state: 'idle' })
  }

  /**
   * Push local operation to server
   * Queues operation if offline
   */
  async pushOperation(operation: Operation): Promise<void> {
    const { documentId } = operation

    if (!this.deltaBatchQueue.has(documentId)) {
      this.deltaBatchQueue.set(documentId, [])
    }
    this.deltaBatchQueue.get(documentId)!.push(operation)

    const existingTimer = this.deltaBatchTimers.get(documentId)
    if (existingTimer) clearTimeout(existingTimer)

    const queueSize = this.deltaBatchQueue.get(documentId)!.length

    if (queueSize >= this.DELTA_BATCH_MAX_SIZE) {
      this.flushDeltaBatch(documentId)
      return
    }

    const timer = setTimeout(() => this.flushDeltaBatch(documentId), this.DELTA_BATCH_DELAY)
    this.deltaBatchTimers.set(documentId, timer)
  }

  private flushDeltaBatch(documentId: string): void {
    const batch = this.deltaBatchQueue.get(documentId)
    if (!batch || batch.length === 0) {
      return
    }

    const timer = this.deltaBatchTimers.get(documentId)
    if (timer) {
      clearTimeout(timer)
      this.deltaBatchTimers.delete(documentId)
    }

    const messageId = this.generateMessageId()

    this.websocket.send({
      type: 'delta_batch',
      payload: { documentId, deltas: batch, messageId },
      timestamp: Date.now(),
      id: messageId,
    })

    this.deltaBatchQueue.set(documentId, [])
    this.updateSyncState(documentId, { lastSyncedAt: Date.now() })
  }


  /**
   * Get sync state for document
   */
  getSyncState(documentId: string): DocumentSyncState {
    return (
      this.syncStates.get(documentId) || {
        documentId,
        state: 'idle',
        lastSyncedAt: null,
        error: null,
        pendingOperations: 0,
      }
    )
  }

  /**
   * Listen for sync state changes
   */
  onSyncStateChange(
    documentId: string,
    callback: (state: DocumentSyncState) => void
  ): Unsubscribe {
    if (!this.stateChangeListeners.has(documentId)) {
      this.stateChangeListeners.set(documentId, new Set())
    }

    this.stateChangeListeners.get(documentId)!.add(callback)

    return () => {
      const listeners = this.stateChangeListeners.get(documentId)
      if (listeners) {
        listeners.delete(callback)
      }
    }
  }

  /**
   * Request full sync for document
   * Useful for resolving conflicts or catching up
   */
  async requestSync(documentId: string): Promise<void> {
    if (!this.websocket.isConnected()) {
      throw new Error('WebSocket not connected')
    }

    this.updateSyncState(documentId, { state: 'syncing' })

    this.websocket.send({
      type: 'sync_request',
      payload: { documentId },
      timestamp: Date.now(),
    })

    await this.waitForSyncResponse(documentId)

    this.updateSyncState(documentId, {
      state: 'synced',
      lastSyncedAt: Date.now(),
    })
  }

  /**
   * Dispose sync manager
   * Unsubscribes all documents
   */
  dispose(): void {
    // Unsubscribe all documents
    for (const documentId of this.subscriptions) {
      this.unsubscribeDocument(documentId)
    }


    // Clear listeners
    this.stateChangeListeners.clear()
  }

  // ====================
  // Private Methods
  // ====================

  /**
   * Set up WebSocket message handlers
   */
  private setupMessageHandlers(): void {
    // Handle sync responses
    this.websocket.on('sync_response', (payload) => {
      this.handleSyncResponse(payload)
    })

    // Handle delta messages (remote operations)
    this.websocket.on('delta', (payload) => {
      this.handleRemoteOperation(payload)
    })

    // Handle delta_batch messages (including text operations from server)
    this.websocket.on('delta_batch', (payload) => {
      this.handleRemoteDeltaBatch(payload)
    })

    // Handle errors
    this.websocket.on('error', (payload) => {
      console.error('Server error:', payload)
    })
  }

  /**
   * Handle remote delta batch from server
   * This handles both document field updates and text CRDT operations
   */
  private handleRemoteDeltaBatch(payload: any): void {
    const { documentId, deltas, isTextOperation } = payload

    if (!deltas || !Array.isArray(deltas)) {
      console.warn('[SyncManager] Received invalid delta_batch:', payload)
      return
    }

    console.log(`[SyncManager] Received remote delta_batch for ${documentId}: ${deltas.length} operations (isText: ${isTextOperation})`)

    for (const operation of deltas) {
      // Handle text CRDT operations (state-based or legacy position-based)
      if (operation.type === 'text-state' || operation.type === 'text' || isTextOperation) {
        this.handleRemoteTextOperation(documentId, operation)
      } else {
        // Handle standard document field operations
        this.handleRemoteOperation({ ...operation, documentId })
      }
    }
  }

  /**
   * Handle remote text CRDT operation
   */
  private handleRemoteTextOperation(documentId: string, operation: any): void {
    const document = this.documents.get(documentId)

    if (!document) {
      console.log(`[SyncManager] Text document ${documentId} not registered, buffering operation`)
      // Buffer the operation for when the document is registered
      if (!this.bufferedOperations.has(documentId)) {
        this.bufferedOperations.set(documentId, [])
      }
      this.bufferedOperations.get(documentId)!.push(operation)
      return
    }

    // Log the operation type and relevant fields for debugging
    console.log(`[SyncManager] Applying remote text operation to ${documentId}:`, {
      type: operation.type,
      hasState: !!operation.state,
      clientId: operation.clientId,
      stateLength: operation.state?.length
    })

    // Apply the text operation
    document.applyRemoteOperation(operation)

    // Merge vector clocks if present
    if (operation.clock) {
      this.mergeVectorClocks(document, operation.clock)
    }
  }

  /**
   * Set up connection state handlers
   */
  private setupConnectionHandlers(): void {
    this.websocket.onStateChange((state) => {
      if (state === 'connected') {
        this.handleConnectionRestored()
      } else if (state === 'disconnected' || state === 'reconnecting') {
        this.handleConnectionLost()
      } else if (state === 'failed') {
        this.handleConnectionFailed()
      }
    })
  }

  /**
   * Handle connection restored
   */
  private handleConnectionRestored(): void {
    // console.log(`[SyncManager] 🔄 Connection restored! Starting reconnection flow...`)

    // Get all registered document IDs (includes offline-created docs)
    const allDocumentIds = Array.from(this.documents.keys())
    // console.log(`[SyncManager] 🔄 Registered documents:`, allDocumentIds)

    // Mark all documents as syncing
    for (const documentId of allDocumentIds) {
      this.updateSyncState(documentId, { state: 'syncing' })
    }

    // Subscribe all registered documents (re-subscribe + new offline docs)
    for (const documentId of allDocumentIds) {
      // Clear from subscriptions first to allow re-subscription
      this.subscriptions.delete(documentId)

      this.subscribeDocument(documentId).catch((error) => {
        console.error(`Failed to subscribe ${documentId}:`, error)
      })
    }

    // Check queue stats before replay
    // const queueStats = this.offlineQueue.getStats()
    // console.log(`[SyncManager] 🔄 Offline queue stats before replay:`, queueStats)

    // Replay offline queue
    this.offlineQueue
      .replay((op) => {
        // console.log(`[SyncManager] 🔄 Replaying operation:`, op.documentId, op.field, op.value)
        return this.pushOperation(op) // Force send, bypassing offline check
      })
      .then((_count) => {
        // console.log(`[SyncManager] ✅ Replay complete! Sent ${_count} operations`)
      })
      .catch((error) => {
        console.error('[SyncManager] ❌ Failed to replay offline queue:', error)
      })
  }

  /**
   * Handle connection lost
   */
  private handleConnectionLost(): void {
    // Mark all documents as offline
    for (const documentId of this.subscriptions) {
      this.updateSyncState(documentId, { state: 'offline' })
    }
  }

  /**
   * Handle connection permanently failed
   */
  private handleConnectionFailed(): void {
    // Mark all documents as error
    for (const documentId of this.subscriptions) {
      this.updateSyncState(documentId, {
        state: 'error',
        error: 'Connection failed',
      })
    }
  }

  /**
   * Handle sync response from server
   */
  private handleSyncResponse(payload: any): void {
    const { documentId, state, clock } = payload

    const document = this.documents.get(documentId)
    if (!document) {
      console.warn(`Received sync response for unknown document: ${documentId}`)
      return
    }

    // Apply server state if provided
    if (state) {
      // Server sent full state, apply it
      // (This would need document-specific handling)
    }

    // Merge vector clocks
    if (clock) {
      this.mergeVectorClocks(document, clock)
    }
  }

  /**
   * Handle remote operation from server
   */
  private handleRemoteOperation(payload: any): void {
    const operation: Operation = payload
    const { documentId } = operation

    // console.log('[SyncManager] Received remote operation for document:', documentId, 'field:', operation.field, 'value:', operation.value)
    // console.log('[SyncManager] Registered documents:', Array.from(this.documents.keys()))

    const document = this.documents.get(documentId)
    if (!document) {
      console.warn(`❌ [SyncManager] Received operation for UNREGISTERED document: ${documentId}`)
      console.warn(`❌ [SyncManager] Available documents:`, Array.from(this.documents.keys()))

      // Buffer the operation for later application when document registers
      // console.log(`📦 [SyncManager] Buffering operation for later: ${documentId} ${operation.field}=${operation.value}`)
      const buffered = this.bufferedOperations.get(documentId) || []
      buffered.push(operation)
      this.bufferedOperations.set(documentId, buffered)
      // console.log(`📦 [SyncManager] Buffered operations for ${documentId}:`, buffered.length)
      return
    }

    // Trust the server's authoritative value - the server has already resolved
    // any conflicts using LWW, so we should always apply remote operations.
    // This ensures real-time collaborative editing works correctly.
    document.applyRemoteOperation(operation)

    // Clear any pending local operations for this field since the server
    // has given us the authoritative value
    const pendingOps = this.pendingOperations.get(documentId)
    if (pendingOps) {
      const filteredOps = pendingOps.filter(op => op.field !== operation.field)
      if (filteredOps.length > 0) {
        this.pendingOperations.set(documentId, filteredOps)
      } else {
        this.pendingOperations.delete(documentId)
      }
    }

    // Merge vector clocks
    this.mergeVectorClocks(document, operation.clock)

    // Update sync state
    this.updateSyncState(documentId, { lastSyncedAt: Date.now() })
  }

  /**
   * Merge vector clocks
   */
  private mergeVectorClocks(document: SyncableDocument, remoteClock: VectorClock): void {
    const localClock = document.getVectorClock()

    // Merge: take max for each client
    const merged: VectorClock = { ...localClock }

    for (const clientId in remoteClock) {
      const local = merged[clientId] ?? 0
      const remote = remoteClock[clientId] ?? 0
      merged[clientId] = Math.max(local, remote)
    }

    document.setVectorClock(merged)
  }

  /**
   * Wait for sync response
   */
  private waitForSyncResponse(documentId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.websocket.off('sync_response', handler)
        reject(new Error('Sync response timeout'))
      }, 10000) // 10 second timeout

      const handler = (payload: any) => {
        if (payload.documentId === documentId) {
          clearTimeout(timeout)
          this.websocket.off('sync_response', handler)
          resolve()
        }
      }

      this.websocket.on('sync_response', handler)
    })
  }

  /**
   * Wait for ACK with timeout
   */

  /**
   * Update sync state
   */
  private updateSyncState(
    documentId: string,
    updates: Partial<DocumentSyncState>
  ): void {
    const current = this.getSyncState(documentId)
    const updated = { ...current, ...updates }

    this.syncStates.set(documentId, updated)

    // Notify listeners
    const listeners = this.stateChangeListeners.get(documentId)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(updated)
        } catch (error) {
          console.error('Sync state listener error:', error)
        }
      }
    }
  }

  /**
   * Increment pending operations count
   */

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 15)
    return `msg-${timestamp}-${random}`
  }

  // ====================
  // Awareness Methods
  // ====================

  /**
   * Register awareness instance for a document
   */
  registerAwareness(documentId: string, awareness: Awareness): void {
    this.awarenessManager.registerAwareness(documentId, awareness)

    // Set up onChange callback to automatically broadcast updates to server
    // Throttle awareness updates to max 10/second to prevent flooding
    let lastAwarenessUpdate = 0
    const AWARENESS_THROTTLE_MS = 100

    awareness.setOnChange((update) => {
      const now = Date.now()
      if (now - lastAwarenessUpdate >= AWARENESS_THROTTLE_MS) {
        lastAwarenessUpdate = now
        this.awarenessWebsocket.send({
          type: 'awareness_update',
          payload: {
            documentId,
            clientId: update.client_id,
            state: update.state,
            clock: update.clock,
          },
          timestamp: Date.now(),
        })
      }
    })
  }

  /**
   * Subscribe to awareness for a document
   */
  async subscribeToAwareness(documentId: string): Promise<void> {
    await this.awarenessManager.subscribeToAwareness(documentId)
  }

  /**
   * Broadcast local awareness state to other clients
   */
  async broadcastAwarenessState(documentId: string, state: Record<string, unknown>): Promise<void> {
    await this.awarenessManager.broadcastLocalState(documentId, state)
  }

  /**
   * Send leave update when disconnecting
   */
  async sendAwarenessLeave(documentId: string): Promise<void> {
    await this.awarenessManager.sendLeaveUpdate(documentId)
  }

  /**
   * Get awareness manager instance
   */
  getAwarenessManager(): AwarenessManager {
    return this.awarenessManager
  }
}
