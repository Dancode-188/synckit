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

// ====================
// Awareness Hooks
// ====================

/**
 * Hook for accessing awareness instance for a specific document
 * Returns [awareness, { setLocalState }]
 *
 * @param documentId - The document ID to track awareness for
 *
 * @example
 * ```tsx
 * function UserPresence() {
 *   const [awareness, { setLocalState }] = useAwareness('doc-123')
 *
 *   useEffect(() => {
 *     setLocalState({
 *       user: { name: 'Alice', color: '#FF6B6B' }
 *     })
 *   }, [])
 *
 *   const states = awareness?.getStates()
 *   return <p>{states?.size || 0} users online</p>
 * }
 * ```
 */
export function useAwareness(documentId: string): [
  import('../awareness').Awareness | null,
  {
    setLocalState: (state: Record<string, unknown>) => Promise<import('../awareness').AwarenessUpdate>
  }
] {
  const synckit = useSyncKit()
  const awarenessRef = useRef<import('../awareness').Awareness | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Get awareness instance from SyncKit
  if (!awarenessRef.current) {
    awarenessRef.current = synckit.getAwareness(documentId)
  }

  const awareness = awarenessRef.current

  // Initialize awareness
  useEffect(() => {
    if (!awareness) return

    let cancelled = false

    awareness.init().then(() => {
      if (!cancelled) {
        setInitialized(true)
      }
    }).catch((error) => {
      console.error('Failed to initialize awareness:', error)
    })

    return () => {
      cancelled = true
    }
  }, [awareness])

  // Memoized setLocalState
  const setLocalState = useCallback(
    (state: Record<string, unknown>) => {
      if (!awareness || !initialized) {
        return Promise.reject(new Error('Awareness not initialized'))
      }
      return awareness.setLocalState(state)
    },
    [awareness, initialized]
  )

  return [initialized ? awareness : null, { setLocalState }]
}

/**
 * Hook for managing local user presence state for a specific document
 * Automatically updates awareness with provided state
 * Returns [localState, setLocalState]
 *
 * @param documentId - The document ID to track presence for
 * @param initialState - Initial presence state
 *
 * @example
 * ```tsx
 * function Cursor() {
 *   const [presence, setPresence] = usePresence('doc-123', {
 *     user: { name: 'Alice', color: '#FF6B6B' }
 *   })
 *
 *   const handleMouseMove = (e: React.MouseEvent) => {
 *     setPresence({
 *       ...presence,
 *       cursor: { x: e.clientX, y: e.clientY }
 *     })
 *   }
 *
 *   return <div onMouseMove={handleMouseMove}>Move your mouse</div>
 * }
 * ```
 */
export function usePresence(
  documentId: string,
  initialState?: Record<string, unknown>
): [
  Record<string, unknown> | undefined,
  (state: Record<string, unknown>) => Promise<void>
] {
  const synckit = useSyncKit()
  const [awareness, { setLocalState }] = useAwareness(documentId)
  const [localState, setLocalStateValue] = useState<Record<string, unknown> | undefined>(initialState)
  const [subscribed, setSubscribed] = useState(false)

  // Track if initial state has been set (only set once on mount)
  // IMPORTANT: We use a ref here to prevent re-setting initial state when
  // the initialState object reference changes. Without this, passing an
  // inline object like { cursor: null } would cause the presence to reset
  // on every render, overwriting any cursor updates made via setPresence.
  const initialStateSetRef = useRef(false)

  // Set initial state on mount (only once)
  // Note: initialState is intentionally NOT in dependencies to prevent
  // re-running this effect when the object reference changes
  useEffect(() => {
    if (!awareness || !initialState || initialStateSetRef.current) return

    setLocalState(initialState).catch((error) => {
      console.error('Failed to set initial presence state:', error)
    })

    initialStateSetRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awareness, setLocalState])

  // Subscribe to awareness changes to track local state updates
  useEffect(() => {
    if (!awareness || subscribed) return

    const unsubscribe = awareness.subscribe(({ updated }) => {
      const clientId = awareness.getClientId()
      if (updated.includes(clientId)) {
        const state = awareness.getLocalState()
        if (state) {
          setLocalStateValue(state.state)
        }
      }
    })

    setSubscribed(true)

    return () => {
      unsubscribe()
      setSubscribed(false)
    }
  }, [awareness])

  // Cleanup: Send leave message on unmount
  useEffect(() => {
    if (!awareness) return

    return () => {
      // Send leave update to notify other clients
      const syncManager = (synckit as any).syncManager
      if (syncManager) {
        try {
          syncManager.sendAwarenessLeave(documentId).catch((error: Error) => {
            console.error(`Failed to send leave update for ${documentId}:`, error)
          })
        } catch (error) {
          console.error(`Failed to send leave update for ${documentId}:`, error)
        }
      }
    }
  }, [awareness, documentId, synckit])

  // Memoized setter that updates both awareness and local state
  const updatePresence = useCallback(
    async (state: Record<string, unknown>) => {
      await setLocalState(state)
      // Note: setLocalStateValue is called via awareness subscription, no need to call it here
    },
    [setLocalState]
  )

  return [localState, updatePresence]
}

