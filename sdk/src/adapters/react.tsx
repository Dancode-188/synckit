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

/**
 * Hook for collaborative text editing with Fugue Text CRDT
 *
 * Provides real-time text collaboration with automatic conflict resolution.
 *
 * @param id - Document ID for the text
 * @returns Tuple of [content, operations, textInstance]
 *
 * @example
 * ```tsx
 * function TextEditor({ docId }: { docId: string }) {
 *   const [content, { insert, delete: del }, text] = useSyncText(docId)
 *
 *   return (
 *     <textarea
 *       value={content}
 *       onChange={(e) => {
 *         const newValue = e.target.value
 *         const oldValue = content
 *
 *         // Simple diff: replace all content (not optimal, just for demo)
 *         if (newValue.length > oldValue.length) {
 *           insert(oldValue.length, newValue.slice(oldValue.length))
 *         } else if (newValue.length < oldValue.length) {
 *           del(newValue.length, oldValue.length - newValue.length)
 *         }
 *       }}
 *     />
 *   )
 * }
 * ```
 */
export function useSyncText(
  id: string
): [
  string,
  {
    insert: (position: number, text: string) => Promise<void>
    delete: (position: number, length: number) => Promise<void>
  },
  import('../text').SyncText
] {
  const synckit = useSyncKit()
  const [content, setContent] = useState<string>('')
  const textRef = useRef<import('../text').SyncText | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Get or create text instance using SyncKit factory
  if (!textRef.current) {
    textRef.current = synckit.text(id)
  }

  const text = textRef.current

  // Initialize text
  useEffect(() => {
    if (!text) return

    let cancelled = false

    text.init().then(() => {
      if (!cancelled) {
        setInitialized(true)
      }
    }).catch((error) => {
      console.error('Failed to initialize text:', error)
    })

    return () => {
      cancelled = true
    }
  }, [text])

  // Subscribe to changes (only after initialization)
  useEffect(() => {
    if (!initialized || !text) return

    // Set initial content
    setContent(text.get())

    // Subscribe to future changes
    const unsubscribe = text.subscribe((newContent) => {
      setContent(newContent)
    })

    return unsubscribe
  }, [text, initialized])

  // Memoized operations
  const insert = useCallback(
    (position: number, str: string) => {
      if (!text) {
        return Promise.reject(new Error('Text not initialized'))
      }
      return text.insert(position, str)
    },
    [text]
  )

  const deleteText = useCallback(
    (position: number, length: number) => {
      if (!text) {
        return Promise.reject(new Error('Text not initialized'))
      }
      return text.delete(position, length)
    },
    [text]
  )

  return [content, { insert, delete: deleteText }, text!]
}

// ====================
// Counter Hook
// ====================

/**
 * Hook for collaborative counter CRDT
 * Returns [value, { increment, decrement }, counter]
 *
 * @example
 * ```tsx
 * function ViewCounter() {
 *   const [count, { increment, decrement }] = useSyncCounter('page-views')
 *
 *   return (
 *     <div>
 *       <p>Views: {count}</p>
 *       <button onClick={() => increment()}>+1</button>
 *       <button onClick={() => increment(5)}>+5</button>
 *       <button onClick={() => decrement()}>-1</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useSyncCounter(
  id: string
): [
  number,
  {
    increment: (amount?: number) => Promise<void>
    decrement: (amount?: number) => Promise<void>
  },
  import('../counter').SyncCounter
] {
  const synckit = useSyncKit()
  const [value, setValue] = useState<number>(0)
  const counterRef = useRef<import('../counter').SyncCounter | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Get or create counter instance using SyncKit factory
  if (!counterRef.current) {
    counterRef.current = synckit.counter(id)
  }

  const counter = counterRef.current

  // Initialize counter
  useEffect(() => {
    if (!counter) return

    let cancelled = false

    counter.init().then(() => {
      if (!cancelled) {
        setInitialized(true)
      }
    }).catch((error) => {
      console.error('Failed to initialize counter:', error)
    })

    return () => {
      cancelled = true
    }
  }, [counter])

  // Subscribe to changes (only after initialization)
  useEffect(() => {
    if (!initialized || !counter) return

    // Set initial value
    setValue(counter.value)

    // Subscribe to future changes
    const unsubscribe = counter.subscribe((newValue) => {
      setValue(newValue)
    })

    return unsubscribe
  }, [counter, initialized])

  // Memoized operations
  const increment = useCallback(
    (amount?: number) => {
      if (!counter) {
        return Promise.reject(new Error('Counter not initialized'))
      }
      return counter.increment(amount)
    },
    [counter]
  )

  const decrement = useCallback(
    (amount?: number) => {
      if (!counter) {
        return Promise.reject(new Error('Counter not initialized'))
      }
      return counter.decrement(amount)
    },
    [counter]
  )

  return [value, { increment, decrement }, counter!]
}

// ====================
// Set Hook
// ====================

/**
 * Hook for collaborative set CRDT
 * Returns [values, { add, remove, clear }, set]
 *
 * @example
 * ```tsx
 * function TagEditor() {
 *   const [tags, { add, remove }] = useSyncSet<string>('document-tags')
 *
 *   return (
 *     <div>
 *       <div>
 *         {Array.from(tags).map(tag => (
 *           <span key={tag}>
 *             {tag}
 *             <button onClick={() => remove(tag)}>×</button>
 *           </span>
 *         ))}
 *       </div>
 *       <button onClick={() => add('urgent')}>Add Tag</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useSyncSet<T extends string = string>(
  id: string
): [
  Set<T>,
  {
    add: (value: T) => Promise<void>
    remove: (value: T) => Promise<void>
    clear: () => Promise<void>
  },
  import('../set').SyncSet<T>
] {
  const synckit = useSyncKit()
  const [values, setValues] = useState<Set<T>>(new Set())
  const setRef = useRef<import('../set').SyncSet<T> | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Get or create set instance using SyncKit factory
  if (!setRef.current) {
    setRef.current = synckit.set<T>(id)
  }

  const set = setRef.current

  // Initialize set
  useEffect(() => {
    if (!set) return

    let cancelled = false

    set.init().then(() => {
      if (!cancelled) {
        setInitialized(true)
      }
    }).catch((error) => {
      console.error('Failed to initialize set:', error)
    })

    return () => {
      cancelled = true
    }
  }, [set])

  // Subscribe to changes (only after initialization)
  useEffect(() => {
    if (!initialized || !set) return

    // Set initial values
    setValues(new Set(set.values()))

    // Subscribe to future changes
    const unsubscribe = set.subscribe((newValues) => {
      setValues(new Set(newValues))
    })

    return unsubscribe
  }, [set, initialized])

  // Memoized operations
  const add = useCallback(
    (value: T) => {
      if (!set) {
        return Promise.reject(new Error('Set not initialized'))
      }
      return set.add(value)
    },
    [set]
  )

  const remove = useCallback(
    (value: T) => {
      if (!set) {
        return Promise.reject(new Error('Set not initialized'))
      }
      return set.remove(value)
    },
    [set]
  )

  const clear = useCallback(
    () => {
      if (!set) {
        return Promise.reject(new Error('Set not initialized'))
      }
      return set.clear()
    },
    [set]
  )

  return [values, { add, remove, clear }, set!]
}
