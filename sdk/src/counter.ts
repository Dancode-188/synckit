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
import type { SyncManager } from './sync/manager'

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
export class SyncCounter {
  private wasmCounter: WasmCounter | null = null
  private subscribers = new Set<SubscriptionCallback<number>>()
  private currentValue: number = 0

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
      if (stored && this.isCounterStorageData(stored)) {
        // TODO: Properly restore from serialized state using fromJSON
        // For now we don't restore since counter should start at 0
      }
    }

    // Update local state
    this.updateLocalState()

    // Register with sync manager
    if (this.syncManager) {
      // TODO: Implement sync manager integration
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
      // TODO: Push operation to sync manager
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
      // TODO: Push operation to sync manager
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
      // TODO: Unregister from sync manager
    }

    this.subscribers.clear()

    if (this.wasmCounter) {
      this.wasmCounter.free()
      this.wasmCounter = null
    }
  }

  // Private helpers

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
    if (!this.storage) return

    const data: CounterStorageData = {
      value: this.currentValue,
      updatedAt: Date.now()
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
