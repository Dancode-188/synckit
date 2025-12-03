/**
 * Protocol Adapter Interface
 *
 * Strategy Pattern for WebSocket protocol serialization.
 * Allows TestClient to support both JSON and binary protocols
 * without code duplication.
 */

/**
 * Protocol adapter interface for message encoding/decoding
 */
export interface ProtocolAdapter {
  /**
   * Encode message for transmission over WebSocket
   * @param msg - Message object to encode
   * @returns Encoded message (Buffer for binary, string for JSON)
   */
  encode(msg: any): Buffer | string

  /**
   * Decode message received from WebSocket
   * @param data - Raw data from WebSocket (Buffer or string)
   * @returns Decoded message object
   */
  decode(data: Buffer | string): any

  /**
   * Protocol identifier (for debugging)
   */
  protocol: 'json' | 'binary'
}

/**
 * JSON Protocol Adapter
 *
 * Uses JSON.stringify/JSON.parse for message serialization.
 * This is the legacy protocol used by all existing tests.
 *
 * Format: Plain JSON string
 * Example: '{"type":"delta","id":"123","timestamp":1234567890,"payload":{...}}'
 */
export class JsonAdapter implements ProtocolAdapter {
  protocol = 'json' as const

  /**
   * Encode message as JSON string
   */
  encode(msg: any): string {
    return JSON.stringify(msg)
  }

  /**
   * Decode JSON string to message object
   */
  decode(data: Buffer | string): any {
    const str = typeof data === 'string' ? data : data.toString('utf8')
    return JSON.parse(str)
  }
}
