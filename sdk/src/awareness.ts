/**
 * Awareness - Real-time user presence and ephemeral state
 *
 * Unlike CRDTs which persist data, Awareness tracks ephemeral information like:
 * - Who's online
 * - Cursor positions
 * - User selections
 * - Custom presence metadata
 *
 * @module awareness
 */

import { initWASM } from './wasm-loader'

export interface WasmAwareness {
  getClientId(): string
  setLocalState(stateJson: string): string
  applyUpdate(updateJson: string): void
  getStates(): string
  getState(clientId: string): string | undefined
  getLocalState(): string | undefined
  removeStaleClients(timeoutMs: number): string
  createLeaveUpdate(): string
  clientCount(): number
  otherClientCount(): number
  free(): void
}

export interface AwarenessState {
  client_id: string
  state: Record<string, unknown>
  clock: number
}

export interface AwarenessUpdate {
  client_id: string
  state: Record<string, unknown> | null
  clock: number
}

export type AwarenessCallback = (update: {
  added: string[]
  updated: string[]
  removed: string[]
}) => void

export type Unsubscribe = () => void

/**
 * Awareness - Ephemeral user presence tracking
 *
 * Manages real-time presence information that doesn't persist:
 * - Online/offline status
 * - Cursor positions
 * - User metadata (name, color, avatar)
 * - Custom ephemeral state
 *
 * @example
 * ```typescript
 * const awareness = new Awareness('client-123')
 * await awareness.init()
 *
 * // Set local user state
 * const update = await awareness.setLocalState({
 *   user: { name: 'Alice', color: '#FF6B6B' },
 *   cursor: { x: 100, y: 200 }
 * })
 *
 * // Subscribe to changes
 * awareness.subscribe(({ added, updated, removed }) => {
 *   console.log('Users joined:', added)
 *   console.log('Users updated:', updated)
 *   console.log('Users left:', removed)
 * })
 *
 * // Get all online users
 * const states = awareness.getStates()
 * console.log(`${states.size} users online`)
 * ```
 */
export class Awareness {
  private wasmAwareness: WasmAwareness | null = null
  private subscribers = new Set<AwarenessCallback>()
  private cachedStates = new Map<string, AwarenessState>()
  private onChangeCallback?: (update: AwarenessUpdate) => void
  private crossTabSync?: any

  constructor(
    private readonly clientId: string,
    private readonly documentId?: string,
    crossTabSync?: any
  ) {
    this.crossTabSync = crossTabSync
  }

  /**
   * Set callback to be called when local state changes
   * Used by AwarenessManager to broadcast updates to server
   */
  setOnChange(callback: (update: AwarenessUpdate) => void): void {
    this.onChangeCallback = callback
  }

  /**
   * Initialize the awareness instance
   * Must be called before using any other methods
   */
  async init(): Promise<void> {
    if (this.wasmAwareness) {
      return
    }

    const wasm = await initWASM()

    if (!('WasmAwareness' in wasm)) {
      throw new Error(
        'WasmAwareness not available. Make sure the WASM module includes awareness support.'
      )
    }

    this.wasmAwareness = new (wasm as any).WasmAwareness(this.clientId)

    // Register CrossTabSync handler for awareness updates from other tabs
    if (this.crossTabSync && this.documentId) {
      this.crossTabSync.on('awareness-update', (message: any) => {
        if (message.documentId !== this.documentId) {
          return
        }

        if (message.from === this.clientId) {
          return
        }

        // Apply the awareness update from the other tab
        if (message.update) {
          this.applyUpdate(message.update)
        }
      })

      this.crossTabSync.on('awareness-leave', (message: any) => {
        if (message.documentId !== this.documentId) return

        // Apply leave update for the tab that closed
        if (message.clientId) {
          this.applyUpdate({
            client_id: message.clientId,
            state: null,
            clock: message.clock || Date.now()
          })
        }
      })
    }
  }

  /**
   * Get the local client ID
   */
  getClientId(): string {
    return this.clientId
  }

  /**
   * Set local client's awareness state
   * Returns update to broadcast to other clients
   *
   * @param state - Arbitrary state object (user info, cursor, etc.)
   * @returns Update to send to server for broadcasting
   */
  async setLocalState(state: Record<string, unknown>): Promise<AwarenessUpdate> {
    if (!this.wasmAwareness) {
      throw new Error('Awareness not initialized. Call init() first.')
    }

    const updateJson = this.wasmAwareness.setLocalState(JSON.stringify(state))
    const update: AwarenessUpdate = JSON.parse(updateJson)

    // Update cache
    this.updateCache(update)

    // Broadcast to other tabs via CrossTabSync
    if (this.crossTabSync && this.documentId) {
      this.crossTabSync.broadcast({
        type: 'awareness-update',
        documentId: this.documentId,
        clientId: this.clientId,
        update
      })
    }

    // Notify change callback (for broadcasting to server)
    if (this.onChangeCallback) {
      this.onChangeCallback(update)
    }

    return update
  }

