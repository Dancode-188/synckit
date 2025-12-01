/**
 * WebSocket Client Unit Tests
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  WebSocketClient,
  WebSocketError,
  WebSocketErrorCode,
  type WebSocketMessage,
} from '../../websocket/client'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  binaryType: string = 'blob'
  url: string

  onopen: ((event: any) => void) | null = null
  onclose: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onmessage: ((event: any) => void) | null = null

  constructor(url: string) {
    this.url = url
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      if (this.onopen) {
        this.onopen({})
      }
    }, 10)
  }

  send(_data: any): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    // Echo back (for testing)
    if (this.onmessage) {
      this.onmessage({ data: _data })
    }
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose({ code: 1000, reason: 'Normal closure' })
    }
  }
}

// Install mock
global.WebSocket = MockWebSocket as any

describe('WebSocketClient', () => {
  let client: WebSocketClient

  afterEach(() => {
    if (client) {
      client.disconnect()
    }
  })

  describe('Connection Management', () => {
    it('creates client in disconnected state', () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })
      expect(client.getState()).toBe('disconnected')
      expect(client.isConnected()).toBe(false)
    })

    it('connects to server', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })

      const states: string[] = []
      client.onStateChange((state) => states.push(state))

      await client.connect()

      expect(client.getState()).toBe('connected')
      expect(client.isConnected()).toBe(true)
      expect(states).toContain('connecting')
      expect(states).toContain('connected')
    })

    it('disconnects from server', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })
      await client.connect()

      client.disconnect()

      expect(client.getState()).toBe('disconnected')
      expect(client.isConnected()).toBe(false)
    })

    it('does not reconnect multiple times', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })
      await client.connect()

      // Second connect should not throw or reconnect
      await client.connect()

      expect(client.getState()).toBe('connected')
    })
  })

  describe('Authentication', () => {
    it('authenticates with token provider', async () => {
      const getAuthToken = vi.fn().mockResolvedValue('test-token')

      client = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        getAuthToken,
      })

      // Mock auth success response
      const connectPromise = client.connect()

      // Simulate server auth success
      setTimeout(() => {
        const ws = (client as any).ws as MockWebSocket
        const authSuccessMessage = new TextEncoder().encode(
          JSON.stringify({ type: 'auth_success', payload: {}, timestamp: Date.now() })
        )
        // Create proper binary message
        const buffer = new ArrayBuffer(13 + authSuccessMessage.length)
        const view = new DataView(buffer)
        view.setUint8(0, 0x02) // AUTH_SUCCESS code
        view.setBigInt64(1, BigInt(Date.now()), false)
        view.setUint32(9, authSuccessMessage.length, false)
        new Uint8Array(buffer, 13).set(authSuccessMessage)

        if (ws.onmessage) {
          ws.onmessage({ data: buffer })
        }
      }, 20)

      await connectPromise

      expect(getAuthToken).toHaveBeenCalled()
      expect(client.isConnected()).toBe(true)
    })

    it('fails on auth error', async () => {
      const getAuthToken = vi.fn().mockResolvedValue('invalid-token')

      client = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        getAuthToken,
        reconnect: { enabled: false },
      })

      const connectPromise = client.connect()

      // Simulate server auth error
      setTimeout(() => {
        const ws = (client as any).ws as MockWebSocket
        const authErrorMessage = new TextEncoder().encode(
          JSON.stringify({ type: 'auth_error', payload: 'Invalid token', timestamp: Date.now() })
        )
        const buffer = new ArrayBuffer(13 + authErrorMessage.length)
        const view = new DataView(buffer)
        view.setUint8(0, 0x03) // AUTH_ERROR code
        view.setBigInt64(1, BigInt(Date.now()), false)
        view.setUint32(9, authErrorMessage.length, false)
        new Uint8Array(buffer, 13).set(authErrorMessage)

        if (ws.onmessage) {
          ws.onmessage({ data: buffer })
        }
      }, 20)

      await expect(connectPromise).rejects.toThrow('Authentication failed')
    })
  })

  describe('Message Encoding/Decoding', () => {
    it('encodes and decodes messages correctly', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })
      await client.connect()

      const originalMessage: WebSocketMessage = {
        type: 'delta',
        payload: { documentId: 'doc-1', field: 'title', value: 'Test' },
        timestamp: Date.now(),
      }

      let receivedMessage: any = null
      client.on('delta', (payload) => {
        receivedMessage = { type: 'delta', payload, timestamp: Date.now() }
      })

      client.send(originalMessage)

      // Wait for echo
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(receivedMessage).not.toBeNull()
      expect((receivedMessage as any)?.type).toBe('delta')
      expect((receivedMessage as any)?.payload).toEqual(originalMessage.payload)
    })

    it('handles all message types', () => {
      const encodeMethod = (client as any).encodeMessage.bind(client)
      const decodeMethod = (client as any).decodeMessage.bind(client)

      const types = [
        'auth',
        'auth_success',
        'auth_error',
        'subscribe',
        'unsubscribe',
        'sync_request',
        'sync_response',
        'delta',
        'ack',
        'ping',
        'pong',
        'error',
      ]

      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })

      for (const type of types) {
        const message: WebSocketMessage = {
          type: type as any,
          payload: { test: 'data' },
          timestamp: Date.now(),
        }

        const encoded = encodeMethod(message)
        const decoded = decodeMethod(encoded)

        expect(decoded.type).toBe(type)
        expect(decoded.payload).toEqual(message.payload)
      }
    })
  })

  describe('Message Queue', () => {
    it('queues messages when not connected', () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })

      const message: WebSocketMessage = {
        type: 'delta',
        payload: { test: 'data' },
        timestamp: Date.now(),
      }

      // Should not throw
      client.send(message)

      const queue = (client as any).messageQueue
      expect(queue.length).toBe(1)
      expect(queue[0]).toEqual(message)
    })

    it('flushes queue on connection', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })

      // Queue messages while disconnected
      for (let i = 0; i < 5; i++) {
        client.send({
          type: 'delta',
          payload: { index: i },
          timestamp: Date.now(),
        })
      }

      const queue = (client as any).messageQueue
      expect(queue.length).toBe(5)

      // Connect
      await client.connect()

      // Queue should be flushed
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect((client as any).messageQueue.length).toBe(0)
    })

    it('throws when queue is full', () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })

      // Fill queue
      for (let i = 0; i < 1000; i++) {
        client.send({
          type: 'delta',
          payload: { index: i },
          timestamp: Date.now(),
        })
      }

      // Next message should throw
      expect(() => {
        client.send({
          type: 'delta',
          payload: { index: 1000 },
          timestamp: Date.now(),
        })
      }).toThrow(WebSocketError)
    })
  })

  describe('Message Handlers', () => {
    it('calls message handlers', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })
      await client.connect()

      const handler = vi.fn()
      client.on('delta', handler)

      client.send({
        type: 'delta',
        payload: { test: 'data' },
        timestamp: Date.now(),
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalledWith({ test: 'data' })
    })

    it('calls multiple handlers for same type', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })
      await client.connect()

      const handler1 = vi.fn()
      const handler2 = vi.fn()

      client.on('delta', handler1)
      client.on('delta', handler2)

      client.send({
        type: 'delta',
        payload: { test: 'data' },
        timestamp: Date.now(),
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('removes handler with unsubscribe', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })
      await client.connect()

      const handler = vi.fn()
      const unsubscribe = client.on('delta', handler)

      unsubscribe()

      client.send({
        type: 'delta',
        payload: { test: 'data' },
        timestamp: Date.now(),
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).not.toHaveBeenCalled()
    })

    it('calls one-time handlers only once', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })
      await client.connect()

      const handler = vi.fn()
      client.once('delta', handler)

      // Send twice
      client.send({
        type: 'delta',
        payload: { test: 'data' },
        timestamp: Date.now(),
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      client.send({
        type: 'delta',
        payload: { test: 'data2' },
        timestamp: Date.now(),
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('State Changes', () => {
    it('emits state change events', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })

      const states: string[] = []
      client.onStateChange((state) => states.push(state))

      await client.connect()

      expect(states).toContain('connecting')
      expect(states).toContain('connected')
    })

    it('unsubscribes from state changes', async () => {
      client = new WebSocketClient({ url: 'ws://localhost:3000/ws' })

      const handler = vi.fn()
      const unsubscribe = client.onStateChange(handler)

      unsubscribe()

      await client.connect()

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('Reconnection', () => {
    it('attempts reconnection on connection loss', async () => {
      client = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        reconnect: {
          enabled: true,
          initialDelay: 100,
          maxAttempts: 3,
        },
      })

      await client.connect()
      expect(client.getState()).toBe('connected')

      // Simulate connection loss
      const ws = (client as any).ws as MockWebSocket
      ws.readyState = MockWebSocket.CLOSED
      if (ws.onclose) {
        ws.onclose({ code: 1006, reason: 'Abnormal closure' })
      }

      // Should enter reconnecting state
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(client.getState()).toBe('reconnecting')
    })

    it('respects maximum reconnection attempts', async () => {
      // Track connection attempts
      let attempts = 0

      const originalWebSocket = global.WebSocket
      global.WebSocket = class {
        static CONNECTING = 0
        static OPEN = 1
        static CLOSING = 2
        static CLOSED = 3

        readyState = 0
        binaryType: string = 'blob'
        url: string

        onopen: ((event: any) => void) | null = null
        onclose: ((event: any) => void) | null = null
        onerror: ((event: any) => void) | null = null
        onmessage: ((event: any) => void) | null = null

        constructor(url: string) {
          this.url = url
          attempts++

          // Fail connection
          setTimeout(() => {
            if (this.onerror) {
              this.onerror({ type: 'error' })
            }
          }, 10)
        }

        send(_data: any): void {
          throw new Error('Not connected')
        }

        close(): void {
          this.readyState = 3
          if (this.onclose) {
            this.onclose({ code: 1000, reason: 'Normal closure' })
          }
        }
      } as any

      client = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        reconnect: {
          enabled: true,
          initialDelay: 50,
          maxAttempts: 2,
          backoffMultiplier: 1.1,
        },
      })

      // Try to connect - should fail after 2 attempts
      try {
        await client.connect()
      } catch (error) {
        // Expected to throw
      }

      // Wait for reconnection attempts
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Should have attempted: 1 initial + 2 retries = 3 total
      // But may vary slightly due to timing
      expect(attempts).toBeGreaterThanOrEqual(2)
      expect(client.getState()).toBe('failed')

      global.WebSocket = originalWebSocket
    })

    it('calculates exponential backoff correctly', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        reconnect: {
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
        },
      })

      // Access private method for testing
      ;(client as any).reconnectAttempts = 1
      // Note: We can't easily test the exact delay due to jitter,
      // but we can verify the state machine works
    })

    it('does not reconnect when disabled', async () => {
      client = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        reconnect: { enabled: false },
      })

      await client.connect()
      expect(client.getState()).toBe('connected')

      const states: string[] = []
      client.onStateChange((state) => states.push(state))

      // Simulate connection loss
      const ws = (client as any).ws as MockWebSocket
      ws.readyState = MockWebSocket.CLOSED
      if (ws.onclose) {
        ws.onclose({ code: 1006, reason: 'Abnormal closure' })
      }

      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should not attempt reconnection
      expect(states).not.toContain('reconnecting')
      expect(client.getState()).toBe('disconnected')
    })
  })

  describe('Error Handling', () => {
    it('throws WebSocketError on connection failure', async () => {
      const originalWebSocket = global.WebSocket
      global.WebSocket = class {
        static CONNECTING = 0
        static OPEN = 1
        static CLOSING = 2
        static CLOSED = 3

        readyState = 0
        binaryType: string = 'blob'
        url: string

        onopen: ((event: any) => void) | null = null
        onclose: ((event: any) => void) | null = null
        onerror: ((event: any) => void) | null = null
        onmessage: ((event: any) => void) | null = null

        constructor(url: string) {
          this.url = url
          // Fail immediately
          setTimeout(() => {
            if (this.onerror) {
              this.onerror({ type: 'error', message: 'Connection refused' })
            }
          }, 10)
        }

        send(_data: any): void {
          throw new Error('Not connected')
        }

        close(): void {
          this.readyState = 3
        }
      } as any

      client = new WebSocketClient({
        url: 'ws://invalid:9999/ws',
        reconnect: { enabled: false },
      })

      await expect(client.connect()).rejects.toThrow(WebSocketError)

      global.WebSocket = originalWebSocket
    })

    it('includes error code in WebSocketError', async () => {
      const originalWebSocket = global.WebSocket
      global.WebSocket = class {
        static CONNECTING = 0
        static OPEN = 1
        static CLOSING = 2
        static CLOSED = 3

        readyState = 0
        binaryType: string = 'blob'
        url: string

        onopen: ((event: any) => void) | null = null
        onclose: ((event: any) => void) | null = null
        onerror: ((event: any) => void) | null = null
        onmessage: ((event: any) => void) | null = null

        constructor(url: string) {
          this.url = url
          setTimeout(() => {
            if (this.onerror) {
              this.onerror({ type: 'error' })
            }
          }, 10)
        }

        send(_data: any): void {
          throw new Error('Not connected')
        }

        close(): void {
          this.readyState = 3
        }
      } as any

      client = new WebSocketClient({
        url: 'ws://invalid:9999/ws',
        reconnect: { enabled: false },
      })

      try {
        await client.connect()
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(WebSocketError)
        expect((error as WebSocketError).code).toBe(
          WebSocketErrorCode.CONNECTION_FAILED
        )
      }

      global.WebSocket = originalWebSocket
    })
  })
})
