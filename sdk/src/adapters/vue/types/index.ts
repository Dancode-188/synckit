/**
 * TypeScript types for Vue adapter
 * @module adapters/vue/types
 */

import type { Ref } from 'vue'
import type { SyncDocument } from '../../../document'
import type { NetworkStatus } from '../../../types'

/**
 * Input type that accepts a value, ref, or getter function
 * Mirrors VueUse's MaybeRefOrGetter pattern
 */
export type MaybeRefOrGetter<T> = T | Ref<T> | (() => T)

/**
 * Options for useSyncDocument composable
 */
export interface UseSyncDocumentOptions {
  /**
   * Auto-initialize the document
   * @default true
   */
  autoInit?: boolean

  /**
   * Retry failed sync operations
   * @default true
   */
  retry?: boolean | { attempts: number; delay: number }
}

/**
 * Return type for useSyncDocument composable
 * Following VueUse pattern: return refs in an object
 */
export interface UseSyncDocumentReturn<T extends Record<string, unknown>> {
  /**
   * Document data (reactive)
   */
  data: Ref<T>

  /**
   * Loading state
   */
  loading: Ref<boolean>

  /**
   * Error state
   */
  error: Ref<Error | null>

  /**
   * Set a single field
   */
  set: <K extends keyof T>(field: K, value: T[K]) => Promise<void>

  /**
   * Update multiple fields
   */
  update: (updates: Partial<T>) => Promise<void>

  /**
   * Delete a field
   */
  deleteField: <K extends keyof T>(field: K) => Promise<void>

  /**
   * Refresh document from server
   */
  refresh: () => Promise<void>

  /**
   * Raw document instance (for advanced usage)
   */
  document: Ref<SyncDocument<T> | null>
}

/**
 * Options for useSyncField composable
 */
export interface UseSyncFieldOptions {
  /**
   * Auto-initialize the document
   * @default true
   */
  autoInit?: boolean
}

/**
 * Return type for useSyncField composable
 */
export interface UseSyncFieldReturn<T> {
  /**
   * Field value (reactive)
   */
  value: Ref<T | undefined>

  /**
   * Loading state
   */
  loading: Ref<boolean>

  /**
   * Error state
   */
  error: Ref<Error | null>

  /**
   * Set the field value
   */
  setValue: (newValue: T) => Promise<void>
}

/**
 * Options for useNetworkStatus composable
 */
export interface UseNetworkStatusOptions {
  /**
   * Poll interval in milliseconds
   * @default undefined (no polling, event-based only)
   */
  pollInterval?: number
}

/**
 * Return type for useNetworkStatus composable
 */
export interface UseNetworkStatusReturn {
  /**
   * Network status (reactive)
   * Null if network layer not initialized
   */
  status: Ref<NetworkStatus | null>

  /**
   * Connection state
   */
  connected: Ref<boolean>

  /**
   * Number of connected peers
   */
  peerCount: Ref<number>

  /**
   * Refresh network status
   */
  refresh: () => void
}

/**
 * Options for useSyncStatus composable
 */
export interface UseSyncStatusOptions {
  /**
   * Document ID to monitor
   */
  documentId?: string
}

/**
 * Return type for useSyncStatus composable
 */
export interface UseSyncStatusReturn {
  /**
   * Online/offline state
   */
  online: Ref<boolean>

  /**
   * Currently syncing
   */
  syncing: Ref<boolean>

  /**
   * Last successful sync timestamp
   */
  lastSync: Ref<Date | null>

  /**
   * Sync errors
   */
  errors: Ref<Error[]>

  /**
   * Retry failed sync
   */
  retry: () => Promise<void>
}
