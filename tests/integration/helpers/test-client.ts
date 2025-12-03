/**
 * Test Client Utilities
 *
 * Lightweight WebSocket client for server integration testing
 * Does NOT use the SDK - communicates directly with server via WebSocket
 */

import { TEST_CONFIG, getWebSocketUrl, generateTestId, sleep } from '../config';
import WebSocket from 'ws';
import { ProtocolAdapter, JsonAdapter } from './protocol-adapter';

/**
 * Deep equality comparison that ignores property order
 * Handles objects, arrays, primitives, null, undefined
 */
function deepEqual(a: any, b: any): boolean {
  // Handle primitives, null, undefined
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle objects
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();

  if (keysA.length !== keysB.length) return false;
  if (!deepEqual(keysA, keysB)) return false;

  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * Test client configuration
 */
export interface TestClientConfig {
  clientId?: string;
  userId?: string;
  autoConnect?: boolean;
  token?: string;
  adapter?: ProtocolAdapter; // Protocol adapter for message encoding/decoding
}

/**
 * Document state (in-memory tracking)
 */
interface DocumentState {
  [field: string]: any;
}

/**
 * Test client wrapper - Direct WebSocket communication
 */
export class TestClient {
  public readonly clientId: string;
  public readonly userId: string;
  private connected: boolean = false;
  private ws: WebSocket | null = null;

  // Track document states locally
  private documents: Map<string, DocumentState> = new Map();

  // Track which documents have completed initial sync
  private syncedDocuments: Set<string> = new Set();

  // Offline queue - stores operations made while disconnected
  private offlineQueue: Array<{type: string, documentId: string, data: any}> = [];

  // Message callbacks
  private messageCallbacks: Map<string, (data: any) => void> = new Map();

  // Protocol adapter for message encoding/decoding (defaults to JSON for backward compatibility)
  private adapter: ProtocolAdapter;

  constructor(config: TestClientConfig = {}) {
    this.clientId = config.clientId || generateTestId('client');
    this.userId = config.userId || generateTestId('user');
    this.adapter = config.adapter || new JsonAdapter(); // Default to JSON for existing tests
  }

  /**
   * Initialize client (lightweight - no SDK needed)
   */
  async init(): Promise<void> {
    // Just initialize local state
    this.documents.clear();
    
    if (TEST_CONFIG.features.verbose) {
      console.log(`[TestClient:${this.clientId}] Initialized`);
    }
  }

  /**
   * Connect to test server via WebSocket
   */
  async connect(token?: string): Promise<void> {
    if (this.connected) {
      return;
    }

    // Clear synced documents tracking - server subscription state is lost on reconnect
    // This ensures we re-subscribe (send sync_request) after server restart
    this.syncedDocuments.clear();

    return new Promise((resolve, reject) => {
      const wsUrl = getWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, TEST_CONFIG.timeouts.connection);

      // Store resolve/reject for auth_success handler
      (this as any)._connectResolve = resolve;
      (this as any)._connectReject = reject;
      (this as any)._connectTimeout = timeout;

      this.ws.on('open', () => {
        this.connected = true;

        // Send AUTH message (anonymous if no token)
        this.sendMessage({
          type: 'auth',
          id: generateTestId('msg'),
          timestamp: Date.now(),
        });

        if (TEST_CONFIG.features.verbose) {
          console.log(`[TestClient:${this.clientId}] Connected to WebSocket, waiting for auth...`);
        }

        // Don't resolve yet - wait for auth_success
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        if ((this as any)._connectReject) {
          (this as any)._connectReject(error);
          (this as any)._connectResolve = null;
          (this as any)._connectReject = null;
        }
        reject(error);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.connected = false;
        const reasonStr = reason.toString();
        console.log(`[TestClient:${this.clientId}] Disconnected - code: ${code}, reason: ${reasonStr || 'none'}`);
      });

      // Handle incoming messages
      this.ws.on('message', (data: Buffer | string) => {
        try {
          const message = this.adapter.decode(data);
          this.handleMessage(message);
        } catch (error) {
          console.error(`[TestClient:${this.clientId}] Failed to decode message:`, error);
          console.error('Data type:', typeof data);
          console.error('Data length:', data.length);
          if (Buffer.isBuffer(data)) {
            console.error('First 50 bytes (hex):', data.subarray(0, Math.min(50, data.length)).toString('hex'));
          }
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: any): void {
    // Handle ping - respond with pong to keep connection alive
    if (message.type === 'ping') {
      this.sendMessage({
        type: 'pong',
        id: generateTestId('msg'),
        timestamp: Date.now(),
      });
      return;
    }

    // Handle auth success
    if (message.type === 'auth_success') {
      this.userId = message.userId;

      // Resolve connect() promise if waiting
      if ((this as any)._connectResolve) {
        clearTimeout((this as any)._connectTimeout);
        (this as any)._connectResolve();
        (this as any)._connectResolve = null;
        (this as any)._connectReject = null;
        (this as any)._connectTimeout = null;

        if (TEST_CONFIG.features.verbose) {
          console.log(`[TestClient:${this.clientId}] Authenticated successfully`);
        }
      }

      // Flush offline queue after successful authentication
      this.flushOfflineQueue().catch(err => {
        console.error(`[TestClient:${this.clientId}] Error flushing offline queue:`, err);
      });
    }

    // Handle sync response - full document state
    if (message.type === 'sync_response' && message.state) {
      // Replace local state with server's authoritative state
      // The server has the source of truth, especially after reconnection
      this.documents.set(message.documentId, message.state);
    }

    // Handle delta - incremental changes
    if (message.type === 'delta' && message.documentId) {
      // Apply delta to local state
      const doc = this.documents.get(message.documentId) || {};

      // Handle both formats:
      // 1. TestClient format: { delta: { field1: value1, field2: value2 } }
      // 2. SDK format: { field: 'field1', value: value1 }
      let deltaToApply: Record<string, any>;

      if (message.delta) {
        // TestClient format: bundled delta object
        deltaToApply = message.delta;
      } else if ((message as any).field !== undefined) {
        // SDK format: individual field/value
        const field = (message as any).field;
        const value = (message as any).value;
        deltaToApply = { [field]: value };
      } else {
        console.warn(`[TestClient:${this.clientId}] Delta message has no 'delta' or 'field' property`);
        deltaToApply = {};
      }

      // Apply each field in the delta
      for (const [field, value] of Object.entries(deltaToApply)) {
        // Check for tombstone marker (delete operation)
        if (value !== null && typeof value === 'object' && '__deleted' in value && value.__deleted === true) {
          // Delete field
          delete doc[field];
        } else {
          // Set field value (including explicit null values)
          // null is now a valid storable value!
          doc[field] = value;
        }
      }
      this.documents.set(message.documentId, doc);

      // Send ACK to confirm receipt
      if (message.id) {
        this.sendMessage({
          type: 'ack',
          id: generateTestId('msg'),
          timestamp: Date.now(),
          messageId: message.id,
        });
      }
    }
    
    // Trigger any registered callbacks
    // Check requestId first (for responses), then id (for direct messages)
    const callback = this.messageCallbacks.get(message.requestId) || this.messageCallbacks.get(message.id);
    if (callback) {
      callback(message);
      // Delete using the correct key
      if (message.requestId && this.messageCallbacks.has(message.requestId)) {
        this.messageCallbacks.delete(message.requestId);
      } else if (this.messageCallbacks.has(message.id)) {
        this.messageCallbacks.delete(message.id);
      }
    }
  }

  /**
   * Send message to server
   */
  private sendMessage(message: any): void {
    if (!this.ws || !this.connected) {
      throw new Error('WebSocket not connected');
    }

    const encoded = this.adapter.encode(message);
    this.ws.send(encoded);
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
    // Clear synced documents so we re-subscribe on reconnect
    this.syncedDocuments.clear();
  }

  /**
   * Flush offline queue - send all pending operations to server
   * Called automatically when reconnecting
   */
  private async flushOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0) {
      return;
    }

    // Check if we're connected before attempting to flush
    if (!this.connected || !this.ws) {
      if (TEST_CONFIG.features.verbose) {
        console.log(`[TestClient:${this.clientId}] Cannot flush offline queue - not connected`);
      }
      return;
    }

    if (TEST_CONFIG.features.verbose) {
      console.log(`[TestClient:${this.clientId}] Flushing ${this.offlineQueue.length} offline operations`);
    }

    // Process each queued operation
    const queue = [...this.offlineQueue];

    try {
      for (let i = 0; i < queue.length; i++) {
        const op = queue[i];

        // Check connection before each send (can change mid-flush)
        if (!this.connected || !this.ws) {
          if (TEST_CONFIG.features.verbose) {
            console.log(`[TestClient:${this.clientId}] Connection lost during flush, stopping at operation ${i}`);
          }
          // Keep the remaining operations in the queue
          this.offlineQueue = queue.slice(i);
          return;
        }

        // Ensure we're subscribed to the document first
        await this.ensureSubscribed(op.documentId);

        if (op.type === 'setField') {
          // Send delta directly (local state already updated during offline operation)
          const { field, value } = op.data;
          this.sendMessage({
            type: 'delta',
            id: generateTestId('msg'),
            timestamp: Date.now(),
            documentId: op.documentId,
            delta: { [field]: value },
            vectorClock: {},
          });
          await sleep(10);
        } else if (op.type === 'deleteField') {
          // Send delete delta directly (local state already updated during offline operation)
          const { field } = op.data;
          this.sendMessage({
            type: 'delta',
            id: generateTestId('msg'),
            timestamp: Date.now(),
            documentId: op.documentId,
            delta: { [field]: { __deleted: true } },
            vectorClock: {},
          });
          await sleep(10);
        }
      }

      // Only clear the queue after ALL operations are successfully sent
      this.offlineQueue = [];

      if (TEST_CONFIG.features.verbose) {
        console.log(`[TestClient:${this.clientId}] Offline queue flushed successfully`);
      }
    } catch (error) {
      // If there was an error, log it but don't throw (will retry on next connection)
      if (TEST_CONFIG.features.verbose) {
        console.log(`[TestClient:${this.clientId}] Error flushing offline queue:`, error);
      }
      // Don't re-throw - just return and keep operations in queue for next flush attempt
    }
  }

  /**
   * Ensure client is subscribed to a document
   * Sends sync_request if not already subscribed
   * Retries up to 3 times on failure
   * In offline mode, just initializes document locally
   */
  private async ensureSubscribed(documentId: string, retries: number = 3): Promise<void> {
    // Initialize empty document locally if needed
    if (!this.documents.has(documentId)) {
      this.documents.set(documentId, {});
    }

    // If offline, just initialize locally and return (allow offline work)
    if (!this.connected || !this.ws) {
      return;
    }

    // Check if we've already completed the initial sync for this document
    if (this.syncedDocuments.has(documentId)) {
      return;
    }

    // Retry logic
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Send sync_request to subscribe
        const msgId = generateTestId('msg');

        // Set up promise to wait for sync_response
        const responsePromise = new Promise<void>((resolve, reject) => {
          this.messageCallbacks.set(msgId, (message: any) => {
            if (message.type === 'sync_response') {
              // Mark as synced
              this.syncedDocuments.add(documentId);
              resolve();
            }
          });

          // Timeout after 10000ms (long timeout for large documents in load tests)
          setTimeout(() => {
            this.messageCallbacks.delete(msgId);
            reject(new Error(`Subscription timeout (attempt ${attempt}/${retries})`));
          }, 10000);
        });

        this.sendMessage({
          type: 'sync_request',
          id: msgId,
          timestamp: Date.now(),
          documentId,
        });

        // Wait for server to respond with sync_response
        await responsePromise;

        // Small delay to allow subscription to fully register
        // With ACK system, we don't need long delays - server will retry if needed
        await sleep(50);

        return; // Success!
      } catch (error) {
        if (attempt === retries) {
          // Last attempt failed - throw error
          throw new Error(`Failed to subscribe to ${documentId} after ${retries} attempts: ${error}`);
        }
        // Exponential backoff
        await sleep(Math.pow(2, attempt) * 100);
      }
    }
  }

  /**
   * Set field in document
   * Works offline by queuing operations for later sync
   */
  async setField(
    documentId: string,
    field: string,
    value: any
  ): Promise<void> {
    // Ensure document is initialized (works offline)
    await this.ensureSubscribed(documentId);

    // Update local state immediately
    let doc = this.documents.get(documentId)!;
    doc[field] = value;

    // If connected, send delta to server immediately
    if (this.connected && this.ws) {
      this.sendMessage({
        type: 'delta',
        id: generateTestId('msg'),
        timestamp: Date.now(),
        documentId,
        delta: { [field]: value },
        vectorClock: {},
      });

      // Small delay to allow propagation
      await sleep(10);
    } else {
      // If offline, queue the operation for later sync
      this.offlineQueue.push({
        type: 'setField',
        documentId,
        data: { field, value }
      });
    }
  }

  /**
   * Get field from document
   */
  async getField(
    documentId: string,
    field: string
  ): Promise<any> {
    await this.ensureSubscribed(documentId);
    const doc = this.documents.get(documentId);
    return doc ? doc[field] : undefined;
  }

  /**
   * Get entire document state
   */
  async getDocumentState(documentId: string): Promise<any> {
    await this.ensureSubscribed(documentId);
    return { ...this.documents.get(documentId)! };
  }

  /**
   * Get document (alias for getDocumentState - for test compatibility)
   * Requests document from server via sync_request
   */
  async getDocument(documentId: string): Promise<any> {
    // Send sync request to server
    const msgId = generateTestId('msg');
    this.sendMessage({
      type: 'sync_request',
      id: msgId,
      timestamp: Date.now(),
      documentId,
    });
    
    // Wait for response (with timeout)
    await sleep(100);
    return this.getDocumentState(documentId);
  }

  /**
   * Delete field from document
   * Works offline by queuing operations for later sync
   */
  async deleteField(
    documentId: string,
    field: string
  ): Promise<void> {
    // Ensure document is initialized (works offline)
    await this.ensureSubscribed(documentId);

    // Update local state
    const doc = this.documents.get(documentId)!;
    delete doc[field];

    // If connected, send delta to server immediately
    if (this.connected && this.ws) {
      // Send delta with tombstone marker to delete field
      // Use special { __deleted: true } marker to distinguish from null values
      this.sendMessage({
        type: 'delta',
        id: generateTestId('msg'),
        timestamp: Date.now(),
        documentId,
        delta: { [field]: { __deleted: true } },
        vectorClock: {},
      });

      await sleep(50);
    } else {
      // If offline, queue the operation for later sync
      this.offlineQueue.push({
        type: 'deleteField',
        documentId,
        data: { field }
      });
    }
  }

  /**
   * Subscribe to document changes
   * Note: Server auto-subscribes on sync_request, so this just sets up callback
   */
  async subscribeToDocument(
    documentId: string,
    callback: (state: any) => void
  ): Promise<() => void> {
    // Send sync_request to subscribe (server auto-subscribes on sync)
    this.sendMessage({
      type: 'sync_request',
      id: generateTestId('msg'),
      timestamp: Date.now(),
      documentId,
    });

    // Return unsubscribe function (no-op for now)
    return () => {
      // Server doesn't have explicit unsubscribe, cleans up on disconnect
    };
  }

  /**
   * Wait for document to reach expected state
   */
  async waitForState(
    documentId: string,
    expectedState: Record<string, any>,
    timeout: number = TEST_CONFIG.timeouts.sync
  ): Promise<void> {
    await this.ensureSubscribed(documentId);

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Direct access to avoid re-checking subscription
      const currentState = { ...this.documents.get(documentId)! };

      // Check if all expected fields match using deep equality
      let matches = true;
      for (const [key, value] of Object.entries(expectedState)) {
        if (!deepEqual(currentState[key], value)) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return;
      }

      await sleep(100);
    }

    throw new Error(`Timeout waiting for document state after ${timeout}ms`);
  }

  /**
   * Wait for field to have expected value
   */
  async waitForField(
    documentId: string,
    field: string,
    expectedValue: any,
    timeout: number = TEST_CONFIG.timeouts.sync
  ): Promise<void> {
    await this.ensureSubscribed(documentId);

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Direct access to avoid re-checking subscription
      const doc = this.documents.get(documentId);
      const value = doc ? doc[field] : undefined;

      // Use deep equality for objects/arrays, reference equality for primitives
      if (deepEqual(value, expectedValue)) {
        return;
      }

      await sleep(100);
    }

    throw new Error(`Timeout waiting for field '${field}' to equal ${expectedValue} after ${timeout}ms`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Small delay to allow pending operations to complete
    await sleep(100);

    await this.disconnect();
    this.documents.clear();
    this.syncedDocuments.clear();
    this.messageCallbacks.clear();

    if (TEST_CONFIG.features.verbose) {
      console.log(`[TestClient:${this.clientId}] Cleaned up`);
    }
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get client ID
   */
  get id(): string {
    return this.clientId;
  }
}

/**
 * Create multiple test clients
 */
export async function createTestClients(count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  
  for (let i = 0; i < count; i++) {
    const client = new TestClient({
      userId: TEST_CONFIG.testData.userIds[i % TEST_CONFIG.testData.userIds.length],
    });
    await client.init();
    clients.push(client);
  }

  return clients;
}

/**
 * Cleanup multiple test clients
 */
export async function cleanupTestClients(clients: TestClient[]): Promise<void> {
  await Promise.all(clients.map(client => client.cleanup()));
}
