/**
 * SyncCounter - Type-safe PN-Counter CRDT wrapper for distributed counting
 *
 * Wraps the Rust PNCounter CRDT with TypeScript-friendly API and
 * integrates with SyncKit's storage and sync infrastructure.
 *
 * @module counter
 */

import { initWASM } from './wasm-loader'
import type { StorageAdapter } from './storage'
import type { SyncManager, VectorClock } from './sync/manager'
import type { SyncableDocument, Operation } from './sync/manager'

export interface WasmCounter {
  increment(amount?: number): void
  decrement(amount?: number): void
  value(): number
  getReplicaId(): string
  merge(other: WasmCounter): void
  reset(): void
  toJSON(): string
  free(): void
}

export interface CounterStorageData {
  value: number
  updatedAt: number
  crdt?: string  // Serialized CRDT state (JSON)
}

export type SubscriptionCallback<T> = (value: T) => void
export type Unsubscribe = () => void

/**
 * SyncCounter - Collaborative counter CRDT
 *
 * Provides distributed counter with:
 * - Increment/decrement operations
 * - Automatic conflict resolution
 * - Observable updates
 * - Persistence integration
 * - Network sync integration
 *
 * @example
 * ```typescript
 * const counter = synckit.counter('views')
 * await counter.init()
 *
 * // Subscribe to changes
 * counter.subscribe((value) => {
 *   console.log('Count:', value)
 * })
 *
 * // Increment
 * await counter.increment()
 * await counter.increment(5)
 *
 * console.log(counter.value) // 6
 * ```
 */
export class SyncCounter implements SyncableDocument {
  private wasmCounter: WasmCounter | null = null
  private subscribers = new Set<SubscriptionCallback<number>>()
  private currentValue: number = 0
  private vectorClock: VectorClock = {}

  constructor(
    private readonly id: string,
    private readonly replicaId: string,
    private readonly storage?: StorageAdapter,
    private readonly syncManager?: SyncManager
  ) {}

  /**
   * Initialize the counter CRDT
   * Must be called before using any other methods
   */
  async init(): Promise<void> {
    if (this.wasmCounter) {
      return
    }

    const wasm = await initWASM()

    // Check if WasmCounter is available
    if (!('WasmCounter' in wasm)) {
      throw new Error(
        'WasmCounter not available. Make sure the WASM module was built with counters feature enabled.'
      )
    }

    this.wasmCounter = new (wasm as any).WasmCounter(this.replicaId)

    // Load from storage if available
    if (this.storage) {
      const stored = await this.storage.get(this.id)
      if (stored && this.isCounterStorageData(stored) && stored.crdt && this.wasmCounter) {
        // Restore from serialized CRDT state
        const restoredCounter = (wasm as any).WasmCounter.fromJSON(stored.crdt)
        this.wasmCounter.free()
        this.wasmCounter = restoredCounter
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
   * Get the current counter value
   */
  get value(): number {
    return this.currentValue
  }

  /**
   * Increment the counter
   *
   * @param amount - Amount to increment (defaults to 1)
   *
   * @example
   * ```typescript
   * await counter.increment()    // +1
   * await counter.increment(5)   // +5
   * ```
   */
  async increment(amount: number = 1): Promise<void> {
    if (!this.wasmCounter) {
      throw new Error('Counter not initialized. Call init() first.')
    }

    if (amount < 0) {
      throw new Error('Increment amount must be non-negative. Use decrement() for negative values.')
    }

    // Increment in WASM
    this.wasmCounter.increment(amount)

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
        type: 'counter' as any,
        operation: 'increment',
        value: amount,
        documentId: this.id,
        clientId: this.replicaId,
        timestamp: Date.now(),
        clock: { ...this.vectorClock }
      } as any)
    }
  }

  /**
   * Decrement the counter
   *
   * @param amount - Amount to decrement (defaults to 1)
   *
   * @example
   * ```typescript
   * await counter.decrement()    // -1
   * await counter.decrement(3)   // -3
   * ```
   */
  async decrement(amount: number = 1): Promise<void> {
    if (!this.wasmCounter) {
      throw new Error('Counter not initialized. Call init() first.')
    }

    if (amount < 0) {
      throw new Error('Decrement amount must be non-negative. Use increment() for positive values.')
    }

    // Decrement in WASM
    this.wasmCounter.decrement(amount)

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
        type: 'counter' as any,
        operation: 'decrement',
        value: amount,
        documentId: this.id,
        clientId: this.replicaId,
        timestamp: Date.now(),
        clock: { ...this.vectorClock }
      } as any)
    }
  }

  /**
   * Subscribe to counter changes
   *
   * @param callback - Called whenever counter value changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = counter.subscribe((value) => {
   *   console.log('Counter changed:', value)
   * })
   *
   * // Later: stop listening
   * unsubscribe()
   * ```
   */
  subscribe(callback: SubscriptionCallback<number>): Unsubscribe {
    this.subscribers.add(callback)

    return () => {
      this.subscribers.delete(callback)
    }
  }

  /**
   * Merge with remote counter state
   *
   * @param remoteJson - JSON string of remote PNCounter state
   */
  async mergeRemote(remoteJson: string): Promise<void> {
    if (!this.wasmCounter) {
      throw new Error('Counter not initialized. Call init() first.')
    }

    const wasm = await initWASM()
    const remote = (wasm as any).WasmCounter.fromJSON(remoteJson)

    try {
      this.wasmCounter.merge(remote)

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
    if (!this.wasmCounter) {
      throw new Error('Counter not initialized. Call init() first.')
    }
    return this.wasmCounter.toJSON()
  }

  /**
   * Load from JSON serialization
   */
  async fromJSON(json: string): Promise<void> {
    if (!this.wasmCounter) {
      throw new Error('Counter not initialized. Call init() first.')
    }

    const wasm = await initWASM()
    this.wasmCounter = (wasm as any).WasmCounter.fromJSON(json)
    this.updateLocalState()
    await this.persist()
    this.notifySubscribers()
  }

  /**
   * Reset counter to zero (local operation only)
   * Note: This won't affect other replicas unless they merge
   */
  async reset(): Promise<void> {
    if (!this.wasmCounter) {
      throw new Error('Counter not initialized. Call init() first.')
    }

    this.wasmCounter.reset()
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

    if (this.wasmCounter) {
      this.wasmCounter.free()
      this.wasmCounter = null
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
    if (!this.wasmCounter) {
      console.warn('Counter not initialized, cannot apply remote operation')
      return
    }

    // Handle counter operations (cast to any since we extend Operation type)
    const counterOp = operation as any
    if (counterOp.type === 'counter') {
      if (counterOp.operation === 'increment') {
        this.wasmCounter.increment(counterOp.value)
      } else if (counterOp.operation === 'decrement') {
        this.wasmCounter.decrement(counterOp.value)
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
    if (!this.wasmCounter) return

    this.currentValue = this.wasmCounter.value()
  }

  private notifySubscribers(): void {
    const current = this.value
    this.subscribers.forEach(callback => {
      try {
        callback(current)
      } catch (error) {
        console.error('Error in subscription callback:', error)
      }
    })
  }

  private async persist(): Promise<void> {
    if (!this.storage || !this.wasmCounter) return

    const data: CounterStorageData = {
      value: this.currentValue,
      updatedAt: Date.now(),
      crdt: this.wasmCounter.toJSON()
    }

    await this.storage.set(this.id, data as any)
  }

  private isCounterStorageData(data: any): data is CounterStorageData {
    return (
      typeof data === 'object' &&
      typeof data.value === 'number'
    )
  }
}
