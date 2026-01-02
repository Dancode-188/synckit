/**
 * SyncDocument - Type-safe document wrapper
 * Provides a high-level API over the WASM document primitive
 * @module document
 */

import type {
  SubscriptionCallback,
  Unsubscribe,
  StorageAdapter,
  StoredDocument
} from './types'
import { DocumentError } from './types'
import type { WasmDocument } from './wasm-loader'
import { initWASM } from './wasm-loader'
import type { SyncManager, SyncableDocument, Operation, VectorClock } from './sync/manager'

export class SyncDocument<T extends Record<string, unknown> = Record<string, unknown>>
  implements SyncableDocument {
  private wasmDoc: WasmDocument | null = null
  private subscribers = new Set<SubscriptionCallback<T>>()
  private data: T = {} as T
  private vectorClock: VectorClock = {}

  constructor(
    private readonly id: string,
    private readonly clientId: string,
    private readonly storage?: StorageAdapter,
    private readonly syncManager?: SyncManager
  ) {}
  
  /**
   * Initialize the document (loads from storage if available)
   */
  async init(): Promise<void> {
    // Skip if already initialized
    if (this.wasmDoc) {
      return
    }

    const wasm = await initWASM()
    this.wasmDoc = new wasm.WasmDocument(this.id)

    // Load from storage if available
    if (this.storage) {
      const stored = await this.storage.get(this.id)
      if (stored) {
        this.loadFromStored(stored)
      }
    }

    this.updateLocalState()

    // Register with sync manager if available
    if (this.syncManager) {
      this.syncManager.registerDocument(this)
      // Subscribe to server updates for real-time sync
      await this.syncManager.subscribeDocument(this.id)
      // Subscribe to awareness for presence synchronization
      await this.syncManager.subscribeToAwareness(this.id)
    }
  }
  
  /**
   * Get the current document data
   */
  get(): T {
    return { ...this.data }
  }
  
  /**
   * Get a single field value
   */
  getField<K extends keyof T>(field: K): T[K] | undefined {
    return this.data[field]
  }
  
  /**
   * Set a single field value
   */
  async set<K extends keyof T>(field: K, value: T[K]): Promise<void> {
    if (!this.wasmDoc) {
      throw new DocumentError('Document not initialized')
    }

    // Increment vector clock for this client
    const newCount = (this.vectorClock[this.clientId] || 0) + 1
    this.vectorClock[this.clientId] = newCount
    const clock = BigInt(newCount)

    // Update WASM document
    const valueJson = JSON.stringify(value)
    this.wasmDoc.setField(
      String(field),
      valueJson,
      clock,
      this.clientId
    )

    // Update local state
    this.updateLocalState()

    // Save to storage
    await this.persist()

    // Notify subscribers
    this.notifySubscribers()

    // Push to sync manager if available
    if (this.syncManager) {
      const operation: Operation = {
        type: 'set',
        documentId: this.id,
        field: String(field),
        value,
        clock: { ...this.vectorClock },
        clientId: this.clientId,
        timestamp: Date.now(),
      }
      await this.syncManager.pushOperation(operation)
    }
  }
  
  /**
   * Update multiple fields at once
   */
  async update(updates: Partial<T>): Promise<void> {
    if (!this.wasmDoc) {
      throw new DocumentError('Document not initialized')
    }

    // Apply all updates
    const operations: Operation[] = []
    for (const [field, value] of Object.entries(updates)) {
      // Increment vector clock for this client
      const newCount = (this.vectorClock[this.clientId] || 0) + 1
      this.vectorClock[this.clientId] = newCount
      const clock = BigInt(newCount)

      const valueJson = JSON.stringify(value)
      this.wasmDoc.setField(field, valueJson, clock, this.clientId)

      // Prepare operation for sync
      if (this.syncManager) {
        operations.push({
          type: 'set',
          documentId: this.id,
          field,
          value,
          clock: { ...this.vectorClock },
          clientId: this.clientId,
          timestamp: Date.now(),
        })
      }
    }

    // Update local state
    this.updateLocalState()

    // Save to storage
    await this.persist()

    // Notify subscribers
    this.notifySubscribers()

    // Push operations to sync manager
    if (this.syncManager) {
      for (const op of operations) {
        await this.syncManager.pushOperation(op)
      }
    }
  }
  
  /**
   * Delete a field
   */
  async delete<K extends keyof T>(field: K): Promise<void> {
    if (!this.wasmDoc) {
      throw new DocumentError('Document not initialized')
    }
    
    this.wasmDoc.deleteField(String(field))
    this.updateLocalState()
    await this.persist()
    this.notifySubscribers()
  }
  
  /**
   * Subscribe to document changes
   */
  subscribe(callback: SubscriptionCallback<T>): Unsubscribe {
    this.subscribers.add(callback)
    
    // Immediately call with current state
    callback(this.get())
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback)
    }
  }
  
  /**
   * Merge with another document
   */
  async merge(other: SyncDocument<T>): Promise<void> {
    if (!this.wasmDoc || !other.wasmDoc) {
      throw new DocumentError('Documents not initialized')
    }
    
    this.wasmDoc.merge(other.wasmDoc)
    this.updateLocalState()
    await this.persist()
    this.notifySubscribers()
  }
  
  /**
   * Export as JSON
   */
  toJSON(): T {
    if (!this.wasmDoc) {
      return this.data
    }
    
    const json = this.wasmDoc.toJSON()
    return JSON.parse(json) as T
  }
  
  /**
   * Get document ID
   */
  getId(): string {
    return this.id
  }
  
  /**
   * Get field count
   */
  getFieldCount(): number {
    return this.wasmDoc?.fieldCount() ?? 0
  }
  
  // Private methods
  
  private updateLocalState(): void {
    if (!this.wasmDoc) return
    
    const json = this.wasmDoc.toJSON()
    this.data = JSON.parse(json) as T
  }
  
  private notifySubscribers(): void {
    const currentData = this.get()
    this.subscribers.forEach(callback => {
      try {
        callback(currentData)
      } catch (error) {
        console.error('Error in subscription callback:', error)
      }
    })
  }
  
  private async persist(): Promise<void> {
    if (!this.storage || !this.wasmDoc) return

    const stored: StoredDocument = {
      id: this.id,
      data: this.data,
      version: this.vectorClock,
      updatedAt: Date.now()
    }

    await this.storage.set(this.id, stored)
  }

  private loadFromStored(stored: StoredDocument): void {
    if (!this.wasmDoc) return

    // Load vector clock
    this.vectorClock = { ...stored.version }

    // Reconstruct document from stored data
    for (const [field, value] of Object.entries(stored.data)) {
      const clock = BigInt(stored.version[this.clientId] || 0)
      this.wasmDoc.setField(field, JSON.stringify(value), clock, this.clientId)
    }

    this.updateLocalState()
  }
  
  /**
   * Cleanup (call when document is no longer needed)
   */
  dispose(): void {
    // Unregister from sync manager
    if (this.syncManager) {
      this.syncManager.unregisterDocument(this.id)
      // Unregister awareness
      this.syncManager.getAwarenessManager().unregisterAwareness(this.id)
    }

    this.subscribers.clear()
    if (this.wasmDoc) {
      this.wasmDoc.free()
      this.wasmDoc = null
    }
  }

  // ====================
  // SyncableDocument Interface
  // ====================

  /**
   * Get vector clock (required by SyncableDocument)
   */
  getVectorClock(): VectorClock {
    return { ...this.vectorClock }
  }

  /**
   * Set vector clock (required by SyncableDocument)
   */
  setVectorClock(clock: VectorClock): void {
    this.vectorClock = { ...clock }
  }

  /**
   * Apply remote operation (required by SyncableDocument)
   */
  applyRemoteOperation(operation: Operation): void {
    if (!this.wasmDoc) {
      console.warn('Cannot apply remote operation: document not initialized')
      return
    }

    // console.log(`[Document] applyRemoteOperation for ${this.id}, field: ${operation.field}, value:`, operation.value)
    // console.log(`[Document] Current state before apply:`, this.data)
    // console.log(`[Document] Current vector clock:`, JSON.stringify(this.vectorClock))
    // console.log(`[Document] Remote vector clock:`, JSON.stringify(operation.clock))
    // console.log(`[Document] Remote clientId:`, operation.clientId)

    // Merge vector clocks
    for (const [clientId, count] of Object.entries(operation.clock)) {
      this.vectorClock[clientId] = Math.max(
        this.vectorClock[clientId] || 0,
        count as number
      )
    }

    // console.log(`[Document] Merged vector clock:`, JSON.stringify(this.vectorClock))

    // Apply the operation
    // Remote operations from server may not have 'type' field, but they're always 'set' operations
    if (operation.field) {
      // Use the maximum clock value from the vector clock as the operation's timestamp
      // The server may set clientId to "server", but the actual clock is the max across all clients
      const maxClock = Math.max(...Object.values(operation.clock).map(c => Number(c)))
      const clock = BigInt(maxClock)
      const valueJson = JSON.stringify(operation.value)
      // console.log(`[Document] Max clock from vector clock: ${maxClock} (from ${Object.keys(operation.clock).length} clients)`)
      // console.log(`[Document] Calling wasmDoc.setField("${operation.field}", ${valueJson}, ${clock}, "${operation.clientId}")`)
      this.wasmDoc.setField(operation.field, valueJson, clock, operation.clientId)
      // console.log(`[Document] ✓ setField completed`)
    }

    // Update local state
    // console.log(`[Document] Calling updateLocalState()...`)
    this.updateLocalState()
    // console.log(`[Document] State after updateLocalState():`, this.data)

    // Persist changes
    this.persist().catch(error => {
      console.error('Failed to persist remote operation:', error)
    })

    // Notify subscribers
    // console.log(`[Document] Notifying ${this.subscribers.size} subscribers...`)
    this.notifySubscribers()
  }
}
