/**
 * Storage Interface
 * 
 * Abstraction layer for document persistence.
 * Allows swapping between PostgreSQL, SQLite, or other storage backends.
 */

export interface DocumentState {
  id: string;
  state: any; // JSONB document state
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface VectorClockEntry {
  documentId: string;
  clientId: string;
  clockValue: bigint;
  updatedAt: Date;
}

export interface DeltaEntry {
  id: string;
  documentId: string;
  clientId: string;
  operationType: 'set' | 'delete' | 'merge';
  fieldPath: string;
  value?: any;
  clockValue: bigint;
  timestamp: Date;
}

export interface SessionEntry {
  id: string;
  userId: string;
  clientId?: string;
  connectedAt: Date;
  lastSeen: Date;
  metadata?: Record<string, any>;
}

export interface SnapshotEntry {
  id: string;
  documentId: string;
  state: any; // JSONB document state
  version: Record<string, bigint>; // Vector clock at time of snapshot
  sizeBytes: number;
  createdAt: Date;
  compressed?: boolean;
}

/**
 * Storage adapter interface
 */
export interface StorageAdapter {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  healthCheck(): Promise<boolean>;

  // Document operations
  getDocument(id: string): Promise<DocumentState | null>;
  saveDocument(id: string, state: any): Promise<DocumentState>;
  updateDocument(id: string, state: any): Promise<DocumentState>;
  deleteDocument(id: string): Promise<boolean>;
  listDocuments(limit?: number, offset?: number): Promise<DocumentState[]>;

  // Vector clock operations
  getVectorClock(documentId: string): Promise<Record<string, bigint>>;
  updateVectorClock(documentId: string, clientId: string, clockValue: bigint): Promise<void>;
  mergeVectorClock(documentId: string, clock: Record<string, bigint>): Promise<void>;

  // Delta operations (optional - for audit trail)
  saveDelta(delta: Omit<DeltaEntry, 'id' | 'timestamp'>): Promise<DeltaEntry>;
  getDeltas(documentId: string, limit?: number): Promise<DeltaEntry[]>;

  // Session operations (optional - for connection tracking)
  saveSession(session: Omit<SessionEntry, 'connectedAt' | 'lastSeen'>): Promise<SessionEntry>;
  updateSession(sessionId: string, lastSeen: Date, metadata?: Record<string, any>): Promise<void>;
  deleteSession(sessionId: string): Promise<boolean>;
  getSessions(userId: string): Promise<SessionEntry[]>;

  // Snapshot operations (optional - for state snapshots)
  saveSnapshot(snapshot: Omit<SnapshotEntry, 'id' | 'createdAt'>): Promise<SnapshotEntry>;
  getSnapshot(snapshotId: string): Promise<SnapshotEntry | null>;
  getLatestSnapshot(documentId: string): Promise<SnapshotEntry | null>;
  listSnapshots(documentId: string, limit?: number): Promise<SnapshotEntry[]>;
  deleteSnapshot(snapshotId: string): Promise<boolean>;

  // Maintenance
  cleanup(options?: {
    oldSessionsHours?: number;
    oldDeltasDays?: number;
    oldSnapshotsDays?: number;
    maxSnapshotsPerDocument?: number;
  }): Promise<{ sessionsDeleted: number; deltasDeleted: number; snapshotsDeleted: number }>;
}

/**
 * Transaction interface (for ACID operations)
 */
export interface Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Storage adapter with transaction support
 */
export interface TransactionalStorageAdapter extends StorageAdapter {
  beginTransaction(): Promise<Transaction>;
  executeInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  // PostgreSQL specific
  connectionString?: string;
  poolMin?: number;
  poolMax?: number;
  
  // Generic options
  maxRetries?: number;
  retryDelay?: number;
  connectionTimeout?: number;
}

/**
 * Storage error types
 */
export class StorageError extends Error {
  constructor(message: string, public code?: string, public cause?: Error) {
    super(message);
    this.name = 'StorageError';
  }
}

export class ConnectionError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'QUERY_ERROR', cause);
    this.name = 'QueryError';
  }
}

export class NotFoundError extends StorageError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends StorageError {
  constructor(message: string) {
    super(message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}
