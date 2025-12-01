/**
 * Integration Tests for Network Synchronization
 *
 * Tests end-to-end scenarios across all network components
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { SyncKit } from '../../synckit'
import { MemoryStorage } from '../../storage'
import type { WebSocketMessage, MessageType } from '../../websocket/client'

// Mock CloseEvent if not available
if (typeof CloseEvent === 'undefined') {
  global.CloseEvent = class CloseEvent extends Event {
    code: number
    reason: string
    constructor(type: string, options?: { code?: number; reason?: string }) {
      super(type)
      this.code = options?.code ?? 1000
      this.reason = options?.reason ?? ''
    }
  } as any
}

// Mock WebSocket for testing
class MockWebSocket {
  static instances: MockWebSocket[] = []
  readyState: number = WebSocket.CONNECTING
  binaryType: BinaryType = 'arraybuffer'
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  private messageHandlers: Map<string, (payload: any) => void> = new Map()
  private closed = false

  constructor(public url: string) {
    MockWebSocket.instances.push(this)

    // Auto-connect after a tick
    setTimeout(() => {
      if (!this.closed) {
        this.readyState = WebSocket.OPEN
        this.onopen?.(new Event('open'))
      }
    }, 10)
  }

  send(data: ArrayBuffer | string): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }

    // Decode and route message
    const message = this.decodeMessage(data as ArrayBuffer)
    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      handler(message.payload)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.readyState = WebSocket.CLOSED
    this.onclose?.(new CloseEvent('close', { code: 1000, reason: 'Normal closure' }))
  }

  // Test helpers
  simulateMessage(message: WebSocketMessage): void {
    if (this.readyState === WebSocket.OPEN && this.onmessage) {
      const encoded = this.encodeMessage(message)
      this.onmessage(new MessageEvent('message', { data: encoded }))
    }
  }
  onMessageType(type: MessageType, handler: (payload: any) => void): void {
    this.messageHandlers.set(type, handler)
  }

  private encodeMessage(message: WebSocketMessage): ArrayBuffer {
    const typeCode = this.getTypeCode(message.type)
    const payloadJson = JSON.stringify(message.payload)
    const payloadBytes = new TextEncoder().encode(payloadJson)

    const buffer = new ArrayBuffer(1 + 8 + 4 + payloadBytes.length)
    const view = new DataView(buffer)

    view.setUint8(0, typeCode)
    view.setBigInt64(1, BigInt(message.timestamp), false)
    view.setUint32(9, payloadBytes.length, false)
    new Uint8Array(buffer, 13).set(payloadBytes)

    return buffer
  }

  private decodeMessage(data: ArrayBuffer): WebSocketMessage {
    const view = new DataView(data)
    const typeCode = view.getUint8(0)
    const timestamp = Number(view.getBigInt64(1, false))
    const payloadLength = view.getUint32(9, false)
    const payloadBytes = new Uint8Array(data, 13, payloadLength)
    const payloadJson = new TextDecoder().decode(payloadBytes)
    const payload = JSON.parse(payloadJson)

    return {
      type: this.getTypeName(typeCode),
      payload,
      timestamp,
    }
  }

  private getTypeCode(type: MessageType): number {
    const map: Record<MessageType, number> = {
      auth: 0x01,
      auth_success: 0x02,
      auth_error: 0x03,
      subscribe: 0x10,
      unsubscribe: 0x11,
      sync_request: 0x12,
      sync_response: 0x13,
      delta: 0x20,
      ack: 0x21,
      ping: 0x30,
      pong: 0x31,
      error: 0xff,
    }
    return map[type] || 0xff
  }

  private getTypeName(code: number): MessageType {
    const map: Record<number, MessageType> = {
      0x01: 'auth',
      0x02: 'auth_success',
      0x03: 'auth_error',
      0x10: 'subscribe',
      0x11: 'unsubscribe',
      0x12: 'sync_request',
      0x13: 'sync_response',
      0x20: 'delta',
      0x21: 'ack',
      0x30: 'ping',
      0x31: 'pong',
      0xff: 'error',
    }
    return (map[code] as MessageType) || 'error'
  }
}

describe('Network Synchronization Integration', () => {
  let synckit: SyncKit
  let storage: MemoryStorage
  let mockWs: MockWebSocket
  let originalWebSocket: typeof WebSocket

  beforeEach(async () => {
    // Setup mock WebSocket
    MockWebSocket.instances = []
    originalWebSocket = global.WebSocket
    global.WebSocket = MockWebSocket as any

    // Setup SyncKit
    storage = new MemoryStorage()
    synckit = new SyncKit({
      storage,
      clientId: 'test-client',
      serverUrl: 'ws://localhost:8765',
    })

    await synckit.init()

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Get the mock WebSocket instance
    mockWs = MockWebSocket.instances[0]!

    // Auto-respond to auth
    mockWs.onMessageType('auth', () => {
      mockWs.simulateMessage({
        type: 'auth_success',
        payload: {},
        timestamp: Date.now(),
      })
    })

    // Auto-respond to ping
    mockWs.onMessageType('ping', () => {
      mockWs.simulateMessage({
        type: 'pong',
        payload: {},
        timestamp: Date.now(),
      })
    })

    // Auto-respond to document subscription requests with an empty state
    mockWs.onMessageType('subscribe', (payload) => {
      setTimeout(() => {
        mockWs.simulateMessage({
          type: 'sync_response',
          payload: {
            documentId: payload.documentId,
            state: {},
            clock: {},
          },
          timestamp: Date.now(),
        })
      }, 0)
    })

    // Auto-acknowledge delta operations to unblock pushOperation
    mockWs.onMessageType('delta', (payload) => {
      // Use setTimeout to allow waitForAck to register before ack is processed
      setTimeout(() => {
        mockWs.simulateMessage({
          type: 'ack',
          payload: { messageId: payload.messageId },
          timestamp: Date.now(),
        })
      }, 0)
    })
  })

  afterEach(() => {
    // Close any open mock WebSocket connections to prevent message leakage
    for (const ws of MockWebSocket.instances) {
      ws.close()
    }
    MockWebSocket.instances = []
    synckit.dispose()
    global.WebSocket = originalWebSocket
  })

  describe('Document Synchronization', () => {
    it('should sync local changes to server', async () => {
      const receivedDeltas: any[] = []

      mockWs.onMessageType('delta', (payload) => {
        receivedDeltas.push(payload)
        // Acknowledge the delta (async to allow waitForAck to register)
        setTimeout(() => {
          mockWs.simulateMessage({
            type: 'ack',
            payload: { messageId: payload.messageId },
            timestamp: Date.now(),
          })
        }, 0)
      })

      // Create and modify document
      const doc = synckit.document<{ name: string; count: number }>('test-doc')
      await doc.init()
      await doc.set('name', 'Alice')
      await doc.set('count', 42)

      // Wait for sync
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify deltas were sent
      expect(receivedDeltas.length).toBeGreaterThanOrEqual(2)
      const nameOp = receivedDeltas.find((d) => d.field === 'name')
      const countOp = receivedDeltas.find((d) => d.field === 'count')
      expect(nameOp.value).toBe('Alice')
      expect(countOp.value).toBe(42)
    })

    it('should receive and apply remote changes', async () => {
      const doc = synckit.document<{ name: string }>('test-doc')
      await doc.init()

      // Simulate remote change from server
      mockWs.simulateMessage({
        type: 'delta',
        payload: {
          type: 'set',
          documentId: 'test-doc',
          field: 'name',
          value: 'Bob',
          clock: { 'remote-client': 1 },
          clientId: 'remote-client',
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      })

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Verify remote change was applied
      expect(doc.getField('name')).toBe('Bob')
    })

    it('should resolve conflicts using vector clocks', async () => {
      const doc = synckit.document<{ name: string }>('test-doc')
      await doc.init()

      // Local change
      await doc.set('name', 'Alice')

      // Concurrent remote change with earlier timestamp
      mockWs.simulateMessage({
        type: 'delta',
        payload: {
          type: 'set',
          documentId: 'test-doc',
          field: 'name',
          value: 'Bob',
          clock: { 'remote-client': 1 },
          clientId: 'remote-client',
          timestamp: Date.now() - 1000, // Earlier timestamp
        },
        timestamp: Date.now(),
      })

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Local change should win (higher vector clock + later timestamp)
      expect(doc.getField('name')).toBe('Alice')
    })

    it('should handle multiple concurrent clients', async () => {
      const doc1 = synckit.document<{ count: number }>('shared-doc')
      await doc1.init()
      await doc1.set('count', 1)

      // Simulate operations from multiple remote clients
      // Each subsequent client has a higher clock value to ensure LWW ordering
      for (let i = 2; i <= 5; i++) {
        mockWs.simulateMessage({
          type: 'delta',
          payload: {
            type: 'set',
            documentId: 'shared-doc',
            field: 'count',
            value: i,
            // Use higher clock values to win against local (test-client: 1)
            clock: { [`client-${i}`]: i },
            clientId: `client-${i}`,
            timestamp: Date.now() + i,
          },
          timestamp: Date.now(),
        })
      }

      // Wait for all operations to process
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Last operation (client-5 with highest clock value) should win
      expect(doc1.getField('count')).toBe(5)
    })
  })

  describe('Offline Queue', () => {
    it('should queue operations when offline', async () => {
      const doc = synckit.document<{ name: string }>('test-doc')
      await doc.init()

      // Go offline by closing WebSocket
      mockWs.close()
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Make changes while offline
      await doc.set('name', 'Alice')

      // Check queue status
      const status = synckit.getNetworkStatus()
      expect(status?.queueSize).toBeGreaterThan(0)
    })

    it('should track connection state', async () => {
      // Initial state should be connected
      expect(synckit.getNetworkStatus()?.connectionState).toBe('connected')

      // Disconnect
      mockWs.close()
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should transition to reconnecting or disconnected
      const status = synckit.getNetworkStatus()
      expect(['disconnected', 'reconnecting', 'failed']).toContain(
        status?.connectionState
      )
    })
  })

  describe('Network Status', () => {
    it('should provide network status', () => {
      const status = synckit.getNetworkStatus()

      expect(status).not.toBeNull()
      expect(status?.connectionState).toBe('connected')
      expect(status?.queueSize).toBe(0)
      expect(status?.failedOperations).toBe(0)
    })
  })
})
