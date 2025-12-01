/**
 * Sync Manager Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  SyncManager,
  type SyncableDocument,
} from '../../sync/manager'
import type { MessageType } from '../../websocket/client'
import type { Operation, VectorClock } from '../../sync/queue'
import type { StorageAdapter } from '../../types'

// Mock Storage
class MockStorage implements StorageAdapter {
  private data = new Map<string, any>()

  async init(): Promise<void> {}
  async get(key: string): Promise<any | null> {
    return this.data.get(key) || null
  }
  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value)
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }
  async list(): Promise<string[]> {
    return Array.from(this.data.keys())
  }
  async clear(): Promise<void> {
    this.data.clear()
  }
}

// Mock WebSocket Client
class MockWebSocketClient {
  private handlers = new Map<MessageType, Set<(payload: any) => void>>()
  private stateHandlers = new Set<(state: string) => void>()
  private _isConnected = true

  isConnected(): boolean {
    return this._isConnected
  }

  setConnected(connected: boolean): void {
    this._isConnected = connected
    const state = connected ? 'connected' : 'disconnected'
    for (const handler of this.stateHandlers) {
      handler(state)
    }
  }

  send(_message: any): void {
    // Mock implementation
  }

  on(type: MessageType, handler: (payload: any) => void): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
    return () => this.off(type, handler)
  }

  off(type: MessageType, handler: (payload: any) => void): void {
    const handlers = this.handlers.get(type)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  onStateChange(handler: (state: string) => void): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  // Helper to trigger handlers
  trigger(type: MessageType, payload: any): void {
    const handlers = this.handlers.get(type)
    if (handlers) {
      for (const handler of handlers) {
        handler(payload)
      }
    }
  }
}

// Mock Offline Queue
class MockOfflineQueue {
  async init(): Promise<void> {}
  async enqueue(_operation: Operation): Promise<void> {}
  async replay(_sender: (op: Operation) => Promise<void>): Promise<number> {
    return 0
  }
  getStats() {
    return { size: 0, replaying: 0, failed: 0, oldestOperation: null }
  }
  onChange(_callback: any): () => void {
    return () => {}
  }
}

// Mock Document
class MockDocument implements SyncableDocument {
  private id: string
  private clock: VectorClock = {}

  constructor(id: string) {
    this.id = id
  }

  getId(): string {
    return this.id
  }

  getVectorClock(): VectorClock {
    return { ...this.clock }
  }

  setVectorClock(clock: VectorClock): void {
    this.clock = { ...clock }
  }

  applyRemoteOperation(_operation: Operation): void {
    // Mock implementation
  }
}

describe('SyncManager', () => {
  let storage: MockStorage
  let websocket: MockWebSocketClient
  let queue: MockOfflineQueue
  let manager: SyncManager

  beforeEach(() => {
    storage = new MockStorage()
    websocket = new MockWebSocketClient()
    queue = new MockOfflineQueue()

    manager = new SyncManager({
      websocket: websocket as any,
      storage,
      offlineQueue: queue as any,
      clientId: 'test-client',
    })
  })

  describe('Document Registration', () => {
    it('registers document', () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      const state = manager.getSyncState('doc-1')
      expect(state.documentId).toBe('doc-1')
      expect(state.state).toBe('idle')
    })

    it('unregisters document', () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)
      manager.unregisterDocument('doc-1')

      const state = manager.getSyncState('doc-1')
      expect(state.state).toBe('idle')
    })
  })

  describe('Document Subscription', () => {
    it('subscribes document', async () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      const sendSpy = vi.spyOn(websocket, 'send')

      // Trigger subscription
      const subscribePromise = manager.subscribeDocument('doc-1')

      // Simulate server response
      setTimeout(() => {
        websocket.trigger('sync_response', {
          documentId: 'doc-1',
          state: {},
          clock: {},
        })
      }, 10)

      await subscribePromise

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscribe',
          payload: { documentId: 'doc-1' },
        })
      )

      const state = manager.getSyncState('doc-1')
      expect(state.state).toBe('synced')
    })

    it('does not re-subscribe if already subscribed', async () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      // First subscription
      const subscribePromise1 = manager.subscribeDocument('doc-1')
      setTimeout(() => {
        websocket.trigger('sync_response', { documentId: 'doc-1' })
      }, 10)
      await subscribePromise1

      const sendSpy = vi.spyOn(websocket, 'send')

      // Second subscription should not send message
      await manager.subscribeDocument('doc-1')

      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('unsubscribes document', async () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      // Subscribe first
      const subscribePromise = manager.subscribeDocument('doc-1')
      setTimeout(() => {
        websocket.trigger('sync_response', { documentId: 'doc-1' })
      }, 10)
      await subscribePromise

      const sendSpy = vi.spyOn(websocket, 'send')

      // Unsubscribe
      await manager.unsubscribeDocument('doc-1')

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unsubscribe',
          payload: { documentId: 'doc-1' },
        })
      )

      const state = manager.getSyncState('doc-1')
      expect(state.state).toBe('idle')
    })
  })

  describe('Operation Push', () => {
    it('pushes operation when online', async () => {
      const operation: Operation = {
        type: 'set',
        documentId: 'doc-1',
        field: 'title',
        value: 'Test',
        clock: { 'test-client': 1 },
        clientId: 'test-client',
        timestamp: Date.now(),
      }

      const sendSpy = vi.spyOn(websocket, 'send')

      // Push operation
      const pushPromise = manager.pushOperation(operation)

      // Simulate ACK
      setTimeout(() => {
        // Extract messageId from the send call
        const sendCall = sendSpy.mock.calls[0]!
        const messageId = sendCall[0].payload.messageId
        websocket.trigger('ack', { messageId })
      }, 10)

      await pushPromise

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delta',
        })
      )
    })

    it('queues operation when offline', async () => {
      websocket.setConnected(false)

      const operation: Operation = {
        type: 'set',
        documentId: 'doc-1',
        field: 'title',
        value: 'Test',
        clock: { 'test-client': 1 },
        clientId: 'test-client',
        timestamp: Date.now(),
      }

      const enqueueSpy = vi.spyOn(queue, 'enqueue')

      await manager.pushOperation(operation)

      expect(enqueueSpy).toHaveBeenCalledWith(operation)

      const state = manager.getSyncState('doc-1')
      expect(state.state).toBe('offline')
    })
  })

  describe('Remote Operations', () => {
    it('applies remote operation', () => {
      const doc = new MockDocument('doc-1')
      const applySpy = vi.spyOn(doc, 'applyRemoteOperation')

      manager.registerDocument(doc)

      const operation: Operation = {
        type: 'set',
        documentId: 'doc-1',
        field: 'title',
        value: 'Remote Update',
        clock: { 'other-client': 1 },
        clientId: 'other-client',
        timestamp: Date.now(),
      }

      websocket.trigger('delta', operation)

      expect(applySpy).toHaveBeenCalledWith(operation)
    })

    it('merges vector clocks', () => {
      const doc = new MockDocument('doc-1')
      doc.setVectorClock({ 'test-client': 5 })

      manager.registerDocument(doc)

      const operation: Operation = {
        type: 'set',
        documentId: 'doc-1',
        field: 'title',
        value: 'Test',
        clock: { 'other-client': 3, 'test-client': 4 },
        clientId: 'other-client',
        timestamp: Date.now(),
      }

      websocket.trigger('delta', operation)

      const mergedClock = doc.getVectorClock()
      expect(mergedClock['test-client']).toBe(5) // max(5, 4)
      expect(mergedClock['other-client']).toBe(3)
    })
  })

  describe('Sync State Management', () => {
    it('tracks sync state', () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      const state = manager.getSyncState('doc-1')
      expect(state).toEqual({
        documentId: 'doc-1',
        state: 'idle',
        lastSyncedAt: null,
        error: null,
        pendingOperations: 0,
      })
    })

    it('notifies listeners of state changes', () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      const listener = vi.fn()
      manager.onSyncStateChange('doc-1', listener)

      // Trigger state change by subscribing
      const subscribePromise = manager.subscribeDocument('doc-1')
      setTimeout(() => {
        websocket.trigger('sync_response', { documentId: 'doc-1' })
      }, 10)

      return subscribePromise.then(() => {
        expect(listener).toHaveBeenCalled()
        const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0]
        expect(lastCall.state).toBe('synced')
      })
    })

    it('removes listener on unsubscribe', () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      const listener = vi.fn()
      const unsubscribe = manager.onSyncStateChange('doc-1', listener)

      unsubscribe()

      // Trigger state change
      const subscribePromise = manager.subscribeDocument('doc-1')
      setTimeout(() => {
        websocket.trigger('sync_response', { documentId: 'doc-1' })
      }, 10)

      return subscribePromise.then(() => {
        expect(listener).not.toHaveBeenCalled()
      })
    })
  })

  describe('Connection State Handling', () => {
    it('marks documents as offline when connection lost', () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      // Subscribe first
      const subscribePromise = manager.subscribeDocument('doc-1')
      setTimeout(() => {
        websocket.trigger('sync_response', { documentId: 'doc-1' })
      }, 10)

      return subscribePromise.then(() => {
        websocket.setConnected(false)

        const state = manager.getSyncState('doc-1')
        expect(state.state).toBe('offline')
      })
    })

    it('re-subscribes documents when connection restored', async () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      // Subscribe
      let subscribePromise = manager.subscribeDocument('doc-1')
      setTimeout(() => {
        websocket.trigger('sync_response', { documentId: 'doc-1' })
      }, 10)
      await subscribePromise

      // Verify subscribed
      let state = manager.getSyncState('doc-1')
      expect(state.state).toBe('synced')

      // Disconnect
      websocket.setConnected(false)

      // Verify offline
      state = manager.getSyncState('doc-1')
      expect(state.state).toBe('offline')

      // Set up to auto-respond to sync requests
      const autoRespond = (payload: any) => {
        if (payload.documentId === 'doc-1') {
          setTimeout(() => {
            websocket.trigger('sync_response', { documentId: 'doc-1' })
          }, 10)
        }
      }
      websocket.on('sync_response' as any, autoRespond)

      // Reconnect
      websocket.setConnected(true)

      // Wait for re-subscription to complete
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Should eventually be synced again
      state = manager.getSyncState('doc-1')
      // State should be either 'syncing' or 'synced'
      expect(['syncing', 'synced']).toContain(state.state)
    })
  })

  describe('Vector Clock Operations', () => {
    it('detects concurrent operations', () => {
      // This tests the internal happensAfter logic indirectly
      // through conflict detection

      const doc = new MockDocument('doc-1')
      doc.setVectorClock({ 'test-client': 5, 'other-client': 3 })

      manager.registerDocument(doc)

      const operation: Operation = {
        type: 'set',
        documentId: 'doc-1',
        field: 'title',
        value: 'Concurrent Update',
        clock: { 'test-client': 4, 'other-client': 4 },
        clientId: 'other-client',
        timestamp: Date.now(),
      }

      const applySpy = vi.spyOn(doc, 'applyRemoteOperation')

      websocket.trigger('delta', operation)

      // Should apply since we handle conflicts
      expect(applySpy).toHaveBeenCalled()
    })
  })

  describe('Request Sync', () => {
    it('requests full sync for document', async () => {
      const doc = new MockDocument('doc-1')
      manager.registerDocument(doc)

      const sendSpy = vi.spyOn(websocket, 'send')

      const syncPromise = manager.requestSync('doc-1')

      setTimeout(() => {
        websocket.trigger('sync_response', { documentId: 'doc-1' })
      }, 10)

      await syncPromise

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync_request',
          payload: { documentId: 'doc-1' },
        })
      )
    })
  })

  describe('Dispose', () => {
    it('unsubscribes all documents on dispose', async () => {
      const doc1 = new MockDocument('doc-1')
      const doc2 = new MockDocument('doc-2')

      manager.registerDocument(doc1)
      manager.registerDocument(doc2)

      // Subscribe both
      let promise1 = manager.subscribeDocument('doc-1')
      let promise2 = manager.subscribeDocument('doc-2')

      setTimeout(() => {
        websocket.trigger('sync_response', { documentId: 'doc-1' })
        websocket.trigger('sync_response', { documentId: 'doc-2' })
      }, 10)

      await Promise.all([promise1, promise2])

      const sendSpy = vi.spyOn(websocket, 'send')

      manager.dispose()

      // Should have sent unsubscribe for both
      const unsubscribeCalls = sendSpy.mock.calls.filter(
        (call) => call[0].type === 'unsubscribe'
      )
      expect(unsubscribeCalls.length).toBe(2)
    })
  })
})
