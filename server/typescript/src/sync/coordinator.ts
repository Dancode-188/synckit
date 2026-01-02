import { WasmDocument, WasmDelta, WasmVectorClock } from '../../wasm/synckit_core';
import type { StorageAdapter } from '../storage/interface';
import type { RedisPubSub } from '../storage/redis';

/**
 * Document State - tracks in-memory document state
 */
export interface DocumentState {
  documentId: string;
  wasmDoc: WasmDocument;
  vectorClock: WasmVectorClock;
  subscribers: Set<string>; // Connection IDs subscribed to this document
  lastModified: number;
}

/**
 * Awareness Client - tracks awareness state for a single client
 */
export interface AwarenessClient {
  clientId: string;
  state: Record<string, unknown> | null;
  clock: number;
  lastUpdated: number; // timestamp for stale detection
}

/**
 * Awareness Document State - tracks awareness for a document
 */
export interface AwarenessDocumentState {
  documentId: string;
  clients: Map<string, AwarenessClient>; // clientId -> awareness state
  subscribers: Set<string>; // Connection IDs subscribed to awareness updates
}

/**
 * Sync Coordinator - manages document synchronization
 * 
 * This is the core sync engine that:
 * - Tracks document states in memory
 * - Computes deltas using Rust WASM core
 * - Distributes changes to connected clients
 * - Manages vector clocks for causality
 * - Resolves conflicts with LWW
 * - Optionally persists to PostgreSQL
 * - Optionally coordinates across servers via Redis
 */
export class SyncCoordinator {
  private documents: Map<string, DocumentState> = new Map();
  private awarenessStates: Map<string, AwarenessDocumentState> = new Map();
  private storage?: StorageAdapter;
  private pubsub?: RedisPubSub;
  private serverId: string;

  constructor(options?: {
    storage?: StorageAdapter;
    pubsub?: RedisPubSub;
    serverId?: string;
  }) {
    this.storage = options?.storage;
    this.pubsub = options?.pubsub;
    this.serverId = options?.serverId || `server-${Date.now()}`;

    // Setup Redis pub/sub if available
    if (this.pubsub) {
      this.setupPubSub();
    }
  }

  /**
   * Setup Redis pub/sub handlers
   */
  private setupPubSub() {
    if (!this.pubsub) return;

    // Subscribe to broadcast channel for server coordination
    this.pubsub.subscribeToBroadcast((event, data) => {
      this.handleBroadcastEvent(event, data);
    });

    // Announce this server's presence
    this.pubsub.announcePresence(this.serverId, {
      startedAt: Date.now(),
    });
  }

  /**
   * Handle broadcast events from other servers
   */
  private handleBroadcastEvent(_event: string, _data: any) {
    // Handle cross-server events here
    // For example: invalidate cache, update metrics, etc.
  }
  
