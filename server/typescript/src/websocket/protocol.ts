/**
 * WebSocket Protocol Types
 *
 * Implements binary wire protocol compatible with SDK client.
 * Also maintains backward compatibility with JSON text protocol.
 *
 * Binary Message Format:
 * ┌─────────────┬──────────────┬───────────────┬──────────────┐
 * │ Type (1 byte)│ Timestamp    │ Payload Length│ Payload      │
 * │              │ (8 bytes)    │ (4 bytes)     │ (JSON bytes) │
 * └─────────────┴──────────────┴───────────────┴──────────────┘
 */

/**
 * Message type codes for binary encoding (must match SDK client exactly)
 */
export enum MessageTypeCode {
  AUTH = 0x01,
  AUTH_SUCCESS = 0x02,
  AUTH_ERROR = 0x03,
  SUBSCRIBE = 0x10,
  UNSUBSCRIBE = 0x11,
  SYNC_REQUEST = 0x12,
  SYNC_RESPONSE = 0x13,
  DELTA = 0x20,
  ACK = 0x21,
  PING = 0x30,
  PONG = 0x31,
  AWARENESS_UPDATE = 0x40,
  AWARENESS_SUBSCRIBE = 0x41,
  AWARENESS_STATE = 0x42,
  ERROR = 0xff,
}

/**
 * Message type names (string representation)
 */
export enum MessageType {
  // Connection lifecycle
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  PING = 'ping',
  PONG = 'pong',

  // Authentication
  AUTH = 'auth',
  AUTH_SUCCESS = 'auth_success',
  AUTH_ERROR = 'auth_error',

  // Sync operations
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  SYNC_REQUEST = 'sync_request',
  SYNC_RESPONSE = 'sync_response',
  DELTA = 'delta',
  ACK = 'ack',

  // Awareness (presence)
  AWARENESS_UPDATE = 'awareness_update',
  AWARENESS_SUBSCRIBE = 'awareness_subscribe',
  AWARENESS_STATE = 'awareness_state',

  // Errors
  ERROR = 'error',
}

export interface BaseMessage {
  type: MessageType;
  id: string; // Message ID for request/response tracking
  timestamp: number;
}

export interface ConnectMessage extends BaseMessage {
  type: MessageType.CONNECT;
  clientId: string;
  version: string;
}

export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

export interface AuthMessage extends BaseMessage {
  type: MessageType.AUTH;
  token?: string; // JWT token
  apiKey?: string; // API key (alternative auth)
}

export interface AuthSuccessMessage extends BaseMessage {
  type: MessageType.AUTH_SUCCESS;
  userId: string;
  permissions: Record<string, any>;
}

export interface AuthErrorMessage extends BaseMessage {
  type: MessageType.AUTH_ERROR;
  error: string;
}

export interface SubscribeMessage extends BaseMessage {
  type: MessageType.SUBSCRIBE;
  documentId: string;
}

export interface UnsubscribeMessage extends BaseMessage {
  type: MessageType.UNSUBSCRIBE;
  documentId: string;
}

export interface SyncRequestMessage extends BaseMessage {
  type: MessageType.SYNC_REQUEST;
  documentId: string;
  vectorClock?: Record<string, number>;
}

export interface SyncResponseMessage extends BaseMessage {
  type: MessageType.SYNC_RESPONSE;
  requestId: string;
  documentId: string;
  state?: any; // Document state
  deltas?: any[]; // Delta updates
}

export interface DeltaMessage extends BaseMessage {
  type: MessageType.DELTA;
  documentId: string;
  delta: any;
  vectorClock: Record<string, number>;
}

export interface AckMessage extends BaseMessage {
  type: MessageType.ACK;
  messageId: string; // ID of message being acknowledged
}

export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
  details?: any;
}

export interface AwarenessUpdateMessage extends BaseMessage {
  type: MessageType.AWARENESS_UPDATE;
  documentId: string;
  clientId: string;
  state: Record<string, unknown> | null; // null means client left
  clock: number;
}

