/**
 * SyncSet - Type-safe OR-Set CRDT wrapper for distributed sets
 *
 * Wraps the Rust ORSet CRDT with TypeScript-friendly API and
 * integrates with SyncKit's storage and sync infrastructure.
 *
 * @module set
 */

import { initWASM } from './wasm-loader'
import type { StorageAdapter } from './storage'
import type { SyncManager, VectorClock } from './sync/manager'
import type { SyncableDocument, Operation } from './sync/manager'

export interface WasmSet {
  add(value: string): void
  remove(value: string): void
  has(value: string): boolean
  size(): number
  isEmpty(): boolean
  values(): string  // JSON array string
  clear(): void
  merge(other: WasmSet): void
  toJSON(): string
  free(): void
}

export interface SetStorageData {
  values: string[]
  updatedAt: number
}

export type SubscriptionCallback<T> = (value: T) => void
export type Unsubscribe = () => void

/**
 * SyncSet - Collaborative set CRDT
 *
 * Provides distributed set with:
 * - Add/remove operations (add-wins semantics)
 * - Automatic conflict resolution
 * - Observable updates
 * - Persistence integration
 * - Network sync integration
 *
 * @example
 * ```typescript
 * const tags = synckit.set<string>('tags')
 * await tags.init()
 *
 * // Subscribe to changes
 * tags.subscribe((values) => {
 *   console.log('Tags:', values)
 * })
 *
 * // Add/remove
 * await tags.add('urgent')
 * await tags.add('bug')
 * await tags.remove('bug')
 *
 * console.log(tags.has('urgent')) // true
 * console.log([...tags.values()]) // ['urgent']
 * ```
 */
export class SyncSet<T extends string = string> implements SyncableDocument {
  private wasmSet: WasmSet | null = null
  private subscribers = new Set<SubscriptionCallback<Set<T>>>()
  private currentValues: Set<T> = new Set()
  private vectorClock: VectorClock = {}

  constructor(
    private readonly id: string,
    private readonly replicaId: string,
    private readonly storage?: StorageAdapter,
    private readonly syncManager?: SyncManager
  ) {}

  /**
   * Initialize the set CRDT
   * Must be called before using any other methods
   */
  async init(): Promise<void> {
    if (this.wasmSet) {
      return
    }

    const wasm = await initWASM()

    // Check if WasmSet is available
    if (!('WasmSet' in wasm)) {
      throw new Error(
        'WasmSet not available. Make sure the WASM module was built with sets feature enabled.'
      )
    }

    this.wasmSet = new (wasm as any).WasmSet(this.replicaId)

    // Load from storage if available
    if (this.storage) {
      const stored = await this.storage.get(this.id)
      if (stored && this.isSetStorageData(stored) && this.wasmSet) {
        // Restore values
        for (const value of stored.values) {
          this.wasmSet.add(value)
        }
      }
    }

    // Update local state
    this.updateLocalState()

    // Register with sync manager
    if (this.syncManager) {
      this.syncManager.registerDocument(this)
      await this.syncManager.subscribeDocument(this.id)
    }
  }

  /**
   * Add an element to the set
   *
   * @param value - Element to add
   *
   * @example
   * ```typescript
   * await set.add('apple')
   * await set.add('banana')
   * ```
   */
  async add(value: T): Promise<void> {
    if (!this.wasmSet) {
      throw new Error('Set not initialized. Call init() first.')
    }

    // Add in WASM
    this.wasmSet.add(value)

    // Update local state
    this.updateLocalState()

    // Persist
    await this.persist()

    // Notify subscribers
    this.notifySubscribers()

    // Sync (if sync manager available)
    if (this.syncManager) {
      // Increment vector clock
      this.vectorClock[this.replicaId] = (this.vectorClock[this.replicaId] || 0) + 1

      await this.syncManager.pushOperation({
        type: 'set' as any,
        operation: 'add',
        value: value,
        documentId: this.id,
        clientId: this.replicaId,
        timestamp: Date.now(),
        clock: { ...this.vectorClock }
      } as any)
    }
  }

  /**
   * Remove an element from the set
   *
   * @param value - Element to remove
   *
   * @example
   * ```typescript
   * await set.remove('apple')
   * ```
   */
  async remove(value: T): Promise<void> {
    if (!this.wasmSet) {
      throw new Error('Set not initialized. Call init() first.')
    }

    // Remove in WASM
    this.wasmSet.remove(value)

    // Update local state
    this.updateLocalState()

    // Persist
    await this.persist()

    // Notify subscribers
    this.notifySubscribers()

    // Sync (if sync manager available)
    if (this.syncManager) {
      // Increment vector clock
      this.vectorClock[this.replicaId] = (this.vectorClock[this.replicaId] || 0) + 1

      await this.syncManager.pushOperation({
        type: 'set' as any,
        operation: 'remove',
        value: value,
        documentId: this.id,
        clientId: this.replicaId,
        timestamp: Date.now(),
        clock: { ...this.vectorClock }
      } as any)
    }
  }

  /**
   * Check if the set contains an element
   *
   * @param value - Element to check
   * @returns true if element is in set
   */
  has(value: T): boolean {
    return this.currentValues.has(value)
  }