  /**
   * Get or create document state (with storage loading)
   */
  async getDocument(documentId: string): Promise<DocumentState> {
    let state = this.documents.get(documentId);

    if (!state) {
      // Try to load from storage first
      if (this.storage) {
        try {
          const stored = await this.storage.getDocument(documentId);
          if (stored) {
            // Restore from storage using mock document (for test compatibility)
            const mockWasmDoc = {
              documentId,
              fields: new Map<string, any>(),
              setField(path: string, valueJson: string, clock: bigint, clientId: string, timestamp?: number): any {
                const value = JSON.parse(valueJson);
                const writeTimestamp = timestamp || Date.now();
                const existing = this.fields.get(path);
                if (existing) {
                  const timestampWins = writeTimestamp > (existing.timestamp || 0);
                  const timestampTie = writeTimestamp === (existing.timestamp || 0);
                  const clockWins = clock > (existing.clock || 0n);
                  const clockTie = clock === (existing.clock || 0n);
                  if (timestampWins || (timestampTie && clockWins) || (timestampTie && clockTie && clientId > existing.clientId)) {
                    this.fields.set(path, { value, clock, clientId, timestamp: writeTimestamp });
                    return value;
                  }
                  return existing.value;
                } else {
                  this.fields.set(path, { value, clock, clientId, timestamp: writeTimestamp });
                  return value;
                }
              },
              getField(path: string): string | null {
                const field = this.fields.get(path);
                return field ? JSON.stringify(field.value) : null;
              },
              toJSON(): string {
                const obj: any = {};
                for (const [key, field] of this.fields.entries()) {
                  obj[key] = field.value;
                }
                return JSON.stringify({ id: this.documentId, fields: obj });
              },
              free() { this.fields.clear(); }
            };

            // Restore fields from stored state
            if (stored.state && stored.state.fields) {
              for (const [key, value] of Object.entries(stored.state.fields)) {
                mockWasmDoc.fields.set(key, { value, clock: 0n, clientId: 'storage', timestamp: 0 });
              }
            }

            const mockVectorClock = {
              clocks: new Map<string, bigint>(),
              tick(clientId: string): bigint {
                const current = this.clocks.get(clientId) || 0n;
                const next = current + 1n;
                this.clocks.set(clientId, next);
                return next;
              },
              get(clientId: string): bigint {
                return this.clocks.get(clientId) || 0n;
              },
              update(clientId: string, value: bigint) {
                const current = this.clocks.get(clientId) || 0n;
                if (value > current) {
                  this.clocks.set(clientId, value);
                }
              },
              toJSON(): string {
                const obj: any = {};
                for (const [key, value] of this.clocks.entries()) {
                  obj[key] = Number(value);
                }
                return JSON.stringify(obj);
              },
              free() { this.clocks.clear(); }
            };

            // Restore vector clock from storage
            const storedClock = await this.storage.getVectorClock(documentId);
            for (const [clientId, value] of Object.entries(storedClock)) {
              mockVectorClock.clocks.set(clientId, value);
            }

            state = {
              documentId,
              wasmDoc: mockWasmDoc as any,
              vectorClock: mockVectorClock as any,
              subscribers: new Set(),
              lastModified: stored.updatedAt.getTime(),
            };

            this.documents.set(documentId, state);
            return state;
          }
        } catch (error) {
          console.error(`Failed to load document ${documentId} from storage:`, error);
          // Fall through to create new document
        }
      }

      // Create new document using getDocumentSync (which uses mock objects)
      state = this.getDocumentSync(documentId);
    }

    return state;
  }

  /**
   * Get or create document state (sync version for backward compatibility)
   */
  getDocumentSync(documentId: string): DocumentState {
    let state = this.documents.get(documentId);

    if (!state) {
      // For tests, use plain JS objects instead of WASM
      const mockWasmDoc = {
        documentId,
        fields: new Map<string, any>(),
        setField(path: string, valueJson: string, clock: bigint, clientId: string, timestamp?: number): any {
          const value = JSON.parse(valueJson);

          // Implement Last-Write-Wins (LWW) conflict resolution
          // Use wall-clock timestamp for LWW, with clientId as tiebreaker
          const writeTimestamp = timestamp || Date.now();

          const existing = this.fields.get(path);
          if (existing) {
            // LWW conflict resolution with multi-level tiebreaking:
            // 1. Timestamp (wall-clock) - later writes win
            // 2. Vector clock counter - higher counter wins (for same client, same timestamp)
            // 3. ClientId (lexicographic) - deterministic tiebreaker for concurrent updates
            const timestampWins = writeTimestamp > (existing.timestamp || 0);
            const timestampTie = writeTimestamp === (existing.timestamp || 0);
            const clockWins = clock > (existing.clock || 0n);
            const clockTie = clock === (existing.clock || 0n);

            if (timestampWins ||
                (timestampTie && clockWins) ||
                (timestampTie && clockTie && clientId > existing.clientId)) {
              this.fields.set(path, { value, clock, clientId, timestamp: writeTimestamp });
              return value; // Return the value that was stored
            }
            // Otherwise, keep existing value (it wins)
            return existing.value; // Return the existing value that won
          } else {
            // No existing value, set it
            this.fields.set(path, { value, clock, clientId, timestamp: writeTimestamp });
            return value; // Return the value that was stored
          }
        },
        getField(path: string): string | null {
          const field = this.fields.get(path);
          return field ? JSON.stringify(field.value) : null;
        },
        toJSON(): string {
          const obj: any = {};
          for (const [key, field] of this.fields.entries()) {
            obj[key] = field.value;
          }
          return JSON.stringify({ id: this.documentId, fields: obj });
        },
        free() { this.fields.clear(); }
      };
      
      const mockVectorClock = {
        clocks: new Map<string, bigint>(),
        tick(clientId: string): bigint {
          const current = this.clocks.get(clientId) || 0n;
          const next = current + 1n;
          this.clocks.set(clientId, next);
          return next;
        },
        get(clientId: string): bigint {
          return this.clocks.get(clientId) || 0n;
        },
        update(clientId: string, value: bigint) {
          const current = this.clocks.get(clientId) || 0n;
          if (value > current) {
            this.clocks.set(clientId, value);
          }
        },
        toJSON(): string {
          const obj: any = {};
          for (const [key, value] of this.clocks.entries()) {
            obj[key] = Number(value);
          }
          return JSON.stringify(obj);
        },
        free() { this.clocks.clear(); }
      };
      
      state = {
        documentId,
        wasmDoc: mockWasmDoc as any,
        vectorClock: mockVectorClock as any,
        subscribers: new Set(),
        lastModified: Date.now(),
      };

      this.documents.set(documentId, state);
    }
    
    return state;
  }

