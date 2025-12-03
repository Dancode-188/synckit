/**
 * Server Binary Parsing Test
 *
 * Test the server's parseMessage() function directly with binary data
 * from our BinaryAdapter to see if the issue is in parsing or transmission.
 */

import { describe, test, expect } from 'vitest'
import { BinaryAdapter } from '../integration/helpers/binary-adapter'
// Import server's parseMessage function
import { parseMessage } from '../../server/typescript/src/websocket/protocol'

describe('Server Binary Parsing', () => {
  test('server should parse sync_request with documentId', () => {
    const adapter = new BinaryAdapter()

    // Create a sync_request message like TestClient does
    const clientMessage = {
      type: 'sync_request',
      id: 'msg-123',
      timestamp: Date.now(),
      documentId: 'test-doc-123',
      vectorClock: { client1: 5 },
    }

    console.log('\n=== CLIENT MESSAGE ===')
    console.log(JSON.stringify(clientMessage, null, 2))

    // Encode with BinaryAdapter (what TestClient sends)
    const encoded = adapter.encode(clientMessage)

    console.log('\n=== ENCODED BINARY ===')
    console.log('Length:', encoded.length)
    console.log('Hex:', encoded.toString('hex'))
    console.log('Hex (formatted):')
    console.log('  Type:', encoded.subarray(0, 1).toString('hex'))
    console.log('  Timestamp:', encoded.subarray(1, 9).toString('hex'))
    console.log('  Length:', encoded.subarray(9, 13).toString('hex'))
    console.log('  Payload:', encoded.subarray(13).toString('hex'))
    console.log('  Payload (UTF-8):', encoded.subarray(13).toString('utf8'))

    // Parse with server's parseMessage (what server does)
    const serverMessage = parseMessage(encoded)

    console.log('\n=== SERVER PARSED MESSAGE ===')
    console.log(JSON.stringify(serverMessage, null, 2))

    // Verify server parsed it correctly
    expect(serverMessage).not.toBeNull()
    expect(serverMessage?.type).toBe('sync_request')
    expect((serverMessage as any)?.documentId).toBe('test-doc-123')
    expect((serverMessage as any)?.vectorClock).toEqual({ client1: 5 })
  })

  test('server should parse delta with all fields', () => {
    const adapter = new BinaryAdapter()

    const clientMessage = {
      type: 'delta',
      id: 'msg-456',
      timestamp: Date.now(),
      documentId: 'doc-1',
      delta: { field: 'value' },
      vectorClock: { client1: 10 },
    }

    console.log('\n=== DELTA MESSAGE ===')
    console.log('Client:', JSON.stringify(clientMessage, null, 2))

    const encoded = adapter.encode(clientMessage)
    const serverMessage = parseMessage(encoded)

    console.log('Server:', JSON.stringify(serverMessage, null, 2))

    expect(serverMessage).not.toBeNull()
    expect(serverMessage?.type).toBe('delta')
    expect((serverMessage as any)?.documentId).toBe('doc-1')
    expect((serverMessage as any)?.delta).toEqual({ field: 'value' })
    expect((serverMessage as any)?.vectorClock).toEqual({ client1: 10 })
  })

  test('server should parse auth message', () => {
    const adapter = new BinaryAdapter()

    const clientMessage = {
      type: 'auth',
      id: 'msg-789',
      timestamp: Date.now(),
      token: 'test-token-123',
    }

    const encoded = adapter.encode(clientMessage)
    const serverMessage = parseMessage(encoded)

    console.log('\n=== AUTH MESSAGE ===')
    console.log('Client:', JSON.stringify(clientMessage, null, 2))
    console.log('Server:', JSON.stringify(serverMessage, null, 2))

    expect(serverMessage).not.toBeNull()
    expect(serverMessage?.type).toBe('auth')
    expect((serverMessage as any)?.token).toBe('test-token-123')
  })

  test('compare TestClient format vs SDK format', () => {
    const adapter = new BinaryAdapter()

    // TestClient format (fields at root)
    const testClientMsg = {
      type: 'sync_request',
      id: 'msg-1',
      timestamp: 123456789,
      documentId: 'doc-1',
      vectorClock: { client1: 5 },
    }

    // SDK format (fields in payload)
    const sdkMsg = {
      type: 'sync_request',
      payload: {
        id: 'msg-1',
        documentId: 'doc-1',
        vectorClock: { client1: 5 },
      },
      timestamp: 123456789,
    }

    const testClientEncoded = adapter.encode(testClientMsg)
    const sdkEncoded = adapter.encode(sdkMsg)

    console.log('\n=== FORMAT COMPARISON ===')
    console.log('TestClient payload:', testClientEncoded.subarray(13).toString('utf8'))
    console.log('SDK payload:', sdkEncoded.subarray(13).toString('utf8'))

    const testClientParsed = parseMessage(testClientEncoded)
    const sdkParsed = parseMessage(sdkEncoded)

    console.log('TestClient parsed:', JSON.stringify(testClientParsed, null, 2))
    console.log('SDK parsed:', JSON.stringify(sdkParsed, null, 2))

    // Both should have documentId
    expect((testClientParsed as any)?.documentId).toBe('doc-1')
    expect((sdkParsed as any)?.documentId).toBe('doc-1')
  })
})