  /**
   * Get the number of elements in the set
   */
  get size(): number {
    return this.currentValues.size
  }

  /**
   * Check if the set is empty
   */
  get isEmpty(): boolean {
    return this.currentValues.size === 0
  }

  /**
   * Get all values in the set
   *
   * @returns Iterator over set values
   */
  *values(): IterableIterator<T> {
    yield* this.currentValues
  }

  /**
   * Clear all elements from the set
   *
   * @example
   * ```typescript
   * await set.clear()
   * console.log(set.isEmpty) // true
   * ```
   */
  async clear(): Promise<void> {
    if (!this.wasmSet) {
      throw new Error('Set not initialized. Call init() first.')
    }

    this.wasmSet.clear()
    this.updateLocalState()
    await this.persist()
    this.notifySubscribers()

    // Sync (if sync manager available)
    if (this.syncManager) {
      // Increment vector clock
      this.vectorClock[this.replicaId] = (this.vectorClock[this.replicaId] || 0) + 1

      await this.syncManager.pushOperation({
        type: 'set' as any,
        operation: 'clear',
        documentId: this.id,
        clientId: this.replicaId,
        timestamp: Date.now(),
        clock: { ...this.vectorClock }
      } as any)
    }
  }

  /**
   * Subscribe to set changes
   *
   * @param callback - Called whenever set changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = set.subscribe((values) => {
   *   console.log('Set changed:', Array.from(values))
   * })
   *
   * // Later: stop listening
   * unsubscribe()
   * ```
   */
  subscribe(callback: SubscriptionCallback<Set<T>>): Unsubscribe {
    this.subscribers.add(callback)

    return () => {
      this.subscribers.delete(callback)
    }
  }

  /**
   * Merge with remote set state
   *
   * @param remoteJson - JSON string of remote ORSet state
   */
  async mergeRemote(remoteJson: string): Promise<void> {
    if (!this.wasmSet) {
      throw new Error('Set not initialized. Call init() first.')
    }

    const wasm = await initWASM()
    const remote = (wasm as any).WasmSet.fromJSON(remoteJson)

    try {
      this.wasmSet.merge(remote)

      // Update local state
      this.updateLocalState()

      // Persist
      await this.persist()

      // Notify subscribers
      this.notifySubscribers()
    } finally {
      remote.free()
    }
  }

  /**
   * Export to JSON (for persistence/network)
   */
  toJSON(): string {
    if (!this.wasmSet) {
      throw new Error('Set not initialized. Call init() first.')
    }
    return this.wasmSet.toJSON()
  }

  /**
   * Load from JSON serialization
   */
  async fromJSON(json: string): Promise<void> {
    if (!this.wasmSet) {
      throw new Error('Set not initialized. Call init() first.')
    }

    const wasm = await initWASM()
    this.wasmSet = (wasm as any).WasmSet.fromJSON(json)
    this.updateLocalState()
    await this.persist()
    this.notifySubscribers()
  }

  /**
   * Dispose and free WASM memory
   */
  dispose(): void {
    if (this.syncManager) {
      this.syncManager.unregisterDocument(this.id)
    }

    this.subscribers.clear()

    if (this.wasmSet) {
      this.wasmSet.free()
      this.wasmSet = null
    }
  }

  // ====================
  // SyncableDocument Interface
  // ====================

  /**
   * Get document ID
   */
  getId(): string {
    return this.id
  }

  /**
   * Get vector clock for causality tracking
   */
  getVectorClock(): VectorClock {
    return this.vectorClock
  }

  /**
   * Set vector clock (used during merge)
   */
  setVectorClock(clock: VectorClock): void {
    this.vectorClock = clock
  }

  /**
   * Apply remote operation from another replica
   */
  applyRemoteOperation(operation: Operation): void {
    if (!this.wasmSet) {
      console.warn('Set not initialized, cannot apply remote operation')
      return
    }

    // Handle set operations
    if (operation.type === 'set') {
      const setOp = operation as any // Type assertion for set operations

      if (setOp.operation === 'add') {
        this.wasmSet.add(setOp.value)
      } else if (setOp.operation === 'remove') {
        this.wasmSet.remove(setOp.value)
      } else if (setOp.operation === 'clear') {
        this.wasmSet.clear()
      }

      // Update local state and notify subscribers
      this.updateLocalState()
      this.notifySubscribers()
    }
  }

  // ====================
  // Private helpers
  // ====================

  private updateLocalState(): void {
    if (!this.wasmSet) return

    const valuesJson = this.wasmSet.values()
    const values = JSON.parse(valuesJson) as string[]
    this.currentValues = new Set(values as T[])
  }

  private notifySubscribers(): void {
    const current = new Set(this.currentValues)
    this.subscribers.forEach(callback => {
      try {
        callback(current)
      } catch (error) {
        console.error('Error in subscription callback:', error)
      }
    })
  }

  private async persist(): Promise<void> {
    if (!this.storage) return

    const data: SetStorageData = {
      values: Array.from(this.currentValues),
      updatedAt: Date.now()
    }

    await this.storage.set(this.id, data as any)
  }

  private isSetStorageData(data: any): data is SetStorageData {
    return (
      typeof data === 'object' &&
      Array.isArray(data.values)
    )
  }
}