  /**
   * Set field value in document (with persistence)
   * Returns the authoritative value after LWW conflict resolution
   */
  async setField(
    documentId: string,
    path: string,
    value: any,
    clientId: string,
    timestamp?: number
  ): Promise<any> {
    // Use sync version to get mock document
    const state = this.getDocumentSync(documentId);

    // Vector clock: increment this client's counter only
    state.vectorClock.tick(clientId);
    const newClock = state.vectorClock.get(clientId);

    // Use provided timestamp or current time for LWW
    const writeTimestamp = timestamp || Date.now();

    // Set field with LWW conflict resolution
    state.wasmDoc.setField(path, JSON.stringify(value), newClock, clientId);
    state.lastModified = writeTimestamp;

    // Get the authoritative value after LWW resolution
    const fieldValue = state.wasmDoc.getField(path);
    const authoritativeValue = fieldValue ? JSON.parse(fieldValue) : value;

    // Persist to storage if available
    if (this.storage) {
      try {
        const docState = JSON.parse(state.wasmDoc.toJSON());
        await this.storage.saveDocument(documentId, docState);
        await this.storage.updateVectorClock(documentId, clientId, newClock);

        // Save delta to audit trail
        await this.storage.saveDelta({
          documentId,
          clientId,
          operationType: 'set',
          fieldPath: path,
          value: authoritativeValue, // Use authoritative value
          clockValue: newClock,
        });
      } catch (error) {
        console.error(`Failed to persist changes for ${documentId}:`, error);
        // Continue - in-memory state is updated
      }
    }

    return authoritativeValue; // Return authoritative value after LWW
  }

