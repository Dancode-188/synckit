/**
 * Integration Tests for Network Synchronization
 *
 * Tests end-to-end scenarios across all network components
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { SyncKit } from '../../synckit'
import { MemoryStorage } from '../../storage'
import type { WebSocketMessage } from '../../websocket/client'

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

  readyState = WebSocket.CONNECTING
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

  onMessageType(type: string, handler: (payload: any) => void): void {
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

  private getTypeCode(type: string): number {
    const map: Record<string, number> = {
      auth: 0x01,
      auth_success: 0x02,
      delta: 0x20,
      ack: 0x21,
      ping: 0x30,
      pong: 0x31,
      error: 0xff,
    }
    return map[type] || 0xff
  }

  private getTypeName(code: number): string {
    const map: Record<number, string> = {
      0x01: 'auth',
      0x02: 'auth_success',
      0x20: 'delta',
      0x21: 'ack',
      0x30: 'ping',
      0x31: 'pong',
      0xff: 'error',
    }
    return map[code] || 'error'
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
  })

  afterEach(() => {
    synckit.dispose()
    global.WebSocket = originalWebSocket
  })

  describe('Document Synchronization', () => {
    it('should sync local changes to server', async () => {
      const receivedDeltas: any[] = []

      mockWs.onMessageType('delta', (payload) => {
        receivedDeltas.push(payload)
        // Acknowledge the delta
        mockWs.simulateMessage({
          type: 'ack',
          payload: { operationId: payload.operation.timestamp },
          timestamp: Date.now(),
        })
      })

      // Create and modify document
      const doc = synckit.document<{ name: string; count: number }>('test-doc')
      await doc.set('name', 'Alice')
      await doc.set('count', 42)

      // Wait for sync
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify deltas were sent
      expect(receivedDeltas.length).toBeGreaterThanOrEqual(2)
      const nameOp = receivedDeltas.find((d) => d.operation.field === 'name')
      const countOp = receivedDeltas.find((d) => d.operation.field === 'count')
      expect(nameOp.operation.value).toBe('Alice')
      expect(countOp.operation.value).toBe(42)
    })

    it('should receive and apply remote changes', async () => {
      const doc = synckit.document<{ name: string }>('test-doc')

      // Simulate remote change from server
      mockWs.simulateMessage({
        type: 'delta',
        payload: {
          operation: {
            type: 'set',
            documentId: 'test-doc',
            field: 'name',
            value: 'Bob',
            clock: { 'remote-client': 1 },
            clientId: 'remote-client',
            timestamp: Date.now(),
          },
        },
        timestamp: Date.now(),
      })

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Verify remote change was applied
      expect(doc.get('name')).toBe('Bob')
    })

    it('should resolve conflicts using vector clocks', async () => {
      const doc = synckit.document<{ name: string }>('test-doc')

      // Local change
      await doc.set('name', 'Alice')

      // Concurrent remote change with earlier timestamp
      mockWs.simulateMessage({
        type: 'delta',
        payload: {
          operation: {
            type: 'set',
            documentId: 'test-doc',
            field: 'name',
            value: 'Bob',
            clock: { 'remote-client': 1 },
            clientId: 'remote-client',
            timestamp: Date.now() - 1000, // Earlier timestamp
          },
        },
        timestamp: Date.now(),
      })

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Local change should win (higher vector clock + later timestamp)
      expect(doc.get('name')).toBe('Alice')
    })

    it('should handle multiple concurrent clients', async () => {
      const doc1 = synckit.document<{ count: number }>('shared-doc')
      await doc1.set('count', 1)

      // Simulate operations from multiple remote clients
      for (let i = 2; i <= 5; i++) {
        mockWs.simulateMessage({
          type: 'delta',
          payload: {
            operation: {
              type: 'set',
              documentId: 'shared-doc',
              field: 'count',
              value: i,
              clock: { [`client-${i}`]: 1 },
              clientId: `client-${i}`,
              timestamp: Date.now() + i,
            },
          },
          timestamp: Date.now(),
        })
      }

      // Wait for all operations to process
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Last operation (client-5 with highest timestamp) should win
      expect(doc1.get('count')).toBe(5)
    })
  })

  describe('Offline Queue', () => {
    it('should queue operations when offline', async () => {
      const doc = synckit.document<{ name: string }>('test-doc')

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