export interface AwarenessSubscribeMessage extends BaseMessage {
  type: MessageType.AWARENESS_SUBSCRIBE;
  documentId: string;
}

export interface AwarenessStateMessage extends BaseMessage {
  type: MessageType.AWARENESS_STATE;
  documentId: string;
  states: Array<{
    clientId: string;
    state: Record<string, unknown>;
    clock: number;
  }>;
}

export type Message =
  | ConnectMessage
  | PingMessage
  | PongMessage
  | AuthMessage
  | AuthSuccessMessage
  | AuthErrorMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | SyncRequestMessage
  | SyncResponseMessage
  | DeltaMessage
  | AckMessage
  | AwarenessUpdateMessage
  | AwarenessSubscribeMessage
  | AwarenessStateMessage
  | ErrorMessage;

/**
 * Type code to type name mapping (for binary protocol decoding)
 */
const TYPE_CODE_TO_NAME: Record<number, MessageType> = {
  [MessageTypeCode.AUTH]: MessageType.AUTH,
  [MessageTypeCode.AUTH_SUCCESS]: MessageType.AUTH_SUCCESS,
  [MessageTypeCode.AUTH_ERROR]: MessageType.AUTH_ERROR,
  [MessageTypeCode.SUBSCRIBE]: MessageType.SUBSCRIBE,
  [MessageTypeCode.UNSUBSCRIBE]: MessageType.UNSUBSCRIBE,
  [MessageTypeCode.SYNC_REQUEST]: MessageType.SYNC_REQUEST,
  [MessageTypeCode.SYNC_RESPONSE]: MessageType.SYNC_RESPONSE,
  [MessageTypeCode.DELTA]: MessageType.DELTA,
  [MessageTypeCode.ACK]: MessageType.ACK,
  [MessageTypeCode.PING]: MessageType.PING,
  [MessageTypeCode.PONG]: MessageType.PONG,
  [MessageTypeCode.AWARENESS_UPDATE]: MessageType.AWARENESS_UPDATE,
  [MessageTypeCode.AWARENESS_SUBSCRIBE]: MessageType.AWARENESS_SUBSCRIBE,
  [MessageTypeCode.AWARENESS_STATE]: MessageType.AWARENESS_STATE,
  [MessageTypeCode.ERROR]: MessageType.ERROR,
};

/**
 * Type name to type code mapping (for binary protocol encoding)
 */
const TYPE_NAME_TO_CODE: Record<MessageType, number> = {
  [MessageType.AUTH]: MessageTypeCode.AUTH,
  [MessageType.AUTH_SUCCESS]: MessageTypeCode.AUTH_SUCCESS,
  [MessageType.AUTH_ERROR]: MessageTypeCode.AUTH_ERROR,
  [MessageType.SUBSCRIBE]: MessageTypeCode.SUBSCRIBE,
  [MessageType.UNSUBSCRIBE]: MessageTypeCode.UNSUBSCRIBE,
  [MessageType.SYNC_REQUEST]: MessageTypeCode.SYNC_REQUEST,
  [MessageType.SYNC_RESPONSE]: MessageTypeCode.SYNC_RESPONSE,
  [MessageType.DELTA]: MessageTypeCode.DELTA,
  [MessageType.ACK]: MessageTypeCode.ACK,
  [MessageType.PING]: MessageTypeCode.PING,
  [MessageType.PONG]: MessageTypeCode.PONG,
  [MessageType.AWARENESS_UPDATE]: MessageTypeCode.AWARENESS_UPDATE,
  [MessageType.AWARENESS_SUBSCRIBE]: MessageTypeCode.AWARENESS_SUBSCRIBE,
  [MessageType.AWARENESS_STATE]: MessageTypeCode.AWARENESS_STATE,
  [MessageType.ERROR]: MessageTypeCode.ERROR,
  [MessageType.CONNECT]: MessageTypeCode.AUTH, // Map connect to auth for compatibility
  [MessageType.DISCONNECT]: MessageTypeCode.ERROR,
};