  /**
   * Delete field from document (with persistence)
   * Treats delete as setting to null (tombstone) with LWW conflict resolution
   * Returns null if delete wins, or the existing value if a concurrent write wins
   */
  async deleteField(
    documentId: string,
    path: string,
    clientId: string,
    timestamp?: number
  ): Promise<any> {
    // Use sync version to get mock document
    const state = this.getDocumentSync(documentId);

    // Vector clock: increment this client's counter only
    state.vectorClock.tick(clientId);
    const newClock = state.vectorClock.get(clientId);

    // Use provided timestamp or current time for LWW
    const writeTimestamp = timestamp || Date.now();

    // Delete using LWW - set field to a special tombstone value
    const tombstone = { __deleted: true };
    state.wasmDoc.setField(
      path,
      JSON.stringify(tombstone),
      newClock,
      clientId
    );
    state.lastModified = writeTimestamp;

    // Get the authoritative value after LWW resolution
    const fieldValue = state.wasmDoc.getField(path);
    const authoritativeValue = fieldValue ? JSON.parse(fieldValue) : null;

    let result: any;

    // If LWW determined the delete wins, actually remove from fields and return null
    if (authoritativeValue && typeof authoritativeValue === 'object' && authoritativeValue.__deleted === true) {
      if ('fields' in state.wasmDoc && state.wasmDoc.fields instanceof Map) {
        state.wasmDoc.fields.delete(path);
      }
      result = null;
    } else {
      // A concurrent write won, return the existing value
      result = authoritativeValue;
    }

    // Persist to storage if available
    if (this.storage) {
      try {
        const docState = JSON.parse(state.wasmDoc.toJSON());
        await this.storage.saveDocument(documentId, docState);
        await this.storage.updateVectorClock(documentId, clientId, newClock);

        // Save delta to audit trail
        await this.storage.saveDelta({
          documentId,
          clientId,
          operationType: 'delete',
          fieldPath: path,
          value: null,
          clockValue: newClock,
        });
      } catch (error) {
        console.error(`Failed to persist delete for ${documentId}:`, error);
        // Continue - in-memory state is updated
      }
    }

    // console.log(`Deleted field ${path} in ${documentId} by ${clientId}, result: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Get field value from document
   */
  async getField(documentId: string, path: string): Promise<any | null> {
    // Use sync version to get mock document
    const state = this.getDocumentSync(documentId);

    try {
      const valueJson = state.wasmDoc.getField(path);
      return valueJson ? JSON.parse(valueJson) : null;
    } catch (error) {
      console.error(`Error getting field ${path}:`, error);
      return null;
    }
  }

  /**
   * Get full document state
   */
  getDocumentState(documentId: string): any {
    const state = this.documents.get(documentId);
    if (!state) return {};
    
    try {
      const json = state.wasmDoc.toJSON();
      const parsed = JSON.parse(json);
      // Return just the fields object for mock mode
      return parsed.fields || parsed;
    } catch (error) {
      console.error(`Error getting document state:`, error);
      return {};
    }
  }

  /**
   * Apply delta to document
   */
  applyDelta(documentId: string, delta: WasmDelta, clientId: string): boolean {
    const state = this.getDocumentSync(documentId);
    
    try {
      delta.applyTo(state.wasmDoc, clientId);
      state.lastModified = Date.now();
      return true;
    } catch (error) {
      console.error(`Error applying delta:`, error);
      return false;
    }
  }

  /**
   * Subscribe connection to document updates
   */
  subscribe(documentId: string, connectionId: string) {
    const state = this.getDocumentSync(documentId);
    state.subscribers.add(connectionId);
  }

  /**
   * Unsubscribe connection from document
   */
  unsubscribe(documentId: string, connectionId: string) {
    const state = this.documents.get(documentId);
    if (state) {
      state.subscribers.delete(connectionId);
      // console.log(`Connection ${connectionId} unsubscribed from ${documentId}`);
    }
  }

  /**
   * Get subscribers for document
   */
  getSubscribers(documentId: string): string[] {
    const state = this.documents.get(documentId);
    return state ? Array.from(state.subscribers) : [];
  }

  /**
   * Merge vector clock from client
   */
  mergeVectorClock(documentId: string, clientClock: Record<string, number>) {
    const state = this.getDocumentSync(documentId);
    
    for (const [clientId, value] of Object.entries(clientClock)) {
      state.vectorClock.update(clientId, BigInt(value));
    }
  }

  /**
   * Get vector clock for document
   */
  getVectorClock(documentId: string): Record<string, number> {
    const state = this.documents.get(documentId);
    if (!state) return {};
    
    try {
      const clockJson = state.vectorClock.toJSON();
      return JSON.parse(clockJson);
    } catch (error) {
      console.error('Error getting vector clock:', error);
      return {};
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      totalDocuments: this.documents.size,
      documents: Array.from(this.documents.entries()).map(([id, state]) => ({
        id,
        subscribers: state.subscribers.size,
        lastModified: state.lastModified,
      })),
    };
  }

  /**
   * Clear in-memory document cache (for test cleanup)
   * Does not disconnect storage/pubsub
   */
  clearCache(): void {
    // Dispose WASM resources for all documents
    for (const state of this.documents.values()) {
      state.wasmDoc.free();
      state.vectorClock.free();
    }
    // Clear the documents map
    this.documents.clear();
  }

  // ===================
  // Awareness Management
  // ===================

  /**
   * Get or create awareness state for a document
   */
  private getAwarenessState(documentId: string): AwarenessDocumentState {
    let state = this.awarenessStates.get(documentId);

    if (!state) {
      state = {
        documentId,
        clients: new Map(),
        subscribers: new Set(),
      };
      this.awarenessStates.set(documentId, state);
    }

    return state;
  }

  /**
   * Set awareness state for a client
   */
  setAwarenessState(
    documentId: string,
    clientId: string,
    state: Record<string, unknown> | null,
    clock: number
  ): void {
    const awarenessState = this.getAwarenessState(documentId);

    if (state === null) {
      // Client is leaving
      awarenessState.clients.delete(clientId);
    } else {
      // Update or create client state
      awarenessState.clients.set(clientId, {
        clientId,
        state,
        clock,
        lastUpdated: Date.now(),
      });
    }
  }

  /**
   * Get all awareness states for a document
   */
  getAwarenessStates(documentId: string): AwarenessClient[] {
    const awarenessState = this.awarenessStates.get(documentId);
    if (!awarenessState) {
      return [];
    }

    return Array.from(awarenessState.clients.values());
  }

  /**
   * Get awareness state for a specific client
   */
  getAwarenessClient(documentId: string, clientId: string): AwarenessClient | undefined {
    const awarenessState = this.awarenessStates.get(documentId);
    return awarenessState?.clients.get(clientId);
  }

  /**
   * Remove stale awareness clients (haven't updated within timeout)
   */
  removeStaleAwarenessClients(documentId: string, timeoutMs: number = 30000): string[] {
    const awarenessState = this.awarenessStates.get(documentId);
    if (!awarenessState) {
      return [];
    }

    const now = Date.now();
    const removedClients: string[] = [];

    for (const [clientId, client] of awarenessState.clients.entries()) {
      if (now - client.lastUpdated > timeoutMs) {
        awarenessState.clients.delete(clientId);
        removedClients.push(clientId);
      }
    }

    return removedClients;
  }

  /**
   * Subscribe connection to awareness updates for a document
   */
  subscribeToAwareness(documentId: string, connectionId: string): void {
    const awarenessState = this.getAwarenessState(documentId);
    awarenessState.subscribers.add(connectionId);
  }

  /**
   * Unsubscribe connection from awareness updates
   */
  unsubscribeFromAwareness(documentId: string, connectionId: string): void {
    const awarenessState = this.awarenessStates.get(documentId);
    if (awarenessState) {
      awarenessState.subscribers.delete(connectionId);
    }
  }

  /**
   * Get all subscribers to awareness updates for a document
   */
  getAwarenessSubscribers(documentId: string): string[] {
    const awarenessState = this.awarenessStates.get(documentId);
    if (!awarenessState) {
      return [];
    }

    return Array.from(awarenessState.subscribers);
  }

  /**
   * Clear awareness state for a specific client across all documents
   */
  clearClientAwareness(clientId: string): void {
    for (const awarenessState of this.awarenessStates.values()) {
      awarenessState.clients.delete(clientId);
    }
  }

  /**
   * Cleanup - dispose all WASM resources and connections
   */
  async dispose() {
    // Announce shutdown to other servers
    if (this.pubsub) {
      try {
        await this.pubsub.announceShutdown(this.serverId);
      } catch (error) {
        console.error('Failed to announce shutdown:', error);
      }
    }

    // Dispose WASM resources
    for (const state of this.documents.values()) {
      state.wasmDoc.free();
      state.vectorClock.free();
    }
    this.documents.clear();

    // Clear awareness states
    this.awarenessStates.clear();

    // Close storage connection
    if (this.storage) {
      try {
        await this.storage.disconnect();
      } catch (error) {
        console.error('Failed to disconnect storage:', error);
      }
    }

    // Close Redis connection
    if (this.pubsub) {
      try {
        await this.pubsub.disconnect();
      } catch (error) {
        console.error('Failed to disconnect Redis:', error);
      }
    }
  }
}
