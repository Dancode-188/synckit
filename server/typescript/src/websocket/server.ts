import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { Connection, ConnectionState } from './connection';
import { ConnectionRegistry } from './registry';
import {
  Message,
  MessageType,
  createMessageId,
  AuthMessage,
  AuthSuccessMessage,
  AuthErrorMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  SyncRequestMessage,
  SyncResponseMessage,
  SyncStep1Message,
  SyncStep2Message,
  DeltaMessage,
  AckMessage,
  AwarenessSubscribeMessage,
  AwarenessUpdateMessage,
  AwarenessStateMessage
} from './protocol';
import { config } from '../config';
import { verifyToken } from '../auth/jwt';
import { canReadDocument, canWriteDocument } from '../auth/rbac';
import { SyncCoordinator } from '../sync/coordinator';
import {
  securityManager,
  validateMessage,
  validateDocumentId,
  canAccessDocument,
} from '../security/middleware';

/**
 * Pending ACK Info - tracks unacknowledged deltas
 */
interface PendingAckInfo {
  messageId: string;
  documentId: string;
  message: DeltaMessage;
  targetConnectionId: string;
  attempts: number;
  timeout: NodeJS.Timeout;
  sentAt: number;
}

/**
 * WebSocket Server
 *
 * Integrates WebSocket support with Hono HTTP server
 * Implements Phase 4 deferred features + Sync logic:
 * - Wire protocol (message format)
 * - Heartbeat/keepalive
 * - Connection state management
 * - Reconnection support
 * - Sync coordination with Rust WASM core
 * - ACK-based reliable delivery with retries
 */
export class SyncWebSocketServer {
  private wss: WebSocketServer;
  private registry: ConnectionRegistry;
  private coordinator: SyncCoordinator;
  private connectionCounter = 0;

  // ACK tracking for reliable delivery
  private pendingAcks: Map<string, PendingAckInfo> = new Map();

  // Delta batching to reduce message volume
  private pendingBatches: Map<string, { delta: Record<string, any>, timer: NodeJS.Timeout }> = new Map();
  private readonly BATCH_INTERVAL = 50; // 50ms batching window

  // Awareness cleanup
  private awarenessCleanupTimer?: NodeJS.Timeout;
  private readonly AWARENESS_CLEANUP_INTERVAL = 30000; // 30 seconds
  private readonly AWARENESS_TIMEOUT = 30000; // 30 seconds

