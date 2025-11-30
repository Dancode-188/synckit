/**
 * React Hooks for SyncKit
 * @module adapters/react
 */

import { useEffect, useState, useCallback, useRef, createContext, useContext } from 'react'
import type { SyncKit } from '../synckit'
import type { SyncDocument } from '../document'
import type { NetworkStatus, DocumentSyncState } from '../types'

// ====================
// Context
// ====================

const SyncKitContext = createContext<SyncKit | null>(null)

export interface SyncProviderProps {
  synckit: SyncKit
  children: React.ReactNode
}

/**
 * Provider component for SyncKit instance
 */
export function SyncProvider({ synckit, children }: SyncProviderProps) {
  return (
    <SyncKitContext.Provider value={synckit}>
      {children}
    </SyncKitContext.Provider>
  )
}

/**
 * Get SyncKit instance from context
 */
export function useSyncKit(): SyncKit {
  const synckit = useContext(SyncKitContext)
  if (!synckit) {
    throw new Error('useSyncKit must be used within a SyncProvider')
  }
  return synckit
}

// ====================
// Document Hook
// ====================

export interface UseSyncDocumentOptions {
  /** Auto-initialize the document (default: true) */
  autoInit?: boolean
}

/**
 * Hook for syncing a document
 * Returns [data, setters, document]
 */
export function useSyncDocument<T extends Record<string, unknown>>(
  id: string,
  _options: UseSyncDocumentOptions = {}
): [T, {
  set: <K extends keyof T>(field: K, value: T[K]) => Promise<void>
  update: (updates: Partial<T>) => Promise<void>
  delete: <K extends keyof T>(field: K) => Promise<void>
}, SyncDocument<T>] {
  const synckit = useSyncKit()
  const [data, setData] = useState<T>({} as T)
  const docRef = useRef<SyncDocument<T> | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Get or create document
  if (!docRef.current) {
    docRef.current = synckit.document<T>(id)
  }

  const doc = docRef.current

  // Initialize document
  useEffect(() => {
    let cancelled = false

    doc.init().then(() => {
      if (!cancelled) {
        setInitialized(true)
      }
    }).catch((error) => {
      console.error('Failed to initialize document:', error)
    })

    return () => {
      cancelled = true
    }
  }, [doc])

  // Subscribe to changes (only after initialization)
  useEffect(() => {
    if (!initialized) return

    const unsubscribe = doc.subscribe((newData) => {
      setData(newData)
    })

    return unsubscribe
  }, [doc, initialized])
  
  // Memoized setters
  const set = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => doc.set(field, value),
    [doc]
  )
  
  const update = useCallback(
    (updates: Partial<T>) => doc.update(updates),
    [doc]
  )
  
  const deleteField = useCallback(
    <K extends keyof T>(field: K) => doc.delete(field),
    [doc]
  )
  
  return [data, { set, update, delete: deleteField }, doc]
}

// ====================
// Field Hook
// ====================

/**
 * Hook for syncing a single field
 * Returns [value, setValue]
 */
export function useSyncField<T extends Record<string, unknown>, K extends keyof T>(
  id: string,
  field: K
): [T[K] | undefined, (value: T[K]) => Promise<void>] {
  const [data, { set }] = useSyncDocument<T>(id)
  
  const value = data[field]
  const setValue = useCallback(
    (newValue: T[K]) => set(field, newValue),
    [set, field]
  )
  
  return [value, setValue]
}

// ====================
// List Hook
// ====================

/**
 * Hook for listing all documents
 */
export function useSyncDocumentList(): string[] {
  const synckit = useSyncKit()
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    synckit.listDocuments()
      .then(setIds)
      .catch(console.error)
  }, [synckit])

  return ids
}

// ====================
// Network Status Hook
// ====================

/**
 * Hook for monitoring network status
 * Returns null if network layer is not initialized (offline-only mode)
 */
export function useNetworkStatus(): NetworkStatus | null {
  const synckit = useSyncKit()
  const [status, setStatus] = useState<NetworkStatus | null>(() =>
    synckit.getNetworkStatus()
  )

  useEffect(() => {
    // If no network layer, return early
    const initialStatus = synckit.getNetworkStatus()
    if (!initialStatus) {
      setStatus(null)
      return
    }

    // Set initial status
    setStatus(initialStatus)

    // Subscribe to changes
    const unsubscribe = synckit.onNetworkStatusChange((newStatus) => {
      setStatus(newStatus)
    })

    return unsubscribe || undefined
  }, [synckit])

  return status
}

// ====================
// Sync State Hook
// ====================

/**
 * Hook for monitoring document sync state
 * Returns null if network layer is not initialized (offline-only mode)
 */
export function useSyncState(documentId: string): DocumentSyncState | null {
  const synckit = useSyncKit()
  const [syncState, setSyncState] = useState<DocumentSyncState | null>(() =>
    synckit.getSyncState(documentId)
  )

  useEffect(() => {
    // If no network layer, return early
    const initialState = synckit.getSyncState(documentId)
    if (!initialState) {
      setSyncState(null)
      return
    }

    // Set initial state
    setSyncState(initialState)

    // Subscribe to changes
    const unsubscribe = synckit.onSyncStateChange(documentId, (newState) => {
      setSyncState(newState)
    })

    return unsubscribe || undefined
  }, [synckit, documentId])

  return syncState
}

// ====================
// Enhanced Document Hook with Sync State
// ====================

export interface UseSyncDocumentResult<T extends Record<string, unknown>> {
  /** Document data */
  data: T
  /** Document setters */
  setters: {
    set: <K extends keyof T>(field: K, value: T[K]) => Promise<void>
    update: (updates: Partial<T>) => Promise<void>
    delete: <K extends keyof T>(field: K) => Promise<void>
  }
  /** Document instance */
  document: SyncDocument<T>
  /** Sync state (null if network layer not initialized) */
  syncState: DocumentSyncState | null
}

/**
 * Enhanced hook for syncing a document with sync state
 * Returns an object with data, setters, document, and syncState
 */
export function useSyncDocumentWithState<T extends Record<string, unknown>>(
  id: string,
  options: UseSyncDocumentOptions = {}
): UseSyncDocumentResult<T> {
  const [data, setters, document] = useSyncDocument<T>(id, options)
  const syncState = useSyncState(id)

  return {
    data,
    setters,
    document,
    syncState,
  }
}
