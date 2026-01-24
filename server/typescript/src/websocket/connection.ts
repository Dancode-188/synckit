import type { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { 
  Message, 
  MessageType, 
  PongMessage,
  serializeMessage, 
  parseMessage, 
  createMessageId 
} from './protocol';
import type { TokenPayload } from '../auth/jwt';

/**
 * Connection state enum
 */
export enum ConnectionState {
  CONNECTING = 'connecting',
  AUTHENTICATING = 'authenticating',
  AUTHENTICATED = 'authenticated',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
}

/**
 * Connection class - manages individual WebSocket connection
 * 
 * Implements:
 * - Connection lifecycle management
 * - Heartbeat (ping/pong)
 * - Message routing
 * - State tracking
 */
interface ChunkBuffer {
  chunks: (Buffer | null)[];
  totalChunks: number;
  receivedAt: number;
}

export class Connection extends EventEmitter {
  public readonly id: string;
  public state: ConnectionState;
  public userId?: string;
  public clientId?: string;
  public tokenPayload?: TokenPayload; // Store full token payload for permissions
  public protocolType: 'binary' | 'json' = 'binary'; // Default to binary (SDK protocol)

  private ws: WebSocket;
  private heartbeatInterval?: Timer;
  private isAlive: boolean = true;
  private subscribedDocuments: Set<string> = new Set();

  // Chunk reassembly buffer
  private chunkBuffers: Map<string, ChunkBuffer> = new Map();
  private chunkCleanupInterval?: Timer;

  constructor(ws: WebSocket, connectionId: string) {
    super();
    this.id = connectionId;
    this.ws = ws;
    this.state = ConnectionState.CONNECTING;

    this.setupHandlers();
    this.startChunkCleanup();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupHandlers() {
    console.log(`[Connection ${this.id}] Setting up WebSocket event handlers...`);

    this.ws.on('message', (data: Buffer | string) => {
      console.log(`[Connection ${this.id}] 🔴 WS 'message' EVENT FIRED! Size: ${data.length}, Type: ${typeof data}`);
      this.handleMessage(data);
    });

    this.ws.on('close', this.handleClose.bind(this));
    this.ws.on('error', this.handleError.bind(this));
    this.ws.on('pong', this.handlePong.bind(this));

    this.ws.on('ping', () => console.log(`[Connection ${this.id}] 🔵 WS 'ping' event`));
    this.ws.on('unexpected-response', () => console.log(`[Connection ${this.id}] ⚠️  WS 'unexpected-response' event`));

    console.log(`[Connection ${this.id}] ✅ WebSocket event handlers registered`);
  }

  /**
   * Handle incoming message (supports both binary and JSON protocols)
   */
  private handleMessage(data: Buffer | string) {
    try {
      // CRITICAL DEBUG: Log ALL incoming messages
      console.log(`[Connection ${this.id}] RAW MESSAGE RECEIVED:`, {
        type: typeof data,
        size: data.length,
        preview: typeof data === 'string' ? data.substring(0, 150) : `Buffer[${data.length}]`,
        firstChar: typeof data === 'string' ? data[0] : data[0]
      });

      // Detect protocol type from first message
      if (typeof data === 'string' && this.protocolType === 'binary') {
        this.protocolType = 'json';
      }

      // Parse message (parseMessage handles both Buffer and string)
      const message = parseMessage(data);

      if (!message) {
        console.error(`[Connection ${this.id}] parseMessage returned null. Data type: ${typeof data}, size: ${data.length}`);
        if (typeof data === 'string') {
          console.error(`[Connection ${this.id}] Raw JSON data:`, data.substring(0, 200));
        } else {
          console.error(`[Connection ${this.id}] Buffer first bytes:`, data.subarray(0, Math.min(50, data.length)));
        }
        this.sendError('Invalid message format');
        return;
      }

      // CRITICAL DEBUG: Log message before emitting
      console.log(`[Connection ${this.id}] About to emit message event:`, {
        type: message.type,
        hasDocumentId: !!(message as any).documentId,
        keys: Object.keys(message).slice(0, 10)
      });

      // Handle chunk messages specially
      if (message.type === MessageType.DELTA_BATCH_CHUNK) {
        this.handleChunk(message as any);
        return;
      }

      // Emit event for message handlers
      this.emit('message', message);

      console.log(`[Connection ${this.id}] ✅ Message event emitted successfully for type: ${message.type}`);

      // Handle ping internally
      if (message.type === MessageType.PING) {
        this.sendPong(message.id);
      }
    } catch (error) {
      console.error(`[Connection ${this.id}] Error handling message:`, error);
      this.sendError('Internal server error');
    }
  }

  /**
   * Handle connection close
   */
  private handleClose() {
    this.state = ConnectionState.DISCONNECTED;
    this.stopHeartbeat();
    this.emit('close');
  }

  /**
   * Handle connection error
   */
  private handleError(error: Error) {
    console.error(`Connection ${this.id} error:`, error);
    this.emit('error', error);
  }

  /**
   * Handle pong response
   */
  private handlePong() {
    this.isAlive = true;
  }

  /**
   * Send message to client (uses detected protocol type)
   */
  send(message: Message): boolean {
    if (this.ws.readyState !== 1) { // 1 = OPEN
      return false;
    }

    try {
      const useBinary = this.protocolType === 'binary';
      const data = serializeMessage(message, useBinary);
      this.ws.send(data);
      return true;
    } catch (error) {
      console.error(`[Connection ${this.id}] Error sending message:`, error);
      return false;
    }
  }

  /**
   * Send pong response
   */
  private sendPong(_pingId: string) {
    const pong: PongMessage = {
      type: MessageType.PONG,
      id: createMessageId(),
      timestamp: Date.now(),
    };
    this.send(pong);
  }

  /**
   * Send error message
   */
  sendError(error: string, details?: any) {
    this.send({
      type: MessageType.ERROR,
      id: createMessageId(),
      timestamp: Date.now(),
      error,
      details,
    });
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeat(intervalMs: number = 30000) {
    this.heartbeatInterval = setInterval(() => {
      if (!this.isAlive) {
        // console.log(`Connection ${this.id} heartbeat timeout - terminating`);
        return this.terminate();
      }

      this.isAlive = false;
      this.ws.ping();
    }, intervalMs);
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Graceful close
   */
  close(code: number = 1000, reason: string = 'Normal closure') {
    this.state = ConnectionState.DISCONNECTING;
    this.stopHeartbeat();
    this.ws.close(code, reason);
  }

  /**
   * Force terminate connection
   */
  terminate() {
    this.stopHeartbeat();
    this.ws.terminate();
  }

  /**
   * Add document subscription
   */
  addSubscription(documentId: string) {
    this.subscribedDocuments.add(documentId);
  }

  /**
   * Get all subscribed document IDs
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscribedDocuments);
  }

  /**
   * Handle incoming chunk message
   */
  private handleChunk(chunkMessage: any): void {
    const { chunkId, totalChunks, chunkIndex, data } = chunkMessage;

    console.log(`[Connection ${this.id}] Received chunk ${chunkIndex + 1}/${totalChunks} for ${chunkId}`);

    // Initialize chunk buffer if first chunk
    if (!this.chunkBuffers.has(chunkId)) {
      this.chunkBuffers.set(chunkId, {
        chunks: new Array(totalChunks).fill(null),
        totalChunks,
        receivedAt: Date.now(),
      });
    }

    // Decode base64 data and store chunk
    const buffer = this.chunkBuffers.get(chunkId)!;
    buffer.chunks[chunkIndex] = Buffer.from(data, 'base64');

    // Check if all chunks received
    if (buffer.chunks.every(chunk => chunk !== null)) {
      console.log(`[Connection ${this.id}] All chunks received for ${chunkId}, reassembling...`);

      // Reassemble message
      const completeMessage = Buffer.concat(buffer.chunks as Buffer[]);
      this.chunkBuffers.delete(chunkId);

      // Parse and emit as delta_batch
      try {
        const message = parseMessage(completeMessage);
        if (message) {
          console.log(`[Connection ${this.id}] ✅ Reassembled ${completeMessage.length} bytes into ${message.type}`);
          this.emit('message', message);
        }
      } catch (error) {
        console.error(`[Connection ${this.id}] Error parsing reassembled message:`, error);
      }
    }
  }

  /**
   * Start chunk cleanup interval
   */
  private startChunkCleanup(): void {
    // Clean up abandoned chunks every 30 seconds
    this.chunkCleanupInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      for (const [chunkId, buffer] of this.chunkBuffers.entries()) {
        if (now - buffer.receivedAt > timeout) {
          console.log(`[Connection ${this.id}] Cleaning up abandoned chunks for ${chunkId}`);
          this.chunkBuffers.delete(chunkId);
        }
      }
    }, 30000);
  }

  /**
   * Stop chunk cleanup interval
   */
  private stopChunkCleanup(): void {
    if (this.chunkCleanupInterval) {
      clearInterval(this.chunkCleanupInterval);
      this.chunkCleanupInterval = undefined;
    }
  }

  /**
   * Cleanup connection resources (fix memory leak)
   */
  cleanup() {
    this.stopHeartbeat();
    this.stopChunkCleanup();
    this.chunkBuffers.clear();
    this.subscribedDocuments.clear();
    this.removeAllListeners();
  }
}
