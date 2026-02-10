/**
 * OPFS Storage Adapter
 * Origin Private File System - 2-4x faster than IndexedDB
 * Immune to Safari's 7-day eviction policy
 * @module storage/opfs
 */

import type { StorageAdapter, StoredDocument } from '../types'
import { StorageError } from '../types'

const DIRECTORY_NAME = 'synckit-docs'
const METADATA_FILE = '.metadata.json'

/**
 * Metadata structure for tracking documents
 */
interface StorageMetadata {
  version: number
  documentIds: string[]
  lastModified: number
}

/**
 * Message format for BroadcastChannel communication
 */
interface StorageMessage {
  type: 'set' | 'delete' | 'clear'
  docId?: string
  timestamp: number
  source: string
}

/**
 * Storage change listener callback
 */
type StorageChangeListener = (message: StorageMessage) => void

export class OPFSStorage implements StorageAdapter {
  private root: FileSystemDirectoryHandle | null = null
  private docsDir: FileSystemDirectoryHandle | null = null
  private metadata: StorageMetadata | null = null
  private channel: BroadcastChannel | null = null
  private channelId: string
  private changeListeners: Set<StorageChangeListener> = new Set()

  // Write queue to serialize OPFS operations and prevent "Failed to create swap file" errors.
  // Chrome's OPFS uses internal swap files during createWritable() - concurrent calls can conflict.
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly dirName: string = DIRECTORY_NAME) {
    // Generate unique ID for this instance to identify messages from this tab
    this.channelId = `opfs-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Queue a write operation to ensure serial execution.
   * Prevents concurrent createWritable() calls that can cause Chrome OPFS swap file conflicts.
   */
  private queueWrite<T>(operation: () => Promise<T>): Promise<T> {
    // Create a new promise that will resolve/reject with the operation result
    let resolveOp: (value: T) => void
    let rejectOp: (error: unknown) => void
    const resultPromise = new Promise<T>((resolve, reject) => {
      resolveOp = resolve
      rejectOp = reject
    })

    // Chain this operation onto the queue
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          const result = await operation()
          resolveOp(result)
        } catch (error) {
          rejectOp(error)
        }
      })
      .catch(() => {
        // Ensure queue continues even if previous operation failed
      })

    return resultPromise
  }

  async init(): Promise<void> {
    // Check for OPFS support
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      throw new StorageError('OPFS not available in this environment')
    }

    try {
      // Get the origin private file system root
      this.root = await navigator.storage.getDirectory()

      // Create or get our documents directory
      this.docsDir = await this.root.getDirectoryHandle(this.dirName, { create: true })

      // Load or initialize metadata
      await this.loadMetadata()

      // Set up BroadcastChannel for multi-tab synchronization
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel(`synckit-opfs-${this.dirName}`)
        this.channel.onmessage = (event) => {
          this.handleStorageMessage(event.data)
        }
      }
    } catch (error) {
      throw new StorageError(`Failed to initialize OPFS: ${error}`)
    }
  }

  /**
   * Load metadata from .metadata.json file
   */
  private async loadMetadata(): Promise<void> {
    if (!this.docsDir) {
      throw new StorageError('Storage not initialized')
    }

    try {
      const metaFileHandle = await this.docsDir.getFileHandle(METADATA_FILE, { create: false })
      const file = await metaFileHandle.getFile()
      const text = await file.text()
      this.metadata = JSON.parse(text)
    } catch (error) {
      // Metadata file doesn't exist, create new
      this.metadata = {
        version: 1,
        documentIds: [],
        lastModified: Date.now(),
      }
      await this.saveMetadata()
    }
  }

  /**
   * Save metadata to .metadata.json file
   * Uses write queue to prevent concurrent createWritable() conflicts
   */
  private async saveMetadata(): Promise<void> {
    if (!this.docsDir || !this.metadata) {
      throw new StorageError('Storage not initialized')
    }

    return this.queueWrite(async () => {
      try {
        this.metadata!.lastModified = Date.now()
        const metaFileHandle = await this.docsDir!.getFileHandle(METADATA_FILE, { create: true })
        const writable = await metaFileHandle.createWritable()
        await writable.write(JSON.stringify(this.metadata, null, 2))
        await writable.close()
      } catch (error) {
        throw new StorageError(`Failed to save metadata: ${error}`)
      }
    })
  }

  /**
   * Handle incoming storage messages from other tabs
   */
  private async handleStorageMessage(message: StorageMessage): Promise<void> {
    // Ignore messages from this tab
    if (message.source === this.channelId) {
      return
    }

    // Reload metadata when changes occur in other tabs
    try {
      await this.loadMetadata()
    } catch (error) {
      console.error('Failed to reload metadata after storage change:', error)
    }

    // Notify change listeners
    this.changeListeners.forEach(listener => {
      try {
        listener(message)
      } catch (error) {
        console.error('Error in storage change listener:', error)
      }
    })
  }

  /**
   * Broadcast a storage change to other tabs
   */
  private broadcast(type: 'set' | 'delete' | 'clear', docId?: string): void {
    if (!this.channel) {
      return
    }

    const message: StorageMessage = {
      type,
      docId,
      timestamp: Date.now(),
      source: this.channelId,
    }

    try {
      this.channel.postMessage(message)
    } catch (error) {
      console.error('Failed to broadcast storage change:', error)
    }
  }

  /**
   * Subscribe to storage changes from other tabs
   */
  onChange(listener: StorageChangeListener): () => void {
    this.changeListeners.add(listener)

    // Return unsubscribe function
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  /**
   * Get filename for a document ID
   */
  private getFileName(docId: string): string {
    // Sanitize docId for filesystem use
    return `${docId.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`
  }

  async get(docId: string): Promise<StoredDocument | null> {
    if (!this.docsDir) {
      throw new StorageError('Storage not initialized')
    }

    try {
      const fileName = this.getFileName(docId)
      const fileHandle = await this.docsDir.getFileHandle(fileName, { create: false })
      const file = await fileHandle.getFile()
      const text = await file.text()
      return JSON.parse(text)
    } catch (error) {
      // File doesn't exist
      if ((error as DOMException).name === 'NotFoundError') {
        return null
      }
      throw new StorageError(`Failed to get document: ${error}`)
    }
  }

  async set(docId: string, doc: StoredDocument): Promise<void> {
    if (!this.docsDir || !this.metadata) {
      throw new StorageError('Storage not initialized')
    }

    // Queue the document write to prevent concurrent createWritable() conflicts
    await this.queueWrite(async () => {
      try {
        const fileName = this.getFileName(docId)
        const fileHandle = await this.docsDir!.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(JSON.stringify(doc, null, 2))
        await writable.close()
      } catch (error) {
        throw new StorageError(`Failed to save document: ${error}`)
      }
    })

    // Update metadata if this is a new document (saveMetadata is also queued)
    if (!this.metadata.documentIds.includes(docId)) {
      this.metadata.documentIds.push(docId)
      await this.saveMetadata()
    }

    // Broadcast change to other tabs
    this.broadcast('set', docId)
  }

  async delete(docId: string): Promise<void> {
    if (!this.docsDir || !this.metadata) {
      throw new StorageError('Storage not initialized')
    }

    try {
      const fileName = this.getFileName(docId)
      await this.docsDir.removeEntry(fileName)

      // Update metadata
      this.metadata.documentIds = this.metadata.documentIds.filter(id => id !== docId)
      await this.saveMetadata()

      // Broadcast change to other tabs
      this.broadcast('delete', docId)
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as DOMException).name !== 'NotFoundError') {
        throw new StorageError(`Failed to delete document: ${error}`)
      }
    }
  }

  async list(): Promise<string[]> {
    if (!this.metadata) {
      throw new StorageError('Storage not initialized')
    }

    return [...this.metadata.documentIds]
  }

  async clear(): Promise<void> {
    if (!this.docsDir || !this.metadata) {
      throw new StorageError('Storage not initialized')
    }

    try {
      // Delete all document files
      for (const docId of this.metadata.documentIds) {
        const fileName = this.getFileName(docId)
        try {
          await this.docsDir.removeEntry(fileName)
        } catch (error) {
          // Ignore if file doesn't exist
          if ((error as DOMException).name !== 'NotFoundError') {
            throw error
          }
        }
      }

      // Reset metadata
      this.metadata.documentIds = []
      await this.saveMetadata()

      // Broadcast change to other tabs
      this.broadcast('clear')
    } catch (error) {
      throw new StorageError(`Failed to clear storage: ${error}`)
    }
  }

  /**
   * Get storage statistics (OPFS-specific feature)
   */
  async getStats(): Promise<{ used: number; quota: number }> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return { used: 0, quota: 0 }
    }

    try {
      const estimate = await navigator.storage.estimate()
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
      }
    } catch (error) {
      throw new StorageError(`Failed to get storage stats: ${error}`)
    }
  }

  /**
   * Close the BroadcastChannel and cleanup listeners
   */
  close(): void {
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }
    this.changeListeners.clear()
  }
}
