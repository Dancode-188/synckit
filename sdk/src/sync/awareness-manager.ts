/**
 * Awareness Manager
 *
 * Manages awareness (presence) synchronization between client and server.
 * Handles subscription, broadcasting local state, and applying remote updates.
 *
 * @module sync/awareness-manager
 */

import type { WebSocketClient } from '../websocket/client'
import type { Awareness, AwarenessUpdate } from '../awareness'

/**
 * Awareness Manager Configuration
 */
export interface AwarenessManagerConfig {
  /** WebSocket client for server communication */
  websocket: WebSocketClient
}

/**
 * Awareness Manager
 *
 * Bridges the gap between local Awareness instance and server synchronization.
 * Automatically subscribes to awareness for documents and broadcasts local updates.
 */
export class AwarenessManager {
  private websocket: WebSocketClient
  private awarenessInstances = new Map<string, Awareness>()
  private subscriptions = new Set<string>()

  constructor(config: AwarenessManagerConfig) {
    this.websocket = config.websocket

    this.setupMessageHandlers()
  }

  /**
   * Setup message handlers for awareness messages
   */
  private setupMessageHandlers(): void {
    // Handle initial awareness state (full sync)
    this.websocket.on('awareness_state', (payload) => {
      this.handleAwarenessState(payload)
    })

    // Handle awareness updates (incremental)
    this.websocket.on('awareness_update', (payload) => {
      this.handleAwarenessUpdate(payload)
    })
  }

  /**
   * Register an awareness instance for a document
   */
  registerAwareness(documentId: string, awareness: Awareness): void {
    this.awarenessInstances.set(documentId, awareness)
  }

  /**
   * Unregister an awareness instance
   */
  unregisterAwareness(documentId: string): void {
    this.awarenessInstances.delete(documentId)
    this.subscriptions.delete(documentId)
  }

  /**
   * Subscribe to awareness updates for a document
   */
  async subscribeToAwareness(documentId: string): Promise<void> {
    // Skip if already subscribed
    if (this.subscriptions.has(documentId)) {
      return
    }

    // Send subscribe message to server
    this.websocket.send({
      type: 'awareness_subscribe',
      payload: { documentId },
      timestamp: Date.now(),
    })

    this.subscriptions.add(documentId)
  }

  /**
   * Broadcast local awareness state to server
   */
  async broadcastLocalState(documentId: string, state: Record<string, unknown>): Promise<void> {
    const awareness = this.awarenessInstances.get(documentId)
    if (!awareness) {
      console.warn(`No awareness instance registered for document: ${documentId}`)
      return
    }

    // Set local state in awareness (this updates the WASM instance)
    const update = await awareness.setLocalState(state)

    // Send update to server for broadcasting
    this.websocket.send({
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

  /**
   * Send leave update when disconnecting
   */
  async sendLeaveUpdate(documentId: string): Promise<void> {
    const awareness = this.awarenessInstances.get(documentId)
    if (!awareness) {
      return
    }

    // Create leave update (state: null)
    const update = awareness.createLeaveUpdate()

    // Send to server
    this.websocket.send({
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

  /**
   * Handle initial awareness state from server
   */
  private handleAwarenessState(payload: any): void {
    const { documentId, states } = payload

    const awareness = this.awarenessInstances.get(documentId)
    if (!awareness) {
      console.warn(`Received awareness state for unregistered document: ${documentId}`)
      return
    }

    // Apply all states from server
    for (const state of states) {
      const update: AwarenessUpdate = {
        client_id: state.clientId,
        state: state.state,
        clock: state.clock,
      }

      awareness.applyUpdate(update)
    }
  }

  /**
   * Handle awareness update from server
   */
  private handleAwarenessUpdate(payload: any): void {
    const { documentId, clientId, state, clock } = payload

    const awareness = this.awarenessInstances.get(documentId)
    if (!awareness) {
      console.warn(`[AwarenessManager] ⚠️ Received awareness update for unregistered document: ${documentId}`)
      return
    }

    // Apply update to local awareness
    const update: AwarenessUpdate = {
      client_id: clientId,
      state,
      clock,
    }

    awareness.applyUpdate(update)
  }

  /**
   * Get all subscribed document IDs
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions)
  }

  /**
   * Check if subscribed to awareness for a document
   */
  isSubscribed(documentId: string): boolean {
    return this.subscriptions.has(documentId)
  }

  /**
   * Cleanup - unsubscribe from all awareness
   */
  dispose(): void {
    this.subscriptions.clear()
    this.awarenessInstances.clear()
  }
}
