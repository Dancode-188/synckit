/**
 * WebSocket Client
 *
 * Manages WebSocket connection to SyncKit server with automatic reconnection,
 * heartbeat, and message handling.
 *
 * @module websocket/client
 */

import type { Unsubscribe } from '../types'

// ====================
// Configuration Types
// ====================

export interface WebSocketConfig {
  /** Server WebSocket URL */
  url: string

  /** Authentication token provider */
  getAuthToken?: () => string | Promise<string>

  /** Reconnection configuration */
  reconnect?: {
    /** Enable automatic reconnection (default: true) */
    enabled?: boolean
    /** Initial delay in ms (default: 1000) */
    initialDelay?: number
    /** Maximum delay in ms (default: 30000) */
    maxDelay?: number
    /** Backoff multiplier (default: 1.5) */
    backoffMultiplier?: number
    /** Maximum reconnection attempts (default: Infinity) */
    maxAttempts?: number
  }

  /** Heartbeat configuration */
  heartbeat?: {
    /** Interval in ms (default: 30000) */
    interval?: number
    /** Timeout in ms (default: 5000) */
    timeout?: number
  }
}

// ====================
// State Types
// ====================

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

// ====================
// Message Types
// ====================

export interface WebSocketMessage {
  type: MessageType
  payload: any
  timestamp: number
}

export type MessageType =
  | 'auth'
  | 'auth_success'
  | 'auth_error'
  | 'subscribe'
  | 'unsubscribe'
  | 'delta'
  | 'sync_request'
  | 'sync_response'
  | 'ack'
  | 'ping'
  | 'pong'
  | 'awareness_update'
  | 'awareness_subscribe'
  | 'awareness_state'
  | 'error'

// Message type codes for binary encoding
enum MessageTypeCode {
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

// ====================
// Internal Config Type
// ====================

interface InternalWebSocketConfig {
  url: string
  getAuthToken?: () => string | Promise<string>
  reconnect: {
    enabled: boolean
    initialDelay: number
    maxDelay: number
    backoffMultiplier: number
    maxAttempts: number
  }
  heartbeat: {
    interval: number
    timeout: number
  }
}

// ====================
// Error Types
// ====================

export enum WebSocketErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  AUTH_FAILED = 'AUTH_FAILED',
  SEND_FAILED = 'SEND_FAILED',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  QUEUE_FULL = 'QUEUE_FULL',
}

export class WebSocketError extends Error {
  constructor(
    message: string,
    public readonly code: WebSocketErrorCode
  ) {
    super(message)
    this.name = 'WebSocketError'
  }
}

// ====================
// WebSocket Client
// ====================

export class WebSocketClient {
  private ws: WebSocket | null = null
  private _state: ConnectionState = 'disconnected'
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private pongTimeout: ReturnType<typeof setTimeout> | null = null

  // Message handling
  private messageQueue: WebSocketMessage[] = []
  private readonly MAX_QUEUE_SIZE = 1000
  private messageHandlers = new Map<MessageType, Set<(payload: any) => void>>()
  private stateChangeHandlers = new Set<(state: ConnectionState) => void>()
  private oneTimeHandlers = new Map<MessageType, Set<(payload: any) => void>>()