  /**
   * Apply remote awareness update from another client
   *
   * @param update - Update received from server
   */
  applyUpdate(update: AwarenessUpdate): void {
    if (!this.wasmAwareness) {
      throw new Error('Awareness not initialized. Call init() first.')
    }

    const previousStates = new Map(this.cachedStates)

    this.wasmAwareness.applyUpdate(JSON.stringify(update))
    this.updateCache(update)

    // Notify subscribers of changes
    this.notifySubscribers(previousStates)
  }

  /**
   * Get all client states
   */
  getStates(): Map<string, AwarenessState> {
    return new Map(this.cachedStates)
  }

  /**
   * Get state for a specific client
   */
  getState(clientId: string): AwarenessState | undefined {
    return this.cachedStates.get(clientId)
  }

  /**
   * Get local client's state
   */
  getLocalState(): AwarenessState | undefined {
    return this.cachedStates.get(this.clientId)
  }

  /**
   * Remove clients that haven't updated within timeout
   *
   * @param timeoutMs - Timeout in milliseconds (default: 30000)
   * @returns List of removed client IDs
   */
  removeStaleClients(timeoutMs: number = 30000): string[] {
    if (!this.wasmAwareness) {
      return []
    }

    const previousStates = new Map(this.cachedStates)
    const removedJson = this.wasmAwareness.removeStaleClients(timeoutMs)
    const removed: string[] = JSON.parse(removedJson)

    // Update cache
    for (const clientId of removed) {
      this.cachedStates.delete(clientId)
    }

    // Notify subscribers
    if (removed.length > 0) {
      this.notifySubscribers(previousStates)
    }

    return removed
  }

  /**
   * Create update to signal local client leaving
   * Send this to server before disconnecting
   */
  createLeaveUpdate(): AwarenessUpdate {
    if (!this.wasmAwareness) {
      throw new Error('Awareness not initialized.')
    }

    const updateJson = this.wasmAwareness.createLeaveUpdate()
    return JSON.parse(updateJson)
  }

  /**
   * Get number of online clients (including self)
   */
  clientCount(): number {
    return this.cachedStates.size
  }

  /**
   * Get number of other online clients (excluding self)
   */
  otherClientCount(): number {
    if (!this.wasmAwareness) {
      return 0
    }
    return this.wasmAwareness.otherClientCount()
  }

  /**
   * Subscribe to awareness changes
   *
   * @param callback - Called when clients are added, updated, or removed
   * @returns Unsubscribe function
   */
  subscribe(callback: AwarenessCallback): Unsubscribe {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  /**
   * Cleanup and free WASM memory
   */
  dispose(): void {
    this.subscribers.clear()
    this.cachedStates.clear()

    if (this.wasmAwareness) {
      this.wasmAwareness.free()
      this.wasmAwareness = null
    }
  }

  // Private helpers

  private updateCache(update: AwarenessUpdate): void {
    if (update.state === null) {
      // Client left
      this.cachedStates.delete(update.client_id)
    } else {
      // Client joined or updated
      this.cachedStates.set(update.client_id, {
        client_id: update.client_id,
        state: update.state,
        clock: update.clock,
      })
    }
  }

  private notifySubscribers(previousStates: Map<string, AwarenessState>): void {
    const added: string[] = []
    const updated: string[] = []
    const removed: string[] = []

    // Find added and updated clients
    for (const [clientId, state] of this.cachedStates) {
      if (!previousStates.has(clientId)) {
        added.push(clientId)
      } else {
        const prevState = previousStates.get(clientId)!
        if (prevState.clock !== state.clock) {
          updated.push(clientId)
        }
      }
    }

    // Find removed clients
    for (const clientId of previousStates.keys()) {
      if (!this.cachedStates.has(clientId)) {
        removed.push(clientId)
      }
    }

    // Notify if there are changes
    if (added.length > 0 || updated.length > 0 || removed.length > 0) {
      for (const callback of this.subscribers) {
        callback({ added, updated, removed })
      }
    }
  }
}
