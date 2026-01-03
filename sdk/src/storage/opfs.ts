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

export class OPFSStorage implements StorageAdapter {
  private root: FileSystemDirectoryHandle | null = null
  private docsDir: FileSystemDirectoryHandle | null = null
  private metadata: StorageMetadata | null = null

  constructor(private readonly dirName: string = DIRECTORY_NAME) {}

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
   */
  private async saveMetadata(): Promise<void> {
    if (!this.docsDir || !this.metadata) {
      throw new StorageError('Storage not initialized')
    }

    try {
      this.metadata.lastModified = Date.now()
      const metaFileHandle = await this.docsDir.getFileHandle(METADATA_FILE, { create: true })
      const writable = await metaFileHandle.createWritable()
      await writable.write(JSON.stringify(this.metadata, null, 2))
      await writable.close()
    } catch (error) {
      throw new StorageError(`Failed to save metadata: ${error}`)
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

    try {
      const fileName = this.getFileName(docId)
      const fileHandle = await this.docsDir.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(JSON.stringify(doc, null, 2))
      await writable.close()

      // Update metadata if this is a new document
      if (!this.metadata.documentIds.includes(docId)) {
        this.metadata.documentIds.push(docId)
        await this.saveMetadata()
      }
    } catch (error) {
      throw new StorageError(`Failed to save document: ${error}`)
    }
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
}
