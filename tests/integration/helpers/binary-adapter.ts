/**
 * Binary Protocol Adapter
 *
 * Implements binary WebSocket protocol matching SDK client implementation.
 * Uses same 13-byte header format as sdk/src/websocket/client.ts
 *
 * Binary Message Format:
 * ┌─────────────┬──────────────┬───────────────┬──────────────┐
 * │ Type (1B)   │ Timestamp    │ Payload Length│ Payload      │
 * │ Uint8       │ (8B BigInt64)│ (4B Uint32)   │ (JSON UTF-8) │
 * └─────────────┴──────────────┴───────────────┴──────────────┘
 *      0            1-8             9-12            13+
 *
 * - Type: Message type code (see MessageTypeCode enum)
 * - Timestamp: Unix timestamp in milliseconds (Big Endian Int64)
 * - Payload Length: Length of JSON payload in bytes (Big Endian Uint32)
 * - Payload: JSON-encoded message payload (UTF-8)
 */

import { ProtocolAdapter } from './protocol-adapter'

/**
 * Message type codes for binary encoding
 * MUST match sdk/src/websocket/client.ts:82-95 EXACTLY
 */
enum MessageTypeCode {
  // Authentication
  AUTH = 0x01,
  AUTH_SUCCESS = 0x02,
  AUTH_ERROR = 0x03,

  // Subscription
  SUBSCRIBE = 0x10,
  UNSUBSCRIBE = 0x11,
  SYNC_REQUEST = 0x12,
  SYNC_RESPONSE = 0x13,

  // Delta operations
  DELTA = 0x20,
  ACK = 0x21,

  // Heartbeat
  PING = 0x30,
  PONG = 0x31,

  // Errors
  ERROR = 0xff,
}

/**
 * Binary Protocol Adapter
 *
 * Encodes/decodes messages using the same binary format as SDK client.
 * This enables integration tests to use the exact same protocol as production.
 */
export class BinaryAdapter implements ProtocolAdapter {
  protocol = 'binary' as const

  /**
   * Encode message to binary format
   *
   * Implements same logic as sdk/src/websocket/client.ts:631-652
   *
   * @param msg - Message to encode (must have type, payload, timestamp)
   * @returns Binary buffer with 13-byte header + JSON payload
   */
  encode(msg: any): Buffer {
    // Get type code
    const typeCode = this.getTypeCode(msg.type)

    // Handle both TestClient format (fields at root) and SDK format (fields in payload)
    let payload: any
    if (msg.payload !== undefined) {
      // SDK format: { type, payload: {...}, timestamp }
      payload = msg.payload
    } else {
      // TestClient format: { type, field1, field2, ..., timestamp }
      // Extract all fields except type and timestamp (keep id and other fields!)
      const { type, timestamp, ...rest } = msg
      payload = rest
    }

    // Encode payload as JSON
    const payloadJson = JSON.stringify(payload)
    const payloadBytes = Buffer.from(payloadJson, 'utf8')

    // Allocate buffer: 1 (type) + 8 (timestamp) + 4 (length) + payload
    const buffer = Buffer.alloc(13 + payloadBytes.length)

    // Write type code (1 byte at offset 0)
    buffer.writeUInt8(typeCode, 0)

    // Write timestamp (8 bytes at offset 1, Big Endian)
    const timestamp = msg.timestamp || Date.now()
    buffer.writeBigInt64BE(BigInt(timestamp), 1)

    // Write payload length (4 bytes at offset 9, Big Endian)
    buffer.writeUInt32BE(payloadBytes.length, 9)

    // Write payload (starting at offset 13)
    payloadBytes.copy(buffer, 13)

    return buffer
  }

  /**
   * Decode binary message to object
   *
   * Implements same logic as sdk/src/websocket/client.ts:657-679
   *
   * @param data - Binary buffer from WebSocket
   * @returns Decoded message object
   * @throws Error if data is not a Buffer or is malformed
   */
  decode(data: Buffer | string): any {
    if (typeof data === 'string') {
      throw new Error('BinaryAdapter received string data (expected Buffer)')
    }

    // Validate minimum size (13-byte header)
    if (data.length < 13) {
      throw new Error(
        `Binary message too short: ${data.length} bytes (minimum 13 required)`
      )
    }

    // Read type code (1 byte at offset 0)
    const typeCode = data.readUInt8(0)

    // Read timestamp (8 bytes at offset 1, Big Endian)
    const timestamp = Number(data.readBigInt64BE(1))

    // Read payload length (4 bytes at offset 9, Big Endian)
    const payloadLength = data.readUInt32BE(9)

    // Validate payload length
    if (data.length < 13 + payloadLength) {
      throw new Error(
        `Invalid payload length: claims ${payloadLength} bytes, ` +
          `but only ${data.length - 13} available`
      )
    }

    // Read payload (starting at offset 13)
    const payloadBytes = data.subarray(13, 13 + payloadLength)
    const payloadJson = payloadBytes.toString('utf8')
    const payload = JSON.parse(payloadJson)

    // Construct message
    // Note: payload may contain 'id', 'type', etc. - we merge it with header data
    const message = {
      type: this.getTypeName(typeCode),
      timestamp,
      id: payload.id || this.generateMessageId(),
      ...payload, // Spread payload fields (may overwrite 'id' if present)
    }

    return message
  }

  /**
   * Map message type name to binary type code
   *
   * MUST match sdk/src/websocket/client.ts:684-701
   */
  private getTypeCode(type: string): number {
    const map: Record<string, MessageTypeCode> = {
      auth: MessageTypeCode.AUTH,
      auth_success: MessageTypeCode.AUTH_SUCCESS,
      auth_error: MessageTypeCode.AUTH_ERROR,
      subscribe: MessageTypeCode.SUBSCRIBE,
      unsubscribe: MessageTypeCode.UNSUBSCRIBE,
      sync_request: MessageTypeCode.SYNC_REQUEST,
      sync_response: MessageTypeCode.SYNC_RESPONSE,
      delta: MessageTypeCode.DELTA,
      ack: MessageTypeCode.ACK,
      ping: MessageTypeCode.PING,
      pong: MessageTypeCode.PONG,
      error: MessageTypeCode.ERROR,
    }

    const code = map[type]
    if (code === undefined) {
      throw new Error(`Unknown message type: ${type}`)
    }

    return code
  }

  /**
   * Map binary type code to message type name
   *
   * MUST match sdk/src/websocket/client.ts:706-722
   */
  private getTypeName(code: number): string {
    const map: Record<number, string> = {
      [MessageTypeCode.AUTH]: 'auth',
      [MessageTypeCode.AUTH_SUCCESS]: 'auth_success',
      [MessageTypeCode.AUTH_ERROR]: 'auth_error',
      [MessageTypeCode.SUBSCRIBE]: 'subscribe',
      [MessageTypeCode.UNSUBSCRIBE]: 'unsubscribe',
      [MessageTypeCode.SYNC_REQUEST]: 'sync_request',
      [MessageTypeCode.SYNC_RESPONSE]: 'sync_response',
      [MessageTypeCode.DELTA]: 'delta',
      [MessageTypeCode.ACK]: 'ack',
      [MessageTypeCode.PING]: 'ping',
      [MessageTypeCode.PONG]: 'pong',
      [MessageTypeCode.ERROR]: 'error',
    }

    const type = map[code]
    if (!type) {
      console.warn(`Unknown type code: 0x${code.toString(16)}`)
      return 'error'
    }

    return type
  }

  /**
   * Generate unique message ID
   * Same format as SDK client and server
   */
  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}
