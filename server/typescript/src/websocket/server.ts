import { Hono } from 'hono';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { Connection, ConnectionState } from './connection';
import { ConnectionRegistry } from './registry';
import { Message, MessageType, createMessageId, AuthMessage, AuthSuccessMessage, AuthErrorMessage } from './protocol';
import { config } from '../config';
import { verifyToken } from '../auth/jwt';
import { canReadDocument, canWriteDocument } from '../auth/rbac';

/**
 * WebSocket Server
 * 
 * Integrates WebSocket support with Hono HTTP server
 * Implements Phase 4 deferred features:
 * - Wire protocol (message format)
 * - Heartbeat/keepalive
 * - Connection state management
 * - Reconnection support
 */
export class SyncWebSocketServer {
  private wss: WebSocketServer;
  private registry: ConnectionRegistry;
  private connectionCounter = 0;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });
    
    this.registry = new ConnectionRegistry();
    this.setupHandlers();
  }

  /**
   * Setup WebSocket server handlers
   */
  private setupHandlers() {
    this.wss.on('connection', this.handleConnection.bind(this));
    
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket) {
    // Check connection limit
    if (this.registry.count() >= config.wsMaxConnections) {
      ws.close(1008, 'Server at maximum capacity');
      return;
    }

    // Create connection
    const connectionId = `conn-${++this.connectionCounter}`;
    const connection = new Connection(ws, connectionId);
    
    // Add to registry
    this.registry.add(connection);
    console.log(`New connection: ${connectionId} (total: ${this.registry.count()})`);

    // Start heartbeat
    connection.startHeartbeat(config.wsHeartbeatInterval);

    // Setup message handlers
    connection.on('message', (message: Message) => {
      this.handleMessage(connection, message);
    });

    connection.on('close', () => {
      console.log(`Connection closed: ${connectionId} (total: ${this.registry.count()})`);
    });

    connection.on('error', (error: Error) => {
      console.error(`Connection ${connectionId} error:`, error);
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(connection: Connection, message: Message) {
    // Route message based on type
    switch (message.type) {
      case MessageType.CONNECT:
        this.handleConnect(connection, message);
        break;
      
      case MessageType.AUTH:
        this.handleAuth(connection, message as AuthMessage);
        break;
      
      case MessageType.SYNC_REQUEST:
        this.handleSyncRequest(connection, message);
        break;
      
      case MessageType.DELTA:
        this.handleDelta(connection, message);
        break;
      
      // PING is handled internally by Connection class
      case MessageType.PING:
        break;
      
      default:
        console.log(`Unknown message type: ${message.type}`);
        connection.sendError(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle CONNECT message
   */
  private handleConnect(connection: Connection, message: any) {
    const { clientId } = message;
    
    if (!clientId) {
      connection.sendError('Missing clientId');
      return;
    }

    // Link client ID
    this.registry.linkClient(connection.id, clientId);
    connection.state = ConnectionState.AUTHENTICATING;
    
    console.log(`Client connected: ${clientId}`);
  }

  /**
   * Handle AUTH message - verify JWT and authenticate connection
   */
  private handleAuth(connection: Connection, message: AuthMessage) {
    const { token, apiKey } = message;
    
    // JWT token authentication
    if (token) {
      const payload = verifyToken(token);
      
      if (!payload) {
        const errorMsg: AuthErrorMessage = {
          type: MessageType.AUTH_ERROR,
          id: createMessageId(),
          timestamp: Date.now(),
          error: 'Invalid or expired token',
        };
        connection.send(errorMsg);
        connection.close(1008, 'Authentication failed');
        return;
      }
      
      // Authentication successful
      connection.state = ConnectionState.AUTHENTICATED;
      connection.userId = payload.userId;
      
      // Link user to connection
      this.registry.linkUser(connection.id, payload.userId);
      
      // Store permissions on connection (for later authorization checks)
      (connection as any).permissions = payload.permissions;
      
      const successMsg: AuthSuccessMessage = {
        type: MessageType.AUTH_SUCCESS,
        id: createMessageId(),
        timestamp: Date.now(),
        userId: payload.userId,
        permissions: payload.permissions,
      };
      
      connection.send(successMsg);
      console.log(`User authenticated: ${payload.userId}`);
      return;
    }
    
    // API Key authentication (future implementation)
    if (apiKey) {
      // TODO: Implement API key validation
      const errorMsg: AuthErrorMessage = {
        type: MessageType.AUTH_ERROR,
        id: createMessageId(),
        timestamp: Date.now(),
        error: 'API key authentication not yet implemented',
      };
      connection.send(errorMsg);
      return;
    }
    
    // No valid auth method provided
    const errorMsg: AuthErrorMessage = {
      type: MessageType.AUTH_ERROR,
      id: createMessageId(),
      timestamp: Date.now(),
      error: 'No authentication credentials provided',
    };
    connection.send(errorMsg);
  }

  /**
   * Handle SYNC_REQUEST (stub - will implement in Sub-Phase 7.4)
   */
  private handleSyncRequest(connection: Connection, message: any) {
    // Check authentication
    if (connection.state !== ConnectionState.AUTHENTICATED) {
      connection.sendError('Authentication required');
      return;
    }
    
    // TODO: Implement in Sub-Phase 7.4
    console.log('SYNC_REQUEST received - not yet implemented');
  }

  /**
   * Handle DELTA (stub - will implement in Sub-Phase 7.4)
   */
  private handleDelta(connection: Connection, message: any) {
    // Check authentication
    if (connection.state !== ConnectionState.AUTHENTICATED) {
      connection.sendError('Authentication required');
      return;
    }
    
    // TODO: Implement in Sub-Phase 7.4
    console.log('DELTA received - not yet implemented');
  }

  /**
   * Get registry for external access
   */
  getRegistry(): ConnectionRegistry {
    return this.registry;
  }

  /**
   * Get connection metrics
   */
  getMetrics() {
    return this.registry.getMetrics();
  }

  /**
   * Shutdown server gracefully
   */
  shutdown() {
    console.log('Shutting down WebSocket server...');
    this.registry.closeAll(1001, 'Server shutdown');
    this.wss.close();
  }
}