/**
 * Parse WebSocket message (supports both binary and JSON protocols)
 */
export function parseMessage(data: Buffer | string): Message | null {
  // Detect protocol type
  if (typeof data === 'string') {
    // Legacy JSON protocol
    return parseJsonMessage(data);
  }

  // Binary protocol (Buffer)
  return parseBinaryMessage(data);
}

/**
 * Parse binary protocol message
 *
 * Binary format:
 * - Byte 0: Type code (uint8)
 * - Bytes 1-8: Timestamp (int64, big-endian)
 * - Bytes 9-12: Payload length (uint32, big-endian)
 * - Bytes 13+: Payload (JSON string as UTF-8)
 */
function parseBinaryMessage(data: Buffer): Message | null {
  try {
    // Minimum size check: 13 bytes (type + timestamp + payload length)
    if (data.length < 13) {
      console.error('[Protocol] Binary message too short:', data.length);
      return null;
    }

    // Read header
    const typeCode = data.readUInt8(0);
    const timestamp = Number(data.readBigInt64BE(1));
    const payloadLength = data.readUInt32BE(9);

    // Validate payload length
    if (data.length < 13 + payloadLength) {
      console.error('[Protocol] Invalid payload length:', payloadLength, 'available:', data.length - 13);
      return null;
    }

    // Read payload
    const payloadBytes = data.subarray(13, 13 + payloadLength);
    const payloadJson = payloadBytes.toString('utf8');
    const payload = JSON.parse(payloadJson);

    // Get message type name
    const type = TYPE_CODE_TO_NAME[typeCode];
    if (!type) {
      console.error('[Protocol] Unknown type code:', typeCode);
      return null;
    }

    // Construct message
    // Note: Exclude 'type' from payload to avoid overwriting the correct type from header
    const { type: _payloadType, ...payloadWithoutType } = payload;
    const message: any = {
      type,
      id: payload.id || createMessageId(),
      timestamp,
      ...payloadWithoutType,
    };

    return message as Message;
  } catch (error) {
    console.error('[Protocol] Error parsing binary message:', error);
    return null;
  }
}

/**
 * Parse JSON protocol message (legacy/backward compatibility)
 */
function parseJsonMessage(raw: string): Message | null {
  try {
    const data = JSON.parse(raw);
    if (!data.type || !data.id || !data.timestamp) {
      return null;
    }
    return data as Message;
  } catch {
    return null;
  }
}

/**
 * Serialize message for transmission (supports both binary and JSON protocols)
 */
export function serializeMessage(message: Message, useBinary: boolean = true): Buffer | string {
  if (!useBinary) {
    // Legacy JSON protocol
    return JSON.stringify(message);
  }

  // Binary protocol
  return serializeBinaryMessage(message);
}

/**
 * Serialize message to binary format
 *
 * Binary format:
 * - Byte 0: Type code (uint8)
 * - Bytes 1-8: Timestamp (int64, big-endian)
 * - Bytes 9-12: Payload length (uint32, big-endian)
 * - Bytes 13+: Payload (JSON string as UTF-8)
 */
function serializeBinaryMessage(message: Message): Buffer {
  // Get type code
  const typeCode = TYPE_NAME_TO_CODE[message.type];
  if (typeCode === undefined) {
    throw new Error(`[Protocol] Unknown message type: ${message.type}`);
  }

  // Create payload (exclude type from payload, it's in the header)
  const { type, timestamp, ...payloadData } = message;
  const payloadJson = JSON.stringify(payloadData);
  const payloadBytes = Buffer.from(payloadJson, 'utf8');

  // Create buffer: 1 + 8 + 4 + payload length
  const buffer = Buffer.allocUnsafe(13 + payloadBytes.length);

  // Write header
  buffer.writeUInt8(typeCode, 0);
  buffer.writeBigInt64BE(BigInt(timestamp), 1);
  buffer.writeUInt32BE(payloadBytes.length, 9);

  // Write payload
  payloadBytes.copy(buffer, 13);

  return buffer;
}

/**
 * Create message ID
 */
export function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
