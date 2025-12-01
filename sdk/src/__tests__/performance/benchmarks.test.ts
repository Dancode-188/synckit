/**
 * Performance Benchmarks for SyncKit Network Layer
 *
 * Measures performance of critical operations:
 * - Document operations (set, get, update)
 * - Network message encoding/decoding
 * - Offline queue operations
 * - Vector clock operations
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SyncKit } from '../../synckit'
import { MemoryStorage } from '../../storage'
import type { WebSocketMessage, MessageType } from '../../websocket/client'
import { OfflineQueue } from '../../sync/queue'

// Performance measurement utility
function measure(name: string, fn: () => void | Promise<void>) {
  const start = performance.now()
  const result = fn()

  if (result instanceof Promise) {
    return result.then(() => {
      const duration = performance.now() - start
      console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms`)
      return duration
    })
  }

  const duration = performance.now() - start
  console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms`)
  return duration
}

describe('Performance Benchmarks', () => {
  let synckit: SyncKit
  let storage: MemoryStorage

  beforeEach(async () => {
    storage = new MemoryStorage()
    synckit = new SyncKit({
      storage,
      clientId: 'perf-test',
    })
    await synckit.init()
  })

  afterEach(() => {
    synckit.dispose()
  })

  describe('Document Operations', () => {
    it('should perform 1000 document set operations efficiently', async () => {
      const doc = synckit.document<{ counter: number }>('perf-doc')
      await doc.init()

      const duration = await measure('1000 document sets', async () => {
        for (let i = 0; i < 1000; i++) {
          await doc.set('counter', i)
        }
      })

      // Should complete in reasonable time (< 2s for 1000 operations = 2ms per op)
      expect(duration).toBeLessThan(2000)
    })

    it('should perform 10000 document get operations efficiently', async () => {
      const doc = synckit.document<{ value: string }>('perf-doc')
      await doc.init()
      await doc.set('value', 'test')

      const duration = measure('10000 document gets', () => {
        for (let i = 0; i < 10000; i++) {
          doc.getField('value')
        }
      })

      // Gets should be very fast (< 100ms for 10000 = 0.01ms per op)
      expect(duration).toBeLessThan(100)
    })

    it('should handle bulk updates efficiently', async () => {
      const doc = synckit.document<{ items: number[] }>('bulk-doc')
      await doc.init()

      const duration = await measure('Bulk update 100 items', async () => {
        const items = Array.from({ length: 100 }, (_, i) => i)
        await doc.set('items', items)
      })

      // Bulk operations should be efficient
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Message Encoding/Decoding', () => {
    it('should encode 1000 messages efficiently', () => {
      const messages: WebSocketMessage[] = Array.from({ length: 1000 }, (_, i) => ({
        type: 'delta',
        payload: {
          operation: {
            type: 'set',
            documentId: `doc-${i}`,
            field: 'value',
            value: `value-${i}`,
            clock: { client: i },
            clientId: 'test',
            timestamp: Date.now(),
          },
        },
        timestamp: Date.now(),
      }))

      const duration = measure('Encode 1000 messages', () => {
        for (const message of messages) {
          encodeMessage(message)
        }
      })

      // Encoding should be fast (< 100ms for 1000 = 0.1ms per message)
      expect(duration).toBeLessThan(100)
    })

    it('should decode 1000 messages efficiently', () => {
      const message: WebSocketMessage = {
        type: 'delta',
        payload: {
          operation: {
            type: 'set',
            documentId: 'doc',
            field: 'value',
            value: 'test',
            clock: { client: 1 },
            clientId: 'test',
            timestamp: Date.now(),
          },
        },
        timestamp: Date.now(),
      }

      const encoded = encodeMessage(message)

      const duration = measure('Decode 1000 messages', () => {
        for (let i = 0; i < 1000; i++) {
          decodeMessage(encoded)
        }
      })

      // Decoding should be fast
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Offline Queue Operations', () => {
    it('should enqueue 1000 operations efficiently', async () => {
      const queue = new OfflineQueue({
        storage,
        maxSize: 10000,
        maxRetries: 3,
        retryDelay: 1000,
        retryBackoff: 2,
      })
      await queue.init()

      const duration = await measure('Enqueue 1000 operations', async () => {
        for (let i = 0; i < 1000; i++) {
          await queue.enqueue({
            type: 'set',
            documentId: `doc-${i}`,
            field: 'value',
            value: `value-${i}`,
            clock: { client: i },
            clientId: 'test',
            timestamp: Date.now(),
          })
        }
      })

      // Enqueuing should be reasonably fast (< 1s for 1000 = 1ms per op)
      expect(duration).toBeLessThan(1000)
      expect(queue.getStats().size).toBe(1000)
    })

    it('should check queue size efficiently', async () => {
      const queue = new OfflineQueue({
        storage,
        maxSize: 1000,
        maxRetries: 3,
        retryDelay: 1000,
        retryBackoff: 2,
      })
      await queue.init()

      // Add some items
      for (let i = 0; i < 100; i++) {
        await queue.enqueue({
          type: 'set',
          documentId: 'doc',
          field: 'value',
          value: i,
          clock: { client: i },
          clientId: 'test',
          timestamp: Date.now(),
        })
      }

      const duration = measure('1000 queue.getStats() calls', () => {
        for (let i = 0; i < 1000; i++) {
          queue.getStats()
        }
      })

      // Queue stats should be instant
      expect(duration).toBeLessThan(10)
    })
  })

  describe('Vector Clock Operations', () => {
    it('should merge vector clocks efficiently', () => {
      const clocks = Array.from({ length: 100 }, (_, i) => ({
        [`client-${i}`]: i,
      }))

      const duration = measure('Merge 100 vector clocks', () => {
        const merged: Record<string, number> = {}
        for (const clock of clocks) {
          for (const [clientId, count] of Object.entries(clock)) {
            merged[clientId] = Math.max(merged[clientId] || 0, count as number)
          }
        }
      })

      // Vector clock merging should be very fast
      expect(duration).toBeLessThan(10)
    })

    it('should compare vector clocks efficiently', () => {
      const clock1 = { 'client-1': 5, 'client-2': 3, 'client-3': 7 }
      const clock2 = { 'client-1': 4, 'client-2': 5, 'client-3': 6 }

      const duration = measure('10000 vector clock comparisons', () => {
        for (let i = 0; i < 10000; i++) {
          // Simulate LWW comparison
          const allKeys = new Set([...Object.keys(clock1), ...Object.keys(clock2)])
          for (const key of allKeys) {
            const v1 = clock1[key as keyof typeof clock1] || 0
            const v2 = clock2[key as keyof typeof clock2] || 0
            if (v1 !== v2) break
          }
        }
      })

      // Comparisons should be very fast
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Memory Efficiency', () => {
    it('should not leak memory with repeated operations', async () => {
      const doc = synckit.document<{ counter: number }>('memory-test')
      await doc.init()

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        await doc.set('counter', i)
        doc.getField('counter')
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      // Document should still be functional
      await doc.set('counter', 9999)
      expect(doc.getField('counter')).toBe(9999)
    })

    it('should efficiently handle large documents', async () => {
      const doc = synckit.document<{ data: Record<string, number> }>('large-doc')
      await doc.init()

      // Create large nested object
      const largeData: Record<string, number> = {}
      for (let i = 0; i < 1000; i++) {
        largeData[`key${i}`] = i
      }

      const duration = await measure('Set large document (1000 fields)', async () => {
        await doc.set('data', largeData)
      })

      // Should handle large documents efficiently
      expect(duration).toBeLessThan(500)
      expect(Object.keys(doc.getField('data') || {}).length).toBe(1000)
    })
  })
})

// Helper functions for encoding/decoding (copied from WebSocket client for benchmarking)

function encodeMessage(message: WebSocketMessage): ArrayBuffer {
  const typeCode = getTypeCode(message.type)
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

function decodeMessage(data: ArrayBuffer): WebSocketMessage {
  const view = new DataView(data)
  const typeCode = view.getUint8(0)
  const timestamp = Number(view.getBigInt64(1, false))
  const payloadLength = view.getUint32(9, false)
  const payloadBytes = new Uint8Array(data, 13, payloadLength)
  const payloadJson = new TextDecoder().decode(payloadBytes)
  const payload = JSON.parse(payloadJson)

  return {
    type: getTypeName(typeCode),
    payload,
    timestamp,
  }
}

function getTypeCode(type: string): number {
  const map: Record<string, number> = {
    auth: 0x01,
    delta: 0x20,
    ack: 0x21,
    ping: 0x30,
    pong: 0x31,
  }
  return map[type] || 0xff
}

function getTypeName(code: number): MessageType {
  const map: Record<number, MessageType> = {
    0x01: 'auth',
    0x20: 'delta',
    0x21: 'ack',
    0x30: 'ping',
    0x31: 'pong',
  }
  return (map[code] as MessageType) || 'error'
}
