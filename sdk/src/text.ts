/**
 * SyncText - Type-safe Text CRDT wrapper for collaborative text editing
 *
 * Wraps the Rust FugueText CRDT with TypeScript-friendly API and
 * integrates with SyncKit's storage and sync infrastructure.
 *
 * @module text
 */

import { initWASM } from './wasm-loader'
import type { StorageAdapter } from './storage'
import type { SyncManager, VectorClock } from './sync/manager'
import type { SyncableDocument, Operation } from './sync/manager'
import type { CrossTabSync } from './sync/cross-tab'
import type { TextInsertMessage, TextDeleteMessage } from './sync/message-types'

export interface WasmFugueText {
  insert(position: number, text: string): string  // returns JSON NodeId
  delete(position: number, length: number): string  // returns JSON NodeId[]
  getNodeIdAtPosition(position: number): string  // returns JSON NodeId
  getPositionOfNodeId(nodeIdJson: string): number  // returns position or -1 if deleted
  toString(): string
  length(): number
  isEmpty(): boolean
  getClientId(): string
  getClock(): bigint  // WASM returns bigint for u64 clock values
  merge(other: WasmFugueText): void
  toJSON(): string
  free(): void
}

export interface TextStorageData {
  content: string
  clock: number
  updatedAt: number
  crdt?: string  // Serialized CRDT state (JSON)
}

export type SubscriptionCallback<T> = (value: T) => void
export type Unsubscribe = () => void

/**
 * SyncText - Collaborative text CRDT
 *
 * Provides real-time collaborative text editing with:
 * - Fugue algorithm (maximal non-interleaving)
 * - Automatic conflict resolution
 * - Observable updates
 * - Persistence integration
 * - Network sync integration
 *
 * @example
 * ```typescript
 * const text = synckit.text('doc-123')
 * await text.init()
 *
 * // Subscribe to changes
 * text.subscribe((content) => {
 *   console.log('Text:', content)
 * })
 *
 * // Edit
 * await text.insert(0, 'Hello ')
 * await text.insert(6, 'World')
 *
 * console.log(text.get()) // "Hello World"
 * ```
 */
export class SyncText implements SyncableDocument {
  private wasmText: WasmFugueText | null = null
  private subscribers = new Set<SubscriptionCallback<string>>()
  private content: string = ''
  private clock: number = 0
  private vectorClock: VectorClock = {}
  private isApplyingRemote: boolean = false
  private initPromise: Promise<void> | null = null

  constructor(
    private readonly id: string,
    private readonly clientId: string,
    private readonly storage?: StorageAdapter,
    private readonly syncManager?: SyncManager,
    private readonly crossTabSync?: CrossTabSync
  ) {}

  /**
   * Initialize the text CRDT
   * Must be called before using any other methods
   */
  async init(): Promise<void> {
    // If already fully initialized, return immediately
    if (this.wasmText) {
      return
    }

    // Create initialization promise only once (prevents race condition)
    if (!this.initPromise) {
      this.initPromise = this.doInit().finally(() => {
        // Clear the promise after initialization completes (success or failure)
        this.initPromise = null
      })
    }

    // Always return the same promise, ensuring all concurrent callers wait for the same initialization
    return this.initPromise
  }

  /**
   * Internal initialization implementation
   */
  private async doInit(): Promise<void> {
    const wasm = await initWASM()

    // Check if WasmFugueText is available
    if (!('WasmFugueText' in wasm)) {
      throw new Error(
        'WasmFugueText not available. Make sure the WASM module was built with text-crdt feature enabled.'
      )
    }

    this.wasmText = new (wasm as any).WasmFugueText(this.clientId)

    // Load from storage if available
    if (this.storage) {
      const stored = await this.storage.get(this.id)
      if (stored && this.isTextStorageData(stored)) {
        if (stored.crdt && this.wasmText) {
          // Restore from serialized CRDT state
          let restoredText = null
          try {
            restoredText = (wasm as any).WasmFugueText.fromJSON(stored.crdt)
            // Only free and replace if restoration succeeded
            this.wasmText.free()
            this.wasmText = restoredText
            restoredText = null // Prevent cleanup in finally block
          } catch (error) {
            // If restoration failed, clean up the restored text if it was created
            if (restoredText) {
              restoredText.free()
            }
            throw error
          }
        } else if (stored.content && this.wasmText) {
          // Fallback: insert content (for backward compatibility)
          this.wasmText.insert(0, stored.content)
        }

        this.clock = stored.clock
      }
    }

    // Update local state
    this.updateLocalState()

    // Register with sync manager
    if (this.syncManager) {
      this.syncManager.registerDocument(this)
      await this.syncManager.subscribeDocument(this.id)
    }

    // Register cross-tab message handlers
    if (this.crossTabSync) {
      // Handle text insert from other tabs
      this.crossTabSync.on('text-insert', async (message) => {
        const msg = message as TextInsertMessage
        if (msg.documentId !== this.id || !this.wasmText) return

        this.isApplyingRemote = true
        try {
          this.wasmText.insert(msg.position, msg.text)
          this.updateLocalState()
          await this.persist()
          this.notifySubscribers()
        } finally {
          this.isApplyingRemote = false
        }
      })

      // Handle text delete from other tabs
      this.crossTabSync.on('text-delete', async (message) => {
        const msg = message as TextDeleteMessage
        if (msg.documentId !== this.id || !this.wasmText) return

        this.isApplyingRemote = true
        try {
          this.wasmText.delete(msg.position, msg.length)
          this.updateLocalState()
          await this.persist()
          this.notifySubscribers()
        } finally {
          this.isApplyingRemote = false
        }
      })

      // Enable cross-tab sync (starts BroadcastChannel listeners)
      // console.log('[SyncText] Enabling cross-tab sync for document:', this.id)
      this.crossTabSync.enable()
      // console.log('[SyncText] Cross-tab sync enabled for document:', this.id)
    }
  }

