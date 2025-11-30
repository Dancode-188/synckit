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

// Re-export types from queue for easier importing
export type { Operation, VectorClock } from './queue'

// ====================
// Configuration Types
// ====================

export interface SyncManagerConfig {
  /** WebSocket client instance */
  websocket: WebSocketClient

  /** Storage adapter for persistence */
  storage: StorageAdapter

  /** Offline queue instance */
  offlineQueue: OfflineQueue

  /** Client ID for this client */
  clientId: string
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
// Conflict Types
// ====================

interface Conflict {
  local: Operation
  remote: Operation
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
  private offlineQueue: OfflineQueue

  // Document subscriptions
  private subscriptions = new Set<string>()
  private documents = new Map<string, SyncableDocument>()

  // Sync state tracking
  private syncStates = new Map<string, DocumentSyncState>()
  private pendingOperations = new Map<string, Operation[]>()

  // Buffer for operations that arrive before documents are registered
  private bufferedOperations = new Map<string, Operation[]>()

  // ACK tracking
  private pendingAcks = new Map<string, { operation: Operation; timeout: NodeJS.Timeout }>()
  private readonly ACK_TIMEOUT = 5000 // 5 seconds

  // Listeners
  private stateChangeListeners = new Map<string, Set<(state: DocumentSyncState) => void>>()

  constructor(config: SyncManagerConfig) {
    this.websocket = config.websocket
    this.offlineQueue = config.offlineQueue

    this.setupMessageHandlers()
    this.setupConnectionHandlers()
  }

