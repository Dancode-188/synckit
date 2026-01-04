/**
 * Core TypeScript types for SyncKit SDK
 * @module types
 */

// ====================
// Configuration Types
// ====================

export interface SyncKitConfig {
  /** Storage adapter to use */
  storage?: 'indexeddb' | 'memory' | 'opfs' | StorageAdapter

  /** Application name (used for storage namespacing) */
  name?: string

  /** Server URL for remote sync (optional for offline-only) */
  serverUrl?: string

  /** Client ID (auto-generated if not provided) */
  clientId?: string

  /** Network configuration (optional) */
  network?: NetworkConfig
}

export interface NetworkConfig {
  /** WebSocket reconnection options */
  reconnect?: {
    /** Initial delay in ms (default: 1000) */
    initialDelay?: number
    /** Maximum delay in ms (default: 30000) */
    maxDelay?: number
    /** Backoff multiplier (default: 1.5) */
    multiplier?: number
  }

  /** Heartbeat/ping options */
  heartbeat?: {
    /** Ping interval in ms (default: 30000) */
    interval?: number
    /** Timeout in ms (default: 5000) */
    timeout?: number
  }

  /** Offline queue options */
  queue?: {
    /** Maximum queue size (default: 1000) */
    maxSize?: number
    /** Maximum retry attempts (default: 5) */
    maxRetries?: number
    /** Initial retry delay in ms (default: 1000) */
    retryDelay?: number
    /** Retry backoff multiplier (default: 2.0) */
    retryBackoff?: number
  }
}

// ====================
// Storage Interface
// ====================

export interface StorageAdapter {
  /**
   * Initialize the storage adapter
   */
  init(): Promise<void>
  
  /**
   * Get a document by ID
   */
  get(docId: string): Promise<StoredDocument | null>
  
  /**
   * Save a document
   */
  set(docId: string, doc: StoredDocument): Promise<void>
  
  /**
   * Delete a document
   */
  delete(docId: string): Promise<void>
  
  /**
   * List all document IDs
   */
  list(): Promise<string[]>
  
  /**
   * Clear all documents
   */
  clear(): Promise<void>

  /**
   * Subscribe to storage changes from other sources (e.g., other tabs)
   * Optional - only implemented by storage adapters that support cross-tab sync
   * @returns Unsubscribe function
   */
  onChange?: (listener: (change: { type: 'set' | 'delete' | 'clear', docId?: string }) => void) => () => void
}

export interface StoredDocument {
  id: string
  data: Record<string, unknown>
  version: Record<string, number>
  updatedAt: number
}

// ====================
// Document Types
// ====================

export type DocumentData<T = Record<string, unknown>> = T

export type FieldPath = string

export type SubscriptionCallback<T> = (data: T) => void

export interface Unsubscribe {
  (): void
}

// ====================
// Offline Queue Types
// ====================

export interface QueuedOperation {
  id: string
  docId: string
  type: 'set' | 'delete'
  field?: string
  value?: unknown
  timestamp: number
  retries: number
}

export interface QueueConfig {
  maxRetries?: number
  retryDelay?: number
  retryBackoff?: number
}

// ====================
// Error Types
// ====================

export class SyncKitError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'SyncKitError'
  }
}

export class StorageError extends SyncKitError {
  constructor(message: string) {
    super(message, 'STORAGE_ERROR')
    this.name = 'StorageError'
  }
}

export class WASMError extends SyncKitError {
  constructor(message: string) {
    super(message, 'WASM_ERROR')
    this.name = 'WASMError'
  }
}

export class DocumentError extends SyncKitError {
  constructor(message: string) {
    super(message, 'DOCUMENT_ERROR')
    this.name = 'DocumentError'
  }
}

export class NetworkError extends SyncKitError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR')
    this.name = 'NetworkError'
  }
}

// ====================
// Network Types
// ====================

export type NetworkState = 'online' | 'offline' | 'unknown'

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export type SyncState =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'offline'

export interface DocumentSyncState {
  documentId: string
  state: SyncState
  lastSyncedAt: number | null
  error: string | null
  pendingOperations: number
}

export interface NetworkStatus {
  /** Network connectivity state */
  networkState: NetworkState
  /** WebSocket connection state */
  connectionState: ConnectionState
  /** Number of pending operations in queue */
  queueSize: number
  /** Number of failed operations */
  failedOperations: number
  /** Timestamp of oldest queued operation */
  oldestOperation: number | null
}