/**
 * Hook for tracking other online users (excluding self) for a specific document
 * Returns array of other client states
 *
 * @param documentId - The document ID to track users for
 *
 * @example
 * ```tsx
 * function OnlineUsers() {
 *   const others = useOthers('doc-123')
 *
 *   return (
 *     <div>
 *       <h3>{others.length} others online</h3>
 *       {others.map(user => (
 *         <div key={user.client_id}>
 *           {user.state.user?.name || 'Anonymous'}
 *         </div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useOthers(documentId: string): import('../awareness').AwarenessState[] {
  const [awareness] = useAwareness(documentId)
  const [others, setOthers] = useState<import('../awareness').AwarenessState[]>([])

  useEffect(() => {
    if (!awareness) return

    const updateOthers = () => {
      const allStates = awareness.getStates()
      const clientId = awareness.getClientId()
      const otherStates = Array.from(allStates.values()).filter(
        (state) => state.client_id !== clientId
      )
      setOthers(otherStates)
    }

    // Set initial others
    updateOthers()

    // Subscribe to changes
    const unsubscribe = awareness.subscribe(() => {
      updateOthers()
    })

    return unsubscribe
  }, [awareness])

  return others
}

/**
 * Hook for tracking local user state for a specific document
 * Returns local client's awareness state
 *
 * @param documentId - The document ID to track state for
 *
 * @example
 * ```tsx
 * function MyPresence() {
 *   const self = useSelf('doc-123')
 *
 *   if (!self) {
 *     return <p>Not initialized</p>
 *   }
 *
 *   return (
 *     <div>
 *       <p>You: {self.state.user?.name}</p>
 *       <p>Cursor: {JSON.stringify(self.state.cursor)}</p>
 *     </div>
 *   )
 * }
 * ```
 */
export function useSelf(documentId: string): import('../awareness').AwarenessState | undefined {
  const [awareness] = useAwareness(documentId)
  const [self, setSelf] = useState<import('../awareness').AwarenessState | undefined>()

  useEffect(() => {
    if (!awareness) return

    const updateSelf = () => {
      const localState = awareness.getLocalState()
      setSelf(localState)
    }

    // Set initial self
    updateSelf()

    // Subscribe to changes
    const unsubscribe = awareness.subscribe(({ updated }) => {
      const clientId = awareness.getClientId()
      if (updated.includes(clientId)) {
        updateSelf()
      }
    })

    return unsubscribe
  }, [awareness])

  return self
}

// ====================
// Cursor Tracking & Selection
// ====================

import { useCursorTracking } from './react/useCursor'
import type { CursorPosition } from '../cursor/types'

export * from './react/Cursor'
export * from './react/Cursors'
export * from './react/useSelection'
export * from './react/Selection'
export * from './react/Selections'
export * from './react/useUndo'

/**
 * High-level cursor tracking hook with awareness integration
 *
 * @param documentId - Document ID to broadcast cursor position to
 * @param options - Configuration options
 * @returns Object with bind() method to attach to container
 *
 * @example
 * ```tsx
 * const cursor = useCursor('my-doc', {
 *   metadata: { name: 'Alice', color: '#FF6B6B' }
 * })
 *
 * return <div {...cursor.bind()}>...</div>
 * ```
 */
export function useCursor(
  documentId: string,
  options: {
    /** @deprecated No longer needed - viewport-relative coordinates are used */
    containerRef?: React.RefObject<HTMLElement>
    metadata?: Record<string, unknown>
    enabled?: boolean
  } = {}
) {
  const { metadata = {}, enabled = true } = options
  const [, updatePresence] = usePresence(documentId)

  // Update awareness when cursor moves
  const handleCursorUpdate = useCallback(
    (position: CursorPosition) => {
      if (!updatePresence) return

      // console.log('[useCursor] Broadcasting cursor position', {
      //   documentId,
      //   position,
      //   metadata
      // })

      // Broadcast cursor position along with metadata
      updatePresence({
        cursor: position,
        ...metadata
      })
    },
    [updatePresence, metadata, documentId]
  )

  // Use low-level cursor tracking (viewport-relative, no container needed)
  const handlers = useCursorTracking({
    enabled,
    onUpdate: handleCursorUpdate
  })

  // Return bind() method for easy spreading
  return {
    bind: () => handlers
  }
}

// ====================
// RichText Hook
// ====================

export interface UseRichTextOptions {
  /** Auto-initialize the RichText CRDT (default: true) */
  autoInit?: boolean
}