  constructor(
    server: Server,
    options?: {
      storage?: any; // StorageAdapter
      pubsub?: any;  // RedisPubSub
    }
  ) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });
    
    this.registry = new ConnectionRegistry();
    this.coordinator = new SyncCoordinator({
      storage: options?.storage,
      pubsub: options?.pubsub,
      serverId: `server-${Date.now()}`,
    });

    // Log authentication mode
    // const authRequired = process.env.SYNCKIT_AUTH_REQUIRED !== 'false';
    // console.log(`🔐 Authentication: ${authRequired ? 'Required' : 'Disabled (Dev Mode)'}`);

    this.setupHandlers();
    this.startAwarenessCleanup();
  }

  /**
   * Setup WebSocket server handlers
   */
  private setupHandlers() {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  /**
   * Extract client IP from request
   */
  private getClientIP(req: IncomingMessage): string {
    // Check X-Forwarded-For (Fly.io proxy)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    // Check X-Real-IP
    const realIP = req.headers['x-real-ip'];
    if (realIP) {
      return Array.isArray(realIP) ? realIP[0] : realIP;
    }

    // Fallback to socket address
    return req.socket.remoteAddress || 'unknown';
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage) {
    // Extract client IP
    const clientIP = this.getClientIP(req);

    // Check per-IP connection limit (SECURITY)
    if (!securityManager.connectionLimiter.canConnect(clientIP)) {
      console.warn(`[SECURITY] Connection limit exceeded for IP: ${clientIP}`);
      ws.close(1008, 'Too many connections from your IP');
      return;
    }

    // Check server connection limit
    if (this.registry.count() >= config.wsMaxConnections) {
      ws.close(1008, 'Server at maximum capacity');
      return;
    }

    // Increment connection count for IP
    securityManager.connectionLimiter.addConnection(clientIP);

    // Create connection
    const connectionId = `conn-${++this.connectionCounter}`;
    const connection = new Connection(ws, connectionId);

    // Store client IP on connection (for rate limiting)
    (connection as any).clientIP = clientIP;

    // Add to registry
    this.registry.add(connection);
    console.log(`[CONNECTION] New: ${connectionId} from ${clientIP} (total: ${this.registry.count()})`);

    // Start heartbeat
    connection.startHeartbeat(config.wsHeartbeatInterval);

    // Check if authentication is required
    const authRequired = process.env.SYNCKIT_AUTH_REQUIRED !== 'false';

    if (!authRequired) {
      // Auto-authenticate for public playground (SECURITY: No admin privileges!)
      connection.state = ConnectionState.AUTHENTICATED;
      connection.userId = `anonymous-${clientIP}`;
      console.log(`[AUTH] Auto-authenticated ${connection.id} as ${connection.userId}`);
      connection.tokenPayload = {
        userId: `anonymous-${clientIP}`,
        permissions: {
          canRead: ['*'], // Can read all
          canWrite: ['*'], // Can write all
          isAdmin: false, // NO ADMIN PRIVILEGES (SECURITY FIX)
        },
      };
      this.registry.linkUser(connection.id, `anonymous-${clientIP}`);
      console.log(`[AUTH] Auto-authenticated: ${connection.id} (auth disabled, no admin)`);
    }

    // Setup message handlers
    connection.on('message', async (message: Message) => {
      await this.handleMessage(connection, message);
    });

    connection.on('close', () => {
      // Decrement connection count for IP (SECURITY)
      securityManager.connectionLimiter.removeConnection(clientIP);
      // Cleanup per-connection rate limiter
      securityManager.connectionRateLimiter.removeConnection(connection.id);
      this.handleDisconnect(connection);
    });
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(connection: Connection, message: Message) {
    try {
      // Per-connection rate limiting (SECURITY)
      // Uses connection ID instead of IP to avoid shared-IP retry storms
      if (!securityManager.connectionRateLimiter.canSendMessage(connection.id)) {
        console.warn(`[SECURITY] Rate limit exceeded for connection: ${connection.id}`);
        connection.sendError('Too many messages. Please slow down.', {
          code: 'RATE_LIMIT_EXCEEDED',
        });
        return;
      }
      securityManager.connectionRateLimiter.recordMessage(connection.id);

      // Validate message format (SECURITY)
      const validation = validateMessage(message);
      if (!validation.valid) {
        connection.sendError(validation.error || 'Invalid message format', {
          code: 'INVALID_MESSAGE',
        });
        return;
      }

      switch (message.type) {
        case MessageType.CONNECT:
          // CONNECT is handled during connection setup, acknowledge it
          break;

        case MessageType.PING:
          // PING is handled by Connection class internally
          break;

        case MessageType.PONG:
          // PONG is received in response to our pings
          break;

        case MessageType.AUTH:
          await this.handleAuth(connection, message as AuthMessage);
          break;

        case MessageType.SUBSCRIBE:
          await this.handleSubscribe(connection, message as SubscribeMessage);
          break;

        case MessageType.UNSUBSCRIBE:
          await this.handleUnsubscribe(connection, message as UnsubscribeMessage);
          break;

        case MessageType.SYNC_REQUEST:
          await this.handleSyncRequest(connection, message as SyncRequestMessage);
          break;

        case MessageType.SYNC_STEP1:
          await this.handleSyncStep1(connection, message as any);
          break;

        case MessageType.DELTA:
          await this.handleDelta(connection, message as DeltaMessage);
          break;

        case MessageType.DELTA_BATCH:
          await this.handleDeltaBatch(connection, message as any);
          break;

        case MessageType.ACK:
          this.handleAck(connection, message as AckMessage);
          break;

        case MessageType.AWARENESS_SUBSCRIBE:
          await this.handleAwarenessSubscribe(connection, message as AwarenessSubscribeMessage);
          break;

        case MessageType.AWARENESS_UPDATE:
          await this.handleAwarenessUpdate(connection, message as AwarenessUpdateMessage);
          break;

        default:
          console.warn(`[Server] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[Server] Error handling message:', error);
      connection.sendError('Internal server error');
    }
  }

  /**
   * Handle authentication
   */
  private async handleAuth(connection: Connection, message: AuthMessage) {
    try {
      // Verify JWT token
      let userId: string;
      let tokenPayload: any;

      if (message.token) {
        const decoded = await verifyToken(message.token);
        if (!decoded) {
          throw new Error('Invalid token');
        }
        userId = decoded.userId;
        tokenPayload = decoded;
      } else if (message.apiKey) {
        // TODO: Implement API key authentication
        connection.sendError('API key authentication not yet implemented');
        return;
      } else {
        // Anonymous connection (SECURITY: No admin privileges!)
        userId = 'anonymous';
        tokenPayload = {
          userId: 'anonymous',
          permissions: {
            canRead: ['*'],
            canWrite: ['*'],
            isAdmin: false, // NO ADMIN (SECURITY FIX)
          },
        };
      }

      // Update connection state
      connection.state = ConnectionState.AUTHENTICATED;
      connection.userId = userId;
      connection.tokenPayload = tokenPayload;

      // Link to registry
      this.registry.linkUser(connection.id, userId);

      // Send success response
      const response: AuthSuccessMessage = {
        type: MessageType.AUTH_SUCCESS,
        id: createMessageId(),
        timestamp: Date.now(),
        userId,
        permissions: tokenPayload.permissions,
      };
      connection.send(response);

      // console.log(`Connection ${connection.id} authenticated as ${userId}`);
    } catch (error) {
      console.error('Authentication failed:', error);
      
      const response: AuthErrorMessage = {
        type: MessageType.AUTH_ERROR,
        id: createMessageId(),
        timestamp: Date.now(),
        error: 'Authentication failed',
      };
      connection.send(response);
      
      // Close connection on auth failure
      connection.close(1008, 'Authentication failed');
    }
  }

  /**
   * Handle subscribe - client wants to subscribe to a document
   */
  private async handleSubscribe(connection: Connection, message: SubscribeMessage) {
    const { documentId } = message;

    console.log(`[SUBSCRIBE] ${connection.id} requesting subscription to ${documentId}`);

    // Check authentication
    if (connection.state !== ConnectionState.AUTHENTICATED || !connection.tokenPayload) {
      connection.sendError('Not authenticated');
      return;
    }

    // Validate document ID (SECURITY)
    const docValidation = validateDocumentId(documentId);
    if (!docValidation.valid) {
      console.warn(`[SECURITY] Invalid document ID from ${connection.id}: ${docValidation.error}`);
      connection.sendError(docValidation.error || 'Invalid document ID');
      return;
    }

    // Check document access (SECURITY: Playground vs private rooms)
    if (!canAccessDocument(documentId)) {
      console.warn(`[SECURITY] Unauthorized document access attempt: ${documentId} by ${connection.id}`);
      connection.sendError('Access denied to this document');
      return;
    }

    // Check read permission
    if (!canReadDocument(connection.tokenPayload, documentId)) {
      connection.sendError('Permission denied', { documentId });
      return;
    }

    try {
      // Load document from storage (if available)
      await this.coordinator.getDocument(documentId);

      // Subscribe connection to document updates
      this.coordinator.subscribe(documentId, connection.id);
      connection.addSubscription(documentId);

      // Get current document state and vector clock
      const state = this.coordinator.getDocumentState(documentId);
      const vectorClock = this.coordinator.getVectorClock(documentId);

      // Load text CRDT state if this is a text document
      const textState = await this.coordinator.getTextState(documentId);

      // Send sync response with current state
      const response: SyncResponseMessage = {
        type: MessageType.SYNC_RESPONSE,
        id: createMessageId(),
        timestamp: Date.now(),
        requestId: message.id,
        documentId,
        state,
        deltas: [],
      };

      // Add clock to response payload for SDK compatibility (SDK uses 'clock' not 'vectorClock')
      (response as any).clock = vectorClock;

      // Include text CRDT state if available
      if (textState?.crdtState) {
        (response as any).textState = textState.crdtState;
        (response as any).textClock = textState.clock;
      }

      connection.send(response);

      console.log(`[SUBSCRIBE] ✓ ${connection.id} subscribed to ${documentId}, total subscribers: ${this.coordinator.getSubscribers(documentId).length}${textState ? ' (with text state)' : ''}`);
    } catch (error) {
      console.error('[handleSubscribe] Error:', error);
      connection.sendError('Subscribe failed', { documentId });
    }
  }

  /**
   * Handle unsubscribe - client wants to unsubscribe from a document
   */
  private async handleUnsubscribe(connection: Connection, message: UnsubscribeMessage) {
    const { documentId } = message;

    // console.log(`[handleUnsubscribe] ${connection.id} unsubscribing from ${documentId}`);

    try {
      // Remove subscription
      this.coordinator.unsubscribe(documentId, connection.id);

      // console.log(`[handleUnsubscribe] ${connection.id} unsubscribed from ${documentId}`);
    } catch (error) {
      console.error('[handleUnsubscribe] Error:', error);
      connection.sendError('Unsubscribe failed', { documentId });
    }
  }

  /**
   * Handle sync request - client wants document state
   */
  private async handleSyncRequest(connection: Connection, message: SyncRequestMessage) {
    const { documentId, vectorClock } = message;

    // Check authentication
    if (connection.state !== ConnectionState.AUTHENTICATED || !connection.tokenPayload) {
      connection.sendError('Not authenticated');
      return;
    }

    // Check read permission
    if (!canReadDocument(connection.tokenPayload, documentId)) {
      connection.sendError('Permission denied', { documentId });
      return;
    }

    try {
      // Ensure document is loaded from storage (if available)
      await this.coordinator.getDocument(documentId);

      // Subscribe connection to document updates
      this.coordinator.subscribe(documentId, connection.id);
      connection.addSubscription(documentId);

      // Merge client's vector clock if provided
      if (vectorClock) {
        this.coordinator.mergeVectorClock(documentId, vectorClock);
      }

      // Get current document state
      const state = this.coordinator.getDocumentState(documentId);
      // Vector clock could be included in future for delta computation
      // const serverVectorClock = this.coordinator.getVectorClock(documentId);

      // Send response
      const response: SyncResponseMessage = {
        type: MessageType.SYNC_RESPONSE,
        id: createMessageId(),
        timestamp: Date.now(),
        requestId: message.id,
        documentId,
        state,
        deltas: [], // TODO: Compute missing deltas based on vector clock diff
      };

      connection.send(response);
    } catch (error) {
      console.error('Error handling sync request:', error);
      connection.sendError('Sync request failed', { documentId });
    }
  }

  /**
   * Handle SyncStep1 - client sends state vector for initial sync
   * Yjs-style protocol: client tells us what operations it has, we respond with what it's missing
   */
  private async handleSyncStep1(connection: Connection, message: SyncStep1Message) {
    const { documentId, stateVector } = message;

    // Check authentication
    if (connection.state !== ConnectionState.AUTHENTICATED || !connection.tokenPayload) {
      connection.sendError('Not authenticated');
      return;
    }

    // Check read permission
    if (!canReadDocument(connection.tokenPayload, documentId)) {
      connection.sendError('Permission denied', { documentId });
      return;
    }

    try {
      console.log(`[SYNC_STEP1] Client ${connection.id} requesting initial sync for ${documentId}`);
      console.log(`[SYNC_STEP1] Client state vector:`, stateVector);

      // TODO: Compute missing operations based on state vector
      // For now, respond with empty array (client is up to date)
      // In future: compare stateVector with server's operation history
      // and send operations client is missing

      const response: SyncStep2Message = {
        type: MessageType.SYNC_STEP2,
        id: createMessageId(),
        timestamp: Date.now(),
        documentId,
        operations: [], // Empty for now - assume client is up to date
      };

      connection.send(response);
      console.log(`[SYNC_STEP2] Sent response to ${connection.id} (0 operations)`);
    } catch (error) {
      console.error('Error handling SyncStep1:', error);
      connection.sendError('SyncStep1 failed', { documentId });
    }
  }

  /**
   * Handle delta - client sending changes
   * Supports both SDK field/value format and server delta format
   */
  private async handleDelta(connection: Connection, message: DeltaMessage) {
    const { documentId } = message;

    // Normalize payload to handle both SDK and server formats
    let delta = (message as any).delta;
    let vectorClock = (message as any).vectorClock;

    // Handle SDK field/value format
    if (!delta && (message as any).field !== undefined) {
      // SDK client sent individual field/value, convert to delta format
      const field = (message as any).field;
      const value = (message as any).value;
      delta = { [field]: value };
    }

    // Handle clock vs vectorClock naming (SDK uses 'clock', server uses 'vectorClock')
    if (!vectorClock && (message as any).clock) {
      vectorClock = (message as any).clock;
    }

    // Validate we have required data
    if (!delta || typeof delta !== 'object' || Object.keys(delta).length === 0) {
      console.error(`[handleDelta] Invalid or empty delta in message:`, {
        documentId,
        hasDelta: !!delta,
        deltaType: typeof delta,
        deltaKeys: delta ? Object.keys(delta).length : 0,
      });
      connection.sendError('Invalid delta message: missing or empty delta');
      return;
    }

    // Check authentication
    if (connection.state !== ConnectionState.AUTHENTICATED || !connection.tokenPayload) {
      connection.sendError('Not authenticated');
      return;
    }

    // Check write permission
    if (!canWriteDocument(connection.tokenPayload, documentId)) {
      connection.sendError('Permission denied', { documentId });
      return;
    }

    try {
      // Ensure document is loaded from storage (critical after server restart)
      await this.coordinator.getDocument(documentId);

      // Auto-subscribe client to document if not already subscribed
      this.coordinator.subscribe(documentId, connection.id);
      connection.addSubscription(documentId);

      // Get client ID for attribution
      // Use connection.id to ensure each connection has its own vector clock entry
      // (In production, connection.clientId should be set to a stable client identifier)
      const clientId = connection.clientId || connection.id;

      // Apply delta changes to document state
      // Delta from TestClient is an object with field->value pairs
      const authoritativeDelta: Record<string, any> = {};

      if (delta && typeof delta === 'object') {
        for (const [field, value] of Object.entries(delta)) {
          // Check for tombstone marker (delete operation)
          const isTombstone = value !== null && typeof value === 'object' &&
                             '__deleted' in value && value.__deleted === true;

          if (isTombstone) {
            // Delete field - returns null if delete wins, or existing value if concurrent write wins
            const authoritativeValue = await this.coordinator.deleteField(documentId, field, clientId, message.timestamp);
            // Send tombstone marker if delete won, otherwise send the value that won
            authoritativeDelta[field] = authoritativeValue === null ? { __deleted: true } : authoritativeValue;
          } else {
            // Set field - returns authoritative value after LWW conflict resolution
            // This now supports null as a valid value!
            const authoritativeValue = await this.coordinator.setField(documentId, field, value, clientId, message.timestamp);
            authoritativeDelta[field] = authoritativeValue;
          }
        }
      }

      // Merge vector clock
      this.coordinator.mergeVectorClock(documentId, vectorClock);

      // Add to batch instead of immediate broadcast
      // This coalesces rapid updates into fewer messages, reducing ACK overhead
      this.addToBatch(documentId, authoritativeDelta);

      // Send ACK back to sender to confirm message received and processed
      // Note: SDK sends messageId in the payload, not as message.id
      const originalMessageId = (message as any).messageId || message.id;

      const ack: AckMessage = {
        type: MessageType.ACK,
        id: createMessageId(),
        timestamp: Date.now(),
        messageId: originalMessageId,
      };

      connection.send(ack);
    } catch (error) {
      console.error('Error handling delta:', error);
      connection.sendError('Delta application failed', { documentId });
    }
  }

  /**
   * Handle batch of delta operations
   */
  private async handleDeltaBatch(connection: Connection, message: any) {
    const { documentId, deltas } = message;
    console.log(`[DELTA_BATCH] Received ${deltas?.length || 0} deltas from ${connection.id} for ${documentId}`);

    if (!deltas || !Array.isArray(deltas) || deltas.length === 0) {
      connection.sendError('Invalid delta batch: missing or empty deltas array');
      return;
    }

    if (connection.state !== ConnectionState.AUTHENTICATED || !connection.tokenPayload) {
      connection.sendError('Not authenticated');
      return;
    }

    if (!canWriteDocument(connection.tokenPayload, documentId)) {
      connection.sendError('Permission denied', { documentId });
      return;
    }

    try {
      await this.coordinator.getDocument(documentId);
      this.coordinator.subscribe(documentId, connection.id);
      connection.addSubscription(documentId);

      const clientId = connection.clientId || connection.id;
      const authoritativeDelta: Record<string, any> = {};
      const textOperations: any[] = [];

      for (const operation of deltas) {
        // Check if this is a text CRDT operation (state-based)
        if (operation.type === 'text-state') {
          // PERSIST: Save and merge text CRDT state with existing state
          if (operation.state) {
            const textDocId = operation.documentId || documentId;
            await this.coordinator.saveTextState(
              textDocId,
              operation.state,
              operation.clientId || clientId,
              operation.timestamp || Date.now()
            );

            // RELAY: Broadcast the MERGED state (not raw incoming) to prevent divergence
            const mergedState = await this.coordinator.getTextState(textDocId);
            textOperations.push({
              ...operation,
              state: mergedState?.crdtState || operation.state,
              clientId: operation.clientId || clientId,
            });
          }
          continue;
        }

        // Legacy position-based text operations (deprecated, just relay)
        if (operation.type === 'text') {
          textOperations.push({
            ...operation,
            clientId: operation.clientId || clientId,
          });
          continue;
        }

        // Standard document field operation
        const field = operation.field;
        const value = operation.value;
        const timestamp = operation.timestamp || message.timestamp;

        if (field === undefined) {
          console.warn('[DELTA_BATCH] Skipping operation without field:', operation);
          continue;
        }

        const isTombstone = value !== null && typeof value === 'object' &&
                           '__deleted' in value && value.__deleted === true;

        if (isTombstone) {
          const authoritativeValue = await this.coordinator.deleteField(documentId, field, clientId, timestamp);
          authoritativeDelta[field] = authoritativeValue === null ? { __deleted: true } : authoritativeValue;
        } else {
          const authoritativeValue = await this.coordinator.setField(documentId, field, value, clientId, timestamp);
          authoritativeDelta[field] = authoritativeValue;
        }

        if (operation.clock) {
          this.coordinator.mergeVectorClock(documentId, operation.clock);
        }
      }

      // Handle standard document field updates
      if (Object.keys(authoritativeDelta).length > 0) {
        this.addToBatch(documentId, authoritativeDelta);
      }

      // Broadcast text operations directly to other subscribers
      if (textOperations.length > 0) {
        this.broadcastTextOperations(documentId, textOperations, connection.id);
      }

      const originalMessageId = message.messageId || message.id;
      const ack: AckMessage = {
        type: MessageType.ACK,
        id: createMessageId(),
        timestamp: Date.now(),
        messageId: originalMessageId,
      };

      connection.send(ack);
      console.log(`[DELTA_BATCH] ✓ Processed ${deltas.length} deltas for ${documentId} (${textOperations.length} text ops)`);
    } catch (error) {
      console.error('Error handling delta batch:', error);
      connection.sendError('Delta batch application failed', { documentId });
    }
  }

  /**
   * Broadcast text CRDT operations to subscribers (except sender)
   * Text operations use Fugue CRDT and need to be broadcast as-is
   */
  private broadcastTextOperations(documentId: string, operations: any[], senderId: string) {
    const subscribers = this.coordinator.getSubscribers(documentId);
    console.log(`[BROADCAST_TEXT] ${documentId} ${operations.length} ops to ${subscribers.length} subscribers (excluding ${senderId})`);

    for (const connectionId of subscribers) {
      // Don't send back to the sender
      if (connectionId === senderId) {
        continue;
      }

      const connection = this.registry.get(connectionId);
      if (!connection || connection.state !== ConnectionState.AUTHENTICATED) {
        continue;
      }

      // Send text operations as a delta_batch to other clients
      const textBatchMessage: any = {
        type: MessageType.DELTA_BATCH,
        id: createMessageId(),
        timestamp: Date.now(),
        documentId,
        deltas: operations,
        isTextOperation: true, // Flag to help client identify text operations
      };

      connection.send(textBatchMessage);
      console.log(`[BROADCAST_TEXT] Sent ${operations.length} text ops to ${connectionId}`);
    }
  }

  /**
   * Handle ACK - client acknowledging delta receipt
   */
  private handleAck(connection: Connection, message: AckMessage) {
    const { messageId } = message;

    // Construct the same ackKey used when storing (connection.id + message.id)
    const ackKey = `${connection.id}-${messageId}`;

    // Check if we're tracking this message
    const pendingAck = this.pendingAcks.get(ackKey);
    if (!pendingAck) {
      // Already acknowledged or unknown message
      return;
    }

    // Verify ACK is from the correct client
    if (pendingAck.targetConnectionId !== connection.id) {
      console.warn(`ACK from wrong client: expected ${pendingAck.targetConnectionId}, got ${connection.id}`);
      return;
    }

    // Clear timeout and remove from pending
    clearTimeout(pendingAck.timeout);
    this.pendingAcks.delete(ackKey);
  }

  /**
   * Add delta to batch for coalescing
   */
  private addToBatch(documentId: string, delta: Record<string, any>) {
    let batch = this.pendingBatches.get(documentId);

    if (!batch) {
      // Create new batch with timer to flush after BATCH_INTERVAL
      batch = {
        delta: {},
        timer: setTimeout(() => {
          this.flushBatch(documentId);
        }, this.BATCH_INTERVAL),
      };
      this.pendingBatches.set(documentId, batch);
    }

    // Merge delta into batch (later updates override earlier ones)
    Object.assign(batch.delta, delta);
  }

  /**
   * Flush batched deltas for a document
   * Broadcasts individual field updates in SDK-compatible format
   */
  private flushBatch(documentId: string) {
    const batch = this.pendingBatches.get(documentId);
    if (!batch) return;

    // Clear timer and remove batch
    clearTimeout(batch.timer);
    this.pendingBatches.delete(documentId);

    // Broadcast field updates
    if (Object.keys(batch.delta).length > 0) {
      // Get current vector clock
      const vectorClock = this.coordinator.getVectorClock(documentId);

      // Send individual field updates (SDK format)
      for (const [field, value] of Object.entries(batch.delta)) {
        const subscribers = this.coordinator.getSubscribers(documentId);
        console.log(`[BROADCAST] ${documentId} field=${field}, broadcasting to ${subscribers.length} subscribers:`, subscribers);

        for (const connectionId of subscribers) {
          const connection = this.registry.get(connectionId);
          if (!connection || connection.state !== ConnectionState.AUTHENTICATED) {
            continue;
          }

          // Create SDK-compatible message (field/value/clock format)
          const fieldMessage: any = {
            type: MessageType.DELTA,
            id: createMessageId(),
            timestamp: Date.now(),
            documentId,
            field,
            value,
            clock: vectorClock,  // SDK uses 'clock' not 'vectorClock'
            clientId: 'server',
          };

          connection.send(fieldMessage);
        }
      }
    }
  }


  // ===================
  // Awareness Handlers
  // ===================

  /**
   * Start periodic cleanup of stale awareness clients
   */
  private startAwarenessCleanup() {
    this.awarenessCleanupTimer = setInterval(() => {
      this.cleanupStaleAwarenessClients();
    }, this.AWARENESS_CLEANUP_INTERVAL);

    // console.log(`🧹 Awareness cleanup started (interval: ${this.AWARENESS_CLEANUP_INTERVAL}ms, timeout: ${this.AWARENESS_TIMEOUT}ms)`);
  }

  /**
   * Clean up stale awareness clients across all documents
   */
  private cleanupStaleAwarenessClients() {
    // Get all document IDs that have awareness state
    const documentIds = Array.from((this.coordinator as any).awarenessStates.keys()) as string[];

    let totalRemoved = 0;
    for (const documentId of documentIds) {
      const removedClients = this.coordinator.removeStaleAwarenessClients(documentId, this.AWARENESS_TIMEOUT);

      if (removedClients.length > 0) {
        // console.log(`[AwarenessCleanup] Removed ${removedClients.length} stale clients from ${documentId}`);

        // Broadcast removal to subscribers
        const subscribers = this.coordinator.getAwarenessSubscribers(documentId);

        for (const clientId of removedClients) {
          const updateMessage: AwarenessUpdateMessage = {
            type: MessageType.AWARENESS_UPDATE,
            id: createMessageId(),
            timestamp: Date.now(),
            documentId,
            clientId,
            state: null, // null indicates client left
            clock: Date.now()
          };

          for (const connectionId of subscribers) {
            const connection = this.registry.get(connectionId);
            if (connection && connection.state === ConnectionState.AUTHENTICATED) {
              connection.send(updateMessage);
            }
          }
        }

        totalRemoved += removedClients.length;
      }
    }

    if (totalRemoved > 0) {
      // console.log(`[AwarenessCleanup] Total removed: ${totalRemoved} stale clients`);
    }
  }

  /**
   * Handle awareness subscription - client wants to receive awareness updates
   */
  private async handleAwarenessSubscribe(
    connection: Connection,
    message: AwarenessSubscribeMessage
  ) {
    const { documentId } = message;

    // console.log(`[AwarenessSubscribe] ${connection.id} subscribing to awareness for ${documentId}`);

    try {
      // Subscribe to awareness updates
      this.coordinator.subscribeToAwareness(documentId, connection.id);

      // Send current awareness state to the client
      const awarenessStates = this.coordinator.getAwarenessStates(documentId);

      const stateMessage: AwarenessStateMessage = {
        type: MessageType.AWARENESS_STATE,
        id: createMessageId(),
        timestamp: Date.now(),
        documentId,
        states: awarenessStates.map(client => ({
          clientId: client.clientId,
          state: client.state!,
          clock: client.clock
        }))
      };

      connection.send(stateMessage);

      // console.log(`[AwarenessSubscribe] Sent ${awarenessStates.length} awareness states to ${connection.id}`);
    } catch (error) {
      console.error('[AwarenessSubscribe] Error:', error);
      connection.sendError('Failed to subscribe to awareness');
    }
  }

  /**
   * Handle awareness update - client sent presence update, broadcast to others
   */
  private async handleAwarenessUpdate(
    connection: Connection,
    message: AwarenessUpdateMessage
  ) {
    const { documentId, clientId, state, clock } = message;

    // console.log(`[AwarenessUpdate] ${connection.id} updating awareness for client ${clientId} in ${documentId}`);

    try {
      // Update awareness state in coordinator
      this.coordinator.setAwarenessState(documentId, clientId, state, clock);

      // Broadcast to all awareness subscribers (including sender for echo)
      const subscribers = this.coordinator.getAwarenessSubscribers(documentId);

      const updateMessage: AwarenessUpdateMessage = {
        type: MessageType.AWARENESS_UPDATE,
        id: createMessageId(),
        timestamp: Date.now(),
        documentId,
        clientId,
        state,
        clock
      };

      let broadcastCount = 0;
      for (const connectionId of subscribers) {
        const targetConnection = this.registry.get(connectionId);
        if (targetConnection && targetConnection.state === ConnectionState.AUTHENTICATED) {
          targetConnection.send(updateMessage);
          broadcastCount++;
        }
      }

      // console.log(`[AwarenessUpdate] Broadcasted to ${broadcastCount} subscribers`);
    } catch (error) {
      console.error('[AwarenessUpdate] Error:', error);
      connection.sendError('Failed to update awareness');
    }
  }

  /**
   * Handle connection disconnect
   */
  private handleDisconnect(connection: Connection) {
    // console.log(`Connection ${connection.id} disconnected`);

    // Clean up all document subscriptions for this connection
    const subscriptions = connection.getSubscriptions();
    for (const documentId of subscriptions) {
      this.coordinator.unsubscribe(documentId, connection.id);
    }

    // Clean up awareness subscriptions for this connection
    // Get all document IDs with awareness state
    const documentIds = Array.from((this.coordinator as any).awarenessStates.keys()) as string[];
    for (const documentId of documentIds) {
      this.coordinator.unsubscribeFromAwareness(documentId, connection.id);
    }

    // Note: Awareness client state will be cleaned up by the periodic cleanup task
    // when the client stops sending heartbeats (30s timeout)

    // Clean up pending ACKs for this connection
    const keysToDelete: string[] = [];
    for (const [key, pendingAck] of this.pendingAcks.entries()) {
      if (pendingAck.targetConnectionId === connection.id) {
        clearTimeout(pendingAck.timeout);
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.pendingAcks.delete(key);
    }

    // FIX: Clear pending batch timers to prevent memory leak
    // When connection disconnects, any pending batch timers for documents
    // this connection was subscribed to should be cleared
    for (const documentId of subscriptions) {
      const batch = this.pendingBatches.get(documentId);
      if (batch) {
        clearTimeout(batch.timer);
        this.pendingBatches.delete(documentId);
      }
    }

    // FIX: Clean up connection resources (event handlers, subscriptions)
    connection.cleanup();

    // Connection will be automatically removed from registry via the close event
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      connections: this.registry.getMetrics(),
      documents: this.coordinator.getStats(),
    };
  }

  /**
   * Process delta batch from HTTP endpoint (bypasses WebSocket)
   * Used when WebSocket infrastructure drops large messages
   *
   * @param documentId - The document to apply deltas to
   * @param deltas - Array of {field, value, timestamp?} operations
   * @param clientId - The client ID making the request
   * @returns Object with success status and processed delta count
   */
  async processDeltaBatchFromHTTP(
    documentId: string,
    deltas: Array<{ field: string; value: any; timestamp?: number; clock?: Record<string, number> }>,
    clientId: string
  ): Promise<{ success: boolean; processed: number; error?: string }> {
    console.log(`[HTTP_DELTA] Processing ${deltas.length} deltas for ${documentId} from client ${clientId}`);

    if (!deltas || !Array.isArray(deltas) || deltas.length === 0) {
      return { success: false, processed: 0, error: 'Invalid delta batch: missing or empty deltas array' };
    }

    try {
      // Ensure document is loaded
      await this.coordinator.getDocument(documentId);

      const authoritativeDelta: Record<string, any> = {};
      const timestamp = Date.now();

      for (const operation of deltas) {
        const field = operation.field;
        const value = operation.value;
        const opTimestamp = operation.timestamp || timestamp;

        const isTombstone = value !== null && typeof value === 'object' &&
                           '__deleted' in value && value.__deleted === true;

        if (isTombstone) {
          const authoritativeValue = await this.coordinator.deleteField(documentId, field, clientId, opTimestamp);
          authoritativeDelta[field] = authoritativeValue === null ? { __deleted: true } : authoritativeValue;
        } else {
          const authoritativeValue = await this.coordinator.setField(documentId, field, value, clientId, opTimestamp);
          authoritativeDelta[field] = authoritativeValue;
        }

        if (operation.clock) {
          this.coordinator.mergeVectorClock(documentId, operation.clock);
        }
      }

      // Add to batch for broadcasting to WebSocket subscribers
      this.addToBatch(documentId, authoritativeDelta);

      console.log(`[HTTP_DELTA] ✓ Processed ${deltas.length} deltas for ${documentId}`);
      return { success: true, processed: deltas.length };
    } catch (error) {
      console.error('[HTTP_DELTA] Error processing delta batch:', error);
      return { success: false, processed: 0, error: 'Delta batch processing failed' };
    }
  }

  /**
   * Graceful shutdown
   */
  /**
   * Clear coordinator's in-memory cache (for test cleanup)
   */
  clearCoordinatorCache(): void {
    this.coordinator.clearCache();
  }

  async close() {
    // console.log('Closing WebSocket server...');

    // Stop awareness cleanup timer
    if (this.awarenessCleanupTimer) {
      clearInterval(this.awarenessCleanupTimer);
      this.awarenessCleanupTimer = undefined;
    }

    // Close all connections
    this.registry.closeAll(1001, 'Server shutdown');

    // Cleanup coordinator resources
    this.coordinator.dispose();

    // Close WebSocket server
    return new Promise<void>((resolve) => {
      this.wss.close(() => {
        // console.log('WebSocket server closed');
        resolve();
      });
    });
  }
}