  /**
   * Register a document with the sync manager
   * Must be called before subscribing
   */
  registerDocument(document: SyncableDocument): void {
    const documentId = document.getId()
    console.log('[SyncManager] Registering document:', documentId)
    this.documents.set(documentId, document)
    console.log('[SyncManager] Total registered documents:', this.documents.size, 'IDs:', Array.from(this.documents.keys()))

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
      console.log(`📦 [SyncManager] Applying ${buffered.length} buffered operations for ${documentId}`)
      for (const operation of buffered) {
        console.log(`📦 [SyncManager] Applying buffered: ${operation.field}=${operation.value}`)
        document.applyRemoteOperation(operation)
        this.mergeVectorClocks(document, operation.clock)
      }
      // Clear the buffer
      this.bufferedOperations.delete(documentId)
      console.log(`📦 [SyncManager] ✅ All buffered operations applied for ${documentId}`)
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
    console.log('[SyncManager] subscribeDocument called for:', documentId)

    // Check if already subscribed
    if (this.subscriptions.has(documentId)) {
      console.log('[SyncManager] Already subscribed to:', documentId)
      return
    }

    // If offline, defer subscription until reconnection
    if (!this.websocket.isConnected()) {
      console.log('[SyncManager] Offline, deferring subscription for:', documentId)
      this.updateSyncState(documentId, {
        state: 'offline',
        error: null,
      })
      // Subscription will be attempted on reconnection
      return
    }

    console.log('[SyncManager] Sending subscription request for:', documentId)

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
      console.log('[SyncManager] ✓ Subscribed to:', documentId, 'Total subscriptions:', this.subscriptions.size)
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
  async pushOperation(operation: Operation, forceSend = false): Promise<void> {
    const { documentId } = operation

    // Increment pending count
    this.incrementPendingOperations(documentId)

    try {
      if (forceSend || this.websocket.isConnected()) {
        // Send immediately
        console.log(`[SyncManager] 📤 Sending operation ${forceSend ? '(FORCED)' : 'online'}:`, documentId, operation.field, operation.value)
        const messageId = this.generateMessageId()

        this.websocket.send({
          type: 'delta',
          payload: { ...operation, messageId },
          timestamp: Date.now(),
        })

        // Wait for ACK
        await this.waitForAck(messageId, operation)

        // Decrement pending count
        this.decrementPendingOperations(documentId)
        this.updateSyncState(documentId, { lastSyncedAt: Date.now() })
      } else {
        // Queue for offline replay
        console.log(`[SyncManager] 💾 Queuing operation (OFFLINE):`, documentId, operation.field, operation.value)
        await this.offlineQueue.enqueue(operation)
        const stats = this.offlineQueue.getStats()
        console.log(`[SyncManager] 💾 Queue stats:`, stats)
        this.updateSyncState(documentId, { state: 'offline' })
        this.decrementPendingOperations(documentId)
      }
    } catch (error) {
      // On error, also queue for retry
      console.log(`[SyncManager] ❌ Error sending operation, queuing:`, documentId, error)
      await this.offlineQueue.enqueue(operation)
      this.decrementPendingOperations(documentId)
      throw error
    }
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

    // Clear all pending ACKs
    for (const [, { timeout }] of this.pendingAcks) {
      clearTimeout(timeout)
    }
    this.pendingAcks.clear()

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

    // Handle ACK messages
    this.websocket.on('ack', (payload) => {
      this.handleAck(payload)
    })

    // Handle errors
    this.websocket.on('error', (payload) => {
      console.error('Server error:', payload)
    })
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
    console.log(`[SyncManager] 🔄 Connection restored! Starting reconnection flow...`)

    // Get all registered document IDs (includes offline-created docs)
    const allDocumentIds = Array.from(this.documents.keys())
    console.log(`[SyncManager] 🔄 Registered documents:`, allDocumentIds)

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
    const queueStats = this.offlineQueue.getStats()
    console.log(`[SyncManager] 🔄 Offline queue stats before replay:`, queueStats)

    // Replay offline queue
    this.offlineQueue
      .replay((op) => {
        console.log(`[SyncManager] 🔄 Replaying operation:`, op.documentId, op.field, op.value)
        return this.pushOperation(op, true) // Force send, bypassing offline check
      })
      .then((count) => {
        console.log(`[SyncManager] ✅ Replay complete! Sent ${count} operations`)
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

    console.log('[SyncManager] Received remote operation for document:', documentId, 'field:', operation.field, 'value:', operation.value)
    console.log('[SyncManager] Registered documents:', Array.from(this.documents.keys()))

    const document = this.documents.get(documentId)
    if (!document) {
      console.warn(`❌ [SyncManager] Received operation for UNREGISTERED document: ${documentId}`)
      console.warn(`❌ [SyncManager] Available documents:`, Array.from(this.documents.keys()))

      // Buffer the operation for later application when document registers
      console.log(`📦 [SyncManager] Buffering operation for later: ${documentId} ${operation.field}=${operation.value}`)
      const buffered = this.bufferedOperations.get(documentId) || []
      buffered.push(operation)
      this.bufferedOperations.set(documentId, buffered)
      console.log(`📦 [SyncManager] Buffered operations for ${documentId}:`, buffered.length)
      return
    }

    console.log('[SyncManager] ✓ Document found, applying remote operation')

    // Check for conflict
    const localOps = this.pendingOperations.get(documentId) || []
    const conflict = this.detectConflict(document, localOps, operation)

    if (conflict) {
      // Resolve using LWW
      const resolution = this.resolveLWW(conflict.local, operation)

      if (resolution === 'remote') {
        // Apply remote operation
        document.applyRemoteOperation(operation)
      } else {
        // Keep local, re-send our version to server
        this.pushOperation(conflict.local).catch((error) => {
          console.error('Failed to re-send local operation:', error)
        })
      }
    } else {
      // No conflict, apply directly
      document.applyRemoteOperation(operation)
    }

    // Merge vector clocks
    this.mergeVectorClocks(document, operation.clock)

    // Update sync state
    this.updateSyncState(documentId, { lastSyncedAt: Date.now() })
  }

  /**
   * Handle ACK message
   */
  private handleAck(payload: any): void {
    const { messageId } = payload

    const pending = this.pendingAcks.get(messageId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingAcks.delete(messageId)
    }
  }

  /**
   * Detect conflict between local and remote operations
   */
  private detectConflict(
    document: SyncableDocument,
    localOps: Operation[],
    remoteOp: Operation
  ): Conflict | null {
    // Find local operation on same field
    const localOp = localOps.find(
      (op) => op.field === remoteOp.field && op.type === remoteOp.type
    )

    if (!localOp) {
      return null // No conflict
    }

    // Check causality using vector clocks
    const localClock = document.getVectorClock()
    const remoteClock = remoteOp.clock

    const localHappensAfterRemote = this.happensAfter(localClock, remoteClock)
    const remoteHappensAfterLocal = this.happensAfter(remoteClock, localClock)

    if (localHappensAfterRemote || remoteHappensAfterLocal) {
      // Causal relationship, no conflict
      return null
    }

    // Concurrent operations on same field = conflict
    return {
      local: localOp,
      remote: remoteOp,
    }
  }

  /**
   * Check if clock A happens after clock B
   */
  private happensAfter(clockA: VectorClock, clockB: VectorClock): boolean {
    let greater = false

    // Check all clients in A
    for (const clientId in clockA) {
      const a = clockA[clientId] ?? 0
      const b = clockB[clientId] ?? 0

      if (a > b) {
        greater = true
      } else if (a < b) {
        return false // B happened after A
      }
    }

    // Check all clients in B that aren't in A
    for (const clientId in clockB) {
      if (!(clientId in clockA)) {
        const b = clockB[clientId] ?? 0
        if (b > 0) {
          return false // B has events A doesn't know about
        }
      }
    }

    return greater
  }

  /**
   * Resolve conflict using Last-Write-Wins
   */
  private resolveLWW(localOp: Operation, remoteOp: Operation): 'local' | 'remote' {
    // Compare timestamps
    if (localOp.timestamp !== remoteOp.timestamp) {
      return localOp.timestamp > remoteOp.timestamp ? 'local' : 'remote'
    }

    // Timestamps equal, use client ID as tiebreaker
    return localOp.clientId > remoteOp.clientId ? 'local' : 'remote'
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
  private waitForAck(messageId: string, operation: Operation): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(messageId)
        reject(new Error('ACK timeout'))
      }, this.ACK_TIMEOUT)

      this.pendingAcks.set(messageId, { operation, timeout })

      // Listen for ACK
      const checkAck = () => {
        if (!this.pendingAcks.has(messageId)) {
          resolve()
        } else {
          setTimeout(checkAck, 100)
        }
      }
      checkAck()
    })
  }

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
  private incrementPendingOperations(documentId: string): void {
    const state = this.getSyncState(documentId)
    this.updateSyncState(documentId, {
      pendingOperations: state.pendingOperations + 1,
    })
  }

  /**
   * Decrement pending operations count
   */
  private decrementPendingOperations(documentId: string): void {
    const state = this.getSyncState(documentId)
    this.updateSyncState(documentId, {
      pendingOperations: Math.max(0, state.pendingOperations - 1),
    })
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 15)
    return `msg-${timestamp}-${random}`
  }
}