  /**
   * Get the current text content
   */
  get(): string {
    return this.content
  }

  /**
   * Get the current length (in graphemes)
   */
  length(): number {
    if (!this.wasmText) {
      throw new Error('Text not initialized. Call init() first.')
    }
    return this.wasmText.length()
  }

  /**
   * Check if text is empty
   */
  isEmpty(): boolean {
    return this.content.length === 0
  }

  /**
   * Insert text at the given position
   *
   * @param position - Grapheme index (0-based)
   * @param text - Text to insert
   *
   * @example
   * ```typescript
   * await text.insert(0, 'Hello')
   * await text.insert(5, ' World')
   * console.log(text.get()) // "Hello World"
   * ```
   */
  async insert(position: number, text: string): Promise<void> {
    if (!this.wasmText) {
      throw new Error('Text not initialized. Call init() first.')
    }

    // Validate position
    if (position < 0 || position > this.wasmText.length()) {
      throw new Error(`Position ${position} out of bounds (length: ${this.wasmText.length()})`)
    }

    // Insert in WASM
    this.wasmText.insert(position, text)

    // Update local state
    this.updateLocalState()

    // Persist
    await this.persist()

    // Notify subscribers
    this.notifySubscribers()

    // Broadcast to other tabs (if not applying a remote operation)
    if (this.crossTabSync && !this.isApplyingRemote) {
      // console.log('[SyncText] Broadcasting text-insert to other tabs:', { documentId: this.id, position, text })
      this.crossTabSync.broadcast({
        type: 'text-insert',
        documentId: this.id,
        position,
        text
      } as Omit<TextInsertMessage, 'from' | 'seq' | 'timestamp'>)
    }

    // Sync (if sync manager available)
    if (this.syncManager) {
      // Increment vector clock
      this.vectorClock[this.clientId] = (this.vectorClock[this.clientId] || 0) + 1

      await this.syncManager.pushOperation({
        type: 'text' as any,
        operation: 'insert',
        position,
        value: text,
        documentId: this.id,
        clientId: this.clientId,
        timestamp: Date.now(),
        clock: { ...this.vectorClock }
      } as any)
    }
  }

  /**
   * Delete text at the given position
   *
   * @param position - Starting grapheme index
   * @param length - Number of graphemes to delete
   *
   * @example
   * ```typescript
   * await text.insert(0, 'Hello World')
   * await text.delete(5, 6)  // Delete " World"
   * console.log(text.get()) // "Hello"
   * ```
   */
  async delete(position: number, length: number): Promise<void> {
    if (!this.wasmText) {
      throw new Error('Text not initialized. Call init() first.')
    }

    // Validate range
    if (position < 0 || position + length > this.wasmText.length()) {
      throw new Error(`Range ${position}..${position + length} out of bounds (length: ${this.wasmText.length()})`)
    }

    // Delete in WASM
    this.wasmText.delete(position, length)

    // Update local state
    this.updateLocalState()

    // Persist
    await this.persist()

    // Notify subscribers
    this.notifySubscribers()

    // Broadcast to other tabs (if not applying a remote operation)
    if (this.crossTabSync && !this.isApplyingRemote) {
      this.crossTabSync.broadcast({
        type: 'text-delete',
        documentId: this.id,
        position,
        length
      } as Omit<TextDeleteMessage, 'from' | 'seq' | 'timestamp'>)
    }

    // Sync (if sync manager available)
    if (this.syncManager) {
      // Increment vector clock
      this.vectorClock[this.clientId] = (this.vectorClock[this.clientId] || 0) + 1

      await this.syncManager.pushOperation({
        type: 'text' as any,
        operation: 'delete',
        position,
        value: length,
        documentId: this.id,
        clientId: this.clientId,
        timestamp: Date.now(),
        clock: { ...this.vectorClock }
      } as any)
    }
  }