  // Configuration with defaults (getAuthToken remains optional)
  private readonly config: InternalWebSocketConfig

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      getAuthToken: config.getAuthToken,
      reconnect: {
        enabled: config.reconnect?.enabled ?? true,
        initialDelay: config.reconnect?.initialDelay ?? 1000,
        maxDelay: config.reconnect?.maxDelay ?? 30000,
        backoffMultiplier: config.reconnect?.backoffMultiplier ?? 1.5,
        maxAttempts: config.reconnect?.maxAttempts ?? Infinity,
      },
      heartbeat: {
        interval: config.heartbeat?.interval ?? 30000,
        timeout: config.heartbeat?.timeout ?? 5000,
      },
    }
  }

  /**
   * Get current connection state
   */
  get state(): ConnectionState {
    return this._state
  }

  /**
   * Connect to WebSocket server
   * Automatically authenticates if token provider given
   */
  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      return
    }

    this._state = 'connecting'
    this.emitStateChange('connecting')

    try {
      await this.establishConnection()
      this.reconnectAttempts = 0
    } catch (error) {
      if (this.config.reconnect.enabled) {
        await this.reconnect()
      } else {
        this._state = 'failed'
        this.emitStateChange('failed')
        throw error
      }
    }
  }

  /**
   * Disconnect from server
   * Cancels automatic reconnection
   */
  disconnect(): void {
    // Cancel reconnection
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Stop heartbeat
    this.stopHeartbeat()

    // Close WebSocket
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this._state = 'disconnected'
    this.emitStateChange('disconnected')
  }

  /**
   * Send message to server
   * Queues message if not connected, sends when connection restored
   *
   * @throws {WebSocketError} if queue is full
   */
  send(message: WebSocketMessage): void {
    if (this.isConnected() && this.ws?.readyState === WebSocket.OPEN) {
      // Send immediately
      try {
        const encoded = this.encodeMessage(message)
        this.ws.send(encoded)
      } catch (error) {
        console.error('Failed to send message:', error)
        // Queue for retry
        this.queueMessage(message)
      }
    } else {
      // Queue for later
      this.queueMessage(message)
    }
  }

  /**
   * Register message handler
   * Handler called for all messages of specified type
   */
  on(type: MessageType, handler: (payload: any) => void): Unsubscribe {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set())
    }
    this.messageHandlers.get(type)!.add(handler)

    return () => {
      const handlers = this.messageHandlers.get(type)
      if (handlers) {
        handlers.delete(handler)
      }
    }
  }

  /**
   * Remove message handler
   */
  off(type: MessageType, handler: (payload: any) => void): void {
    const handlers = this.messageHandlers.get(type)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  /**
   * Register one-time message handler
   * Handler called once then removed
   */
  once(type: MessageType, handler: (payload: any) => void): void {
    if (!this.oneTimeHandlers.has(type)) {
      this.oneTimeHandlers.set(type, new Set())
    }
    this.oneTimeHandlers.get(type)!.add(handler)
  }

  /**
   * Register connection state change handler
   */
  onStateChange(handler: (state: ConnectionState) => void): Unsubscribe {
    this.stateChangeHandlers.add(handler)
    return () => this.stateChangeHandlers.delete(handler)
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this._state
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._state === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }

  // ====================
  // Private Methods
  // ====================

  /**
   * Establish WebSocket connection
   */
  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url)
        this.ws.binaryType = 'arraybuffer'

        // Connection opened
        this.ws.onopen = async () => {
          this._state = 'connected'
          this.emitStateChange('connected')

          // Authenticate if token provider given
          if (this.config.getAuthToken) {
            try {
              const token = await this.config.getAuthToken()
              this.send({
                type: 'auth',
                payload: { token },
                timestamp: Date.now(),
              })

              // Wait for auth success
              this.once('auth_success', () => {
                this.startHeartbeat()
                this.flushQueuedMessages()
                resolve()
              })

              this.once('auth_error', (error) => {
                this.ws?.close()
                reject(
                  new WebSocketError(
                    `Authentication failed: ${error}`,
                    WebSocketErrorCode.AUTH_FAILED
                  )
                )
              })
            } catch (error) {
              this.ws?.close()
              reject(
                new WebSocketError(
                  `Token provider failed: ${error}`,
                  WebSocketErrorCode.AUTH_FAILED
                )
              )
            }
          } else {
            // No auth required
            this.startHeartbeat()
            this.flushQueuedMessages()
            resolve()
          }
        }

        // Message received
        this.ws.onmessage = (event) => {
          this.handleMessage(event)
        }

        // Connection closed
        this.ws.onclose = (event) => {
          this.handleClose(event)
        }

        // Connection error
        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(
            new WebSocketError(
              `Connection failed: ${error}`,
              WebSocketErrorCode.CONNECTION_FAILED
            )
          )
        }
      } catch (error) {
        reject(
          new WebSocketError(
            `Failed to create WebSocket: ${error}`,
            WebSocketErrorCode.CONNECTION_FAILED
          )
        )
      }
    })
  }

  /**
   * Reconnect with exponential backoff
   */
  private async reconnect(): Promise<void> {
    if (!this.config.reconnect.enabled) {
      return
    }

    this._state = 'reconnecting'
    this.emitStateChange('reconnecting')
    this.reconnectAttempts++

    const maxAttempts = this.config.reconnect.maxAttempts
    if (this.reconnectAttempts > maxAttempts) {
      this._state = 'failed'
      this.emitStateChange('failed')
      console.error(`Failed to reconnect after ${maxAttempts} attempts`)
      return
    }

    // Calculate delay with exponential backoff
    const baseDelay = this.config.reconnect.initialDelay
    const maxDelay = this.config.reconnect.maxDelay
    const multiplier = this.config.reconnect.backoffMultiplier

    const delay = Math.min(
      baseDelay * Math.pow(multiplier, this.reconnectAttempts - 1),
      maxDelay
    )

    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random()
    const totalDelay = delay + jitter

    // console.log(
    //   `Reconnecting in ${Math.round(totalDelay)}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`
    // )

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.establishConnection()
        this.reconnectAttempts = 0
        // console.log('Reconnected successfully')
      } catch (error) {
        console.error('Reconnection failed:', error)
        await this.reconnect()
      }
    }, totalDelay)
  }

  /**
   * Handle connection close
   */
  private handleClose(_event: CloseEvent): void {
    // console.log(`WebSocket closed: ${_event.code} ${_event.reason}`)

    this.stopHeartbeat()

    // Check if close was intentional
    if (this._state === 'disconnected') {
      return
    }

    // Attempt reconnection
    if (this.config.reconnect.enabled) {
      this.reconnect()
    } else {
      this._state = 'disconnected'
      this.emitStateChange('disconnected')
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = this.decodeMessage(event.data)

      // Emit to regular handlers
      const handlers = this.messageHandlers.get(message.type)
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message.payload)
          } catch (error) {
            console.error('Message handler error:', error)
          }
        }
      }

      // Emit to one-time handlers
      const oneTimeHandlers = this.oneTimeHandlers.get(message.type)
      if (oneTimeHandlers) {
        for (const handler of oneTimeHandlers) {
          try {
            handler(message.payload)
          } catch (error) {
            console.error('One-time handler error:', error)
          }
        }
        this.oneTimeHandlers.delete(message.type)
      }
    } catch (error) {
      console.error('Failed to handle message:', error)
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()

    const interval = this.config.heartbeat.interval
    const timeout = this.config.heartbeat.timeout

    this.heartbeatTimer = setInterval(() => {
      // Send ping
      this.send({
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
      })

      // Set timeout for pong response
      this.pongTimeout = setTimeout(() => {
        console.warn('Heartbeat timeout - connection may be dead')
        this.handleConnectionLost()
      }, timeout)
    }, interval)

    // Listen for pong
    this.on('pong', () => {
      if (this.pongTimeout) {
        clearTimeout(this.pongTimeout)
        this.pongTimeout = null
      }
    })
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout)
      this.pongTimeout = null
    }
  }

  /**
   * Handle connection lost
   */
  private handleConnectionLost(): void {
    // console.log('Connection lost, reconnecting...')

    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    if (this.config.reconnect.enabled) {
      this.reconnect()
    }
  }

  /**
   * Queue message for later delivery
   */
  private queueMessage(message: WebSocketMessage): void {
    if (this.messageQueue.length >= this.MAX_QUEUE_SIZE) {
      throw new WebSocketError(
        `Message queue full (${this.MAX_QUEUE_SIZE} messages). ` +
          `Connection may be permanently lost.`,
        WebSocketErrorCode.QUEUE_FULL
      )
    }

    this.messageQueue.push(message)
  }

  /**
   * Flush queued messages
   */
  private flushQueuedMessages(): void {
    if (!this.isConnected()) {
      return
    }

    // console.log(`Flushing ${this.messageQueue.length} queued messages`)

    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!
      try {
        const encoded = this.encodeMessage(message)
        this.ws!.send(encoded)
      } catch (error) {
        console.error('Failed to send queued message:', error)
        // Re-queue at front
        this.messageQueue.unshift(message)
        break
      }
    }
  }

  /**
   * Encode message to binary format
   *
   * Binary format:
   * [type: 1 byte][timestamp: 8 bytes][payload length: 4 bytes][payload: JSON]
   */
  private encodeMessage(message: WebSocketMessage): ArrayBuffer {
    const typeCode = this.getTypeCode(message.type)
    const payloadJson = JSON.stringify(message.payload)
    const payloadBytes = new TextEncoder().encode(payloadJson)

    const buffer = new ArrayBuffer(1 + 8 + 4 + payloadBytes.length)
    const view = new DataView(buffer)

    // Write type code
    view.setUint8(0, typeCode)

    // Write timestamp
    view.setBigInt64(1, BigInt(message.timestamp), false)

    // Write payload length
    view.setUint32(9, payloadBytes.length, false)

    // Write payload
    new Uint8Array(buffer, 13).set(payloadBytes)

    return buffer
  }

  /**
   * Decode binary message
   */
  private decodeMessage(data: ArrayBuffer): WebSocketMessage {
    const view = new DataView(data)

    // Read type code
    const typeCode = view.getUint8(0)

    // Read timestamp
    const timestamp = Number(view.getBigInt64(1, false))

    // Read payload length
    const payloadLength = view.getUint32(9, false)

    // Read payload
    const payloadBytes = new Uint8Array(data, 13, payloadLength)
    const payloadJson = new TextDecoder().decode(payloadBytes)
    const payload = JSON.parse(payloadJson)

    return {
      type: this.getTypeName(typeCode),
      payload,
      timestamp,
    }
  }

  /**
   * Get message type code
   */
  private getTypeCode(type: MessageType): number {
    const map: Record<MessageType, MessageTypeCode> = {
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
      awareness_update: MessageTypeCode.AWARENESS_UPDATE,
      awareness_subscribe: MessageTypeCode.AWARENESS_SUBSCRIBE,
      awareness_state: MessageTypeCode.AWARENESS_STATE,
      error: MessageTypeCode.ERROR,
    }

    return map[type]
  }

  /**
   * Get message type name
   */
  private getTypeName(code: number): MessageType {
    const map: Record<number, MessageType> = {
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
      [MessageTypeCode.AWARENESS_UPDATE]: 'awareness_update',
      [MessageTypeCode.AWARENESS_SUBSCRIBE]: 'awareness_subscribe',
      [MessageTypeCode.AWARENESS_STATE]: 'awareness_state',
      [MessageTypeCode.ERROR]: 'error',
    }

    return map[code] || 'error'
  }

  /**
   * Emit state change event
   */
  private emitStateChange(state: ConnectionState): void {
    for (const handler of this.stateChangeHandlers) {
      try {
        handler(state)
      } catch (error) {
        console.error('State change handler error:', error)
      }
    }
  }
}