export interface UseRichTextResult {
  /** Current text content */
  text: string
  /** Formatted ranges for rendering */
  ranges: import('../crdt/richtext').FormatRange[]
  /** Insert text at position */
  insert: (position: number, text: string) => Promise<void>
  /** Delete text range */
  delete: (start: number, length: number) => Promise<void>
  /** Apply formatting to range */
  format: (start: number, end: number, attributes: import('../crdt/peritext').FormatAttributes) => Promise<void>
  /** Remove formatting from range */
  unformat: (start: number, end: number, attributes: import('../crdt/peritext').FormatAttributes) => Promise<void>
  /** Get formatting at position */
  getFormats: (position: number) => import('../crdt/peritext').FormatAttributes
  /** Export as Quill Delta */
  toDelta: () => import('../crdt/delta').Delta
  /** Import from Quill Delta */
  fromDelta: (delta: import('../crdt/delta').Delta) => Promise<void>
  /** RichText instance */
  richText: import('../crdt/richtext').RichText | null
  /** Loading state */
  loading: boolean
}

/**
 * React hook for collaborative rich text editing
 *
 * Provides a reactive interface to RichText CRDT with automatic
 * synchronization and formatting support.
 *
 * @param documentId - Unique document identifier
 * @param options - Configuration options
 * @returns RichText state and operations
 *
 * @example
 * ```tsx
 * function Editor() {
 *   const { text, ranges, insert, format } = useRichText('doc-123')
 *
 *   const handleBold = async () => {
 *     const selection = getSelection()
 *     await format(selection.start, selection.end, { bold: true })
 *   }
 *
 *   return (
 *     <div>
 *       {ranges.map((range, i) => (
 *         <span key={i} style={{
 *           fontWeight: range.attributes.bold ? 'bold' : 'normal',
 *           fontStyle: range.attributes.italic ? 'italic' : 'normal'
 *         }}>
 *           {range.text}
 *         </span>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useRichText(
  documentId: string,
  options: UseRichTextOptions = {}
): UseRichTextResult {
  const { autoInit = true } = options
  const synckit = useSyncKit()

  const [text, setText] = useState('')
  const [ranges, setRanges] = useState<import('../crdt/richtext').FormatRange[]>([])
  const [loading, setLoading] = useState(true)
  const richTextRef = useRef<import('../crdt/richtext').RichText | null>(null)

  // Initialize RichText instance
  useEffect(() => {
    let cancelled = false

    async function initRichText() {
      try {
        const rt = await (synckit as any).richText(documentId)

        if (autoInit) {
          await rt.init()
        }

        if (!cancelled) {
          richTextRef.current = rt
          setText(rt.get())
          setRanges(rt.getRanges())
          setLoading(false)
        }
      } catch (error) {
        console.error('Failed to initialize RichText:', error)
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    initRichText()

    return () => {
      cancelled = true
    }
  }, [synckit, documentId, autoInit])

  // Subscribe to text changes
  useEffect(() => {
    const richText = richTextRef.current
    if (!richText) return

    const unsubscribeText = richText.subscribe((newText: string) => {
      setText(newText)
    })

    const unsubscribeFormats = richText.subscribeFormats((newRanges: import('../crdt/richtext').FormatRange[]) => {
      setRanges(newRanges)
    })

    return () => {
      unsubscribeText()
      unsubscribeFormats()
    }
  }, [richTextRef.current])

  // Operations
  const insert = useCallback(async (position: number, insertText: string) => {
    if (!richTextRef.current) return
    await richTextRef.current.insert(position, insertText)
  }, [])

  const deleteText = useCallback(async (start: number, length: number) => {
    if (!richTextRef.current) return
    await richTextRef.current.delete(start, length)
  }, [])

  const format = useCallback(async (
    start: number,
    end: number,
    attributes: import('../crdt/peritext').FormatAttributes
  ) => {
    if (!richTextRef.current) return
    await richTextRef.current.format(start, end, attributes)
  }, [])

  const unformat = useCallback(async (
    start: number,
    end: number,
    attributes: import('../crdt/peritext').FormatAttributes
  ) => {
    if (!richTextRef.current) return
    await richTextRef.current.unformat(start, end, attributes)
  }, [])

  const getFormats = useCallback((position: number) => {
    if (!richTextRef.current) return {}
    return richTextRef.current.getFormats(position)
  }, [])

  const toDelta = useCallback(() => {
    if (!richTextRef.current) return { ops: [] }
    return richTextRef.current.toDelta()
  }, [])

  const fromDelta = useCallback(async (delta: import('../crdt/delta').Delta) => {
    if (!richTextRef.current) return
    await richTextRef.current.fromDelta(delta)
  }, [])

  return {
    text,
    ranges,
    insert,
    delete: deleteText,
    format,
    unformat,
    getFormats,
    toDelta,
    fromDelta,
    richText: richTextRef.current,
    loading
  }
}