  /**
   * Get the NodeId of the character at a specific position
   *
   * Returns a stable identifier for the character at the given position.
   * This is used internally by RichText for Peritext format spans.
   *
   * @param position - Grapheme index
   * @returns NodeId object with {client_id, clock, offset}
   *
   * @example
   * ```typescript
   * const text = synckit.text('doc-123')
   * await text.init()
   * await text.insert(0, 'Hello')
   *
   * const nodeId = text.getNodeIdAtPosition(2)
   * // Returns: {client_id: "client1", clock: 1, offset: 2}
   * ```
   */
  getNodeIdAtPosition(position: number): { client_id: string; clock: number; offset: number } {
    if (!this.wasmText) {
      throw new Error('Text not initialized. Call init() first.')
    }

    // Validate position
    if (position < 0 || position >= this.wasmText.length()) {
      throw new Error(`Position ${position} out of bounds (length: ${this.wasmText.length()})`)
    }

    // Get NodeId from WASM (returns JSON string)
    const nodeIdJson = this.wasmText.getNodeIdAtPosition(position)
    return JSON.parse(nodeIdJson)
  }

  /**
   * Subscribe to text changes
   *
   * @param callback - Called whenever text changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = text.subscribe((content) => {
   *   console.log('Text changed:', content)
   * })
   *
   * // Later: stop listening
   * unsubscribe()
   * ```
   */
  subscribe(callback: SubscriptionCallback<string>): Unsubscribe {
    this.subscribers.add(callback)

    return () => {
      this.subscribers.delete(callback)
    }
  }

  /**
   * Get current Lamport clock value
   */
  getClock(): number {
    return this.clock
  }

  /**
   * Merge with remote text state
   *
   * @param remoteJson - JSON string of remote FugueText state
   */
  async mergeRemote(remoteJson: string): Promise<void> {
    if (!this.wasmText) {
      throw new Error('Text not initialized. Call init() first.')
    }

    const wasm = await initWASM()
    const remote = (wasm as any).WasmFugueText.fromJSON(remoteJson)

    try {
      this.wasmText.merge(remote)

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
    if (!this.wasmText) {
      throw new Error('Text not initialized. Call init() first.')
    }
    return this.wasmText.toJSON()
  }

  /**
   * Load from JSON serialization
   */
  async fromJSON(json: string): Promise<void> {
    if (!this.wasmText) {
      throw new Error('Text not initialized. Call init() first.')
    }

    const wasm = await initWASM()
    let newText = null

    try {
      newText = (wasm as any).WasmFugueText.fromJSON(json)

      // Free old WASM object before replacing
      this.wasmText.free()
      this.wasmText = newText
      newText = null // Prevent cleanup in finally block

      this.updateLocalState()
      await this.persist()
      this.notifySubscribers()
    } catch (error) {
      // If loading failed, clean up the new text if it was created
      if (newText) {
        newText.free()
      }
      throw error
    }
  }

  /**
   * Dispose and free WASM memory
   */
  dispose(): void {
    if (this.syncManager) {
      this.syncManager.unregisterDocument(this.id)
    }

    this.subscribers.clear()

    if (this.wasmText) {
      this.wasmText.free()
      this.wasmText = null
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
    if (!this.wasmText) {
      console.warn('Text not initialized, cannot apply remote operation')
      return
    }

    // Handle text operations (cast to any since we extend Operation type)
    const textOp = operation as any
    if (textOp.type === 'text') {
      if (textOp.operation === 'insert') {
        this.wasmText.insert(textOp.position, textOp.value)
      } else if (textOp.operation === 'delete') {
        this.wasmText.delete(textOp.position, textOp.value)
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
    if (!this.wasmText) return

    this.content = this.wasmText.toString()
    this.clock = Number(this.wasmText.getClock())  // Convert BigInt to number for JSON serialization
  }

  private notifySubscribers(): void {
    const current = this.get()
    this.subscribers.forEach(callback => {
      try {
        callback(current)
      } catch (error) {
        console.error('Error in subscription callback:', error)
      }
    })
  }

  private async persist(): Promise<void> {
    if (!this.storage || !this.wasmText) return

    const data: TextStorageData = {
      content: this.content,
      clock: this.clock,
      updatedAt: Date.now(),
      crdt: this.wasmText.toJSON()
    }

    await this.storage.set(this.id, data as any)
  }

  private isTextStorageData(data: any): data is TextStorageData {
    return (
      typeof data === 'object' &&
      typeof data.content === 'string' &&
      typeof data.clock === 'number'
    )
  }
}
