/**
 * Debug Binary Encoding
 *
 * Test to verify what BinaryAdapter is actually encoding
 */

import { describe, test, expect } from 'vitest'
import { BinaryAdapter } from '../integration/helpers/binary-adapter'

describe('Binary Encoding Debug', () => {
  test('should encode sync_request with documentId', () => {
    const adapter = new BinaryAdapter()

    const message = {
      type: 'sync_request',
      id: 'msg-123',
      timestamp: Date.now(),
      documentId: 'test-doc-123',
    }

    console.log('Input message:', JSON.stringify(message, null, 2))

    const encoded = adapter.encode(message)

    console.log('Encoded buffer length:', encoded.length)
    console.log('Encoded buffer (hex):', encoded.toString('hex'))

    // Decode it back
    const decoded = adapter.decode(encoded)

    console.log('Decoded message:', JSON.stringify(decoded, null, 2))

    // Check if documentId is preserved
    expect(decoded.type).toBe('sync_request')
    expect(decoded.documentId).toBe('test-doc-123')
  })

  test('should handle delta message structure', () => {
    const adapter = new BinaryAdapter()

    const message = {
      type: 'delta',
      id: 'msg-456',
      timestamp: Date.now(),
      documentId: 'doc-1',
      delta: { field: 'value' },
      vectorClock: {},
    }

    console.log('Input delta:', JSON.stringify(message, null, 2))

    const encoded = adapter.encode(message)
    const decoded = adapter.decode(encoded)

    console.log('Decoded delta:', JSON.stringify(decoded, null, 2))

    expect(decoded.type).toBe('delta')
    expect(decoded.documentId).toBe('doc-1')
    expect(decoded.delta).toEqual({ field: 'value' })
  })
})
