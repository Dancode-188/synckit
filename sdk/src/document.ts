/**
 * SyncDocument - Type-safe document wrapper
 * Provides a high-level API over the WASM document primitive
 * @module document
 */

import type {
  SubscriptionCallback,
  Unsubscribe,
  StorageAdapter,
  StoredDocument,
  SnapshotMetadata,
  SnapshotOptions,
  AutoSnapshotConfig
} from './types'
import { DocumentError } from './types'
import type { WasmDocument } from './wasm-loader'
import { initWASM } from './wasm-loader'
import type { SyncManager, SyncableDocument, Operation, VectorClock } from './sync/manager'
import { SnapshotScheduler } from './snapshot-scheduler'

export class SyncDocument<T extends Record<string, unknown> = Record<string, unknown>>
  implements SyncableDocument {
  private wasmDoc: WasmDocument | null = null
  private subscribers = new Set<SubscriptionCallback<T>>()
  private data: T = {} as T
  private vectorClock: VectorClock = {}
  private storageUnsubscribe?: () => void
  private snapshotScheduler?: SnapshotScheduler

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

    // Subscribe to storage changes from other tabs (for multi-tab sync)
    if (this.storage?.onChange) {
      this.storageUnsubscribe = this.storage.onChange((change) => {
        // Only react to changes for this specific document
        if (change.docId === this.id && change.type === 'set') {
          // Reload document from storage asynchronously
          this.storage!.get(this.id).then(stored => {
            if (stored && this.wasmDoc) {
              this.loadFromStored(stored)
              this.updateLocalState()
              this.notifySubscribers()
            }
          }).catch(error => {
            console.error(`Failed to reload document ${this.id} after storage change:`, error)
          })
        }
      })
    }

    this.updateLocalState()
    this.notifySubscribers()

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

    // Record operation for snapshot scheduler
    this.snapshotScheduler?.recordOperation()

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

    // Record operations for snapshot scheduler
    for (let i = 0; i < Object.keys(updates).length; i++) {
      this.snapshotScheduler?.recordOperation()
    }

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

    // Record operation for snapshot scheduler
    this.snapshotScheduler?.recordOperation()
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

    // Find the highest clock value across all clients
    let maxClock = 0
    for (const [, clock] of Object.entries(stored.version)) {
      if (clock > maxClock) {
        maxClock = clock
      }
    }

    // Load data using current client ID with a clock higher than all stored clocks
    // This ensures: (1) WASM doc accepts it as newer, (2) vector clock stays consistent
    const loadClock = BigInt(maxClock + 1)
    this.vectorClock[this.clientId] = maxClock + 1

    // Reconstruct document from stored data
    for (const [field, value] of Object.entries(stored.data)) {
      const valueJson = JSON.stringify(value)
      this.wasmDoc.setField(field, valueJson, loadClock, this.clientId)
    }

    this.updateLocalState()
  }
  
  // ====================
  // Snapshot Methods
  // ====================

  /**
   * Create a snapshot of the current document state
   *
   * This creates an explicit snapshot of the document and stores it in storage.
   * The snapshot includes the current data and vector clock state.
   *
   * @param options - Optional snapshot configuration
   * @returns Metadata about the created snapshot
   *
   * @example
   * ```typescript
   * // Create a simple snapshot
   * const metadata = await doc.snapshot()
   * console.log(`Snapshot size: ${metadata.sizeBytes} bytes`)
   *
   * // Create a compressed snapshot
   * const compressed = await doc.snapshot({ compress: true })
   * ```
   */
  async snapshot(options?: SnapshotOptions): Promise<SnapshotMetadata> {
    if (!this.wasmDoc) {
      throw new DocumentError('Document not initialized')
    }

    if (!this.storage) {
      throw new DocumentError('Storage not available for snapshots')
    }

    const snapshot: StoredDocument = {
      id: this.id,
      data: this.data,
      version: this.vectorClock,
      updatedAt: Date.now()
    }

    // Calculate size before any compression
    const snapshotJson = JSON.stringify(snapshot)
    const sizeBytes = new Blob([snapshotJson]).size

    // Determine storage key
    const key = options?.key ?? `${this.id}:snapshot`

    // Store the snapshot (compression would go here if implemented)
    if (options?.compress) {
      // TODO: Implement compression in future phase
      // For now, just store as-is and mark as compressed=false
      await this.storage.set(key, snapshot)
    } else {
      await this.storage.set(key, snapshot)
    }

    return {
      documentId: this.id,
      version: { ...this.vectorClock },
      timestamp: snapshot.updatedAt,
      sizeBytes,
      compressed: options?.compress ?? false
    }
  }

  /**
   * Load document state from a snapshot
   *
   * This replaces the current document state with the state from a snapshot.
   * Useful for restoring from a previous state or recovering from errors.
   *
   * @param snapshotKey - Optional key of the snapshot to load (defaults to `${docId}:snapshot`)
   *
   * @example
   * ```typescript
   * // Load from default snapshot
   * await doc.loadFromSnapshot()
   *
   * // Load from custom snapshot key
   * await doc.loadFromSnapshot('my-doc:backup-2024')
   * ```
   */
  async loadFromSnapshot(snapshotKey?: string): Promise<void> {
    if (!this.wasmDoc) {
      throw new DocumentError('Document not initialized')
    }

    if (!this.storage) {
      throw new DocumentError('Storage not available for loading snapshots')
    }

    const key = snapshotKey ?? `${this.id}:snapshot`
    const snapshot = await this.storage.get(key)

    if (!snapshot) {
      throw new DocumentError(`Snapshot not found: ${key}`)
    }

    // Clear existing fields before loading snapshot
    // This ensures the document matches the snapshot exactly
    const currentFields = this.toJSON()
    for (const fieldPath of Object.keys(currentFields)) {
      this.wasmDoc.deleteField(fieldPath)
    }

    // Load the snapshot using existing loadFromStored method
    this.loadFromStored(snapshot)

    // Update local state and notify subscribers
    this.updateLocalState()
    this.notifySubscribers()
  }

  /**
   * Get the size of the current document in bytes
   * Useful for monitoring document growth and deciding when to snapshot
   */
  getDocumentSize(): number {
    const documentJson = JSON.stringify({
      data: this.data,
      version: this.vectorClock
    })
    return new Blob([documentJson]).size
  }

  // ====================
  // Automatic Snapshot Methods
  // ====================

  /**
   * Enable automatic snapshot scheduling
   *
   * Automatically creates snapshots based on configurable triggers:
   * - Document size threshold
   * - Time interval
   * - Operation count
   *
   * @param config - Configuration for automatic snapshots
   *
   * @example
   * ```typescript
   * // Enable automatic snapshots with default settings
   * doc.enableAutoSnapshot()
   *
   * // Customize snapshot triggers
   * doc.enableAutoSnapshot({
   *   sizeThresholdBytes: 5 * 1024 * 1024,  // 5 MB
   *   timeIntervalMs: 30 * 60 * 1000,       // 30 minutes
   *   operationCount: 500,                  // Every 500 operations
   *   maxSnapshots: 10                      // Keep 10 snapshots
   * })
   * ```
   */
  enableAutoSnapshot(config: AutoSnapshotConfig = {}): void {
    if (!this.storage) {
      throw new DocumentError('Storage not available for automatic snapshots')
    }

    // Stop existing scheduler if any
    this.snapshotScheduler?.stop()

    // Create new scheduler with provided config
    this.snapshotScheduler = new SnapshotScheduler(this, this.storage, {
      enabled: true,
      ...config
    })

    // Start the scheduler
    this.snapshotScheduler.start()
  }

  /**
   * Disable automatic snapshot scheduling
   */
  disableAutoSnapshot(): void {
    this.snapshotScheduler?.stop()
    this.snapshotScheduler = undefined
  }

  /**
   * Update automatic snapshot configuration
   */
  updateAutoSnapshotConfig(config: Partial<AutoSnapshotConfig>): void {
    if (!this.snapshotScheduler) {
      throw new DocumentError('Automatic snapshots not enabled')
    }

    this.snapshotScheduler.updateConfig(config)
  }

  /**
   * Get automatic snapshot scheduler statistics
   */
  getAutoSnapshotStats() {
    if (!this.snapshotScheduler) {
      return null
    }

    return this.snapshotScheduler.getStats()
  }

  /**
   * Manually trigger an automatic snapshot
   */
  async triggerAutoSnapshot(): Promise<SnapshotMetadata | null> {
    if (!this.snapshotScheduler) {
      throw new DocumentError('Automatic snapshots not enabled')
    }

    return this.snapshotScheduler.triggerSnapshot()
  }

  /**
   * List all automatic snapshots for this document
   */
  async listAutoSnapshots(): Promise<string[]> {
    if (!this.snapshotScheduler) {
      return []
    }

    return this.snapshotScheduler.listSnapshots()
  }

  /**
   * Cleanup (call when document is no longer needed)
   */
  dispose(): void {
    // Stop automatic snapshot scheduler
    if (this.snapshotScheduler) {
      this.snapshotScheduler.stop()
      this.snapshotScheduler = undefined
    }

    // Unsubscribe from storage changes
    if (this.storageUnsubscribe) {
      this.storageUnsubscribe()
      this.storageUnsubscribe = undefined
    }

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
