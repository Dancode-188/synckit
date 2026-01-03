import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OPFSStorage } from '../storage/opfs'
import type { StoredDocument } from '../types'

// Mock the File System Access API
const mockGetDirectory = vi.fn()
const mockRemoveEntry = vi.fn()

// Setup global navigator.storage mock
globalThis.navigator = {
  storage: {
    getDirectory: mockGetDirectory,
    estimate: vi.fn().mockResolvedValue({ usage: 1024, quota: 1024 * 1024 * 1024 }),
  },
} as any

describe('OPFSStorage', () => {
  let storage: OPFSStorage
  let mockDocsDir: any
  let mockMetaFile: any
  let mockDocFile: any

  beforeEach(() => {
    vi.clearAllMocks()
    storage = new OPFSStorage()

    // Mock metadata file
    mockMetaFile = {
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            version: 1,
            documentIds: [],
            lastModified: Date.now(),
          })
        ),
      }),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    }

    // Mock document file
    mockDocFile = {
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            id: 'test-doc',
            data: { hello: 'world' },
            version: { 'client-1': 1 },
            updatedAt: Date.now(),
          })
        ),
      }),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    }

    // Mock directory
    mockDocsDir = {
      getFileHandle: vi.fn().mockImplementation((_name: string, options: any) => {
        if (_name === '.metadata.json') {
          return Promise.resolve(mockMetaFile)
        }
        if (options?.create === false) {
          throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
        }
        return Promise.resolve(mockDocFile)
      }),
      removeEntry: mockRemoveEntry,
    }

    // Mock root directory
    const mockRoot = {
      getDirectoryHandle: vi.fn().mockResolvedValue(mockDocsDir),
    }

    mockGetDirectory.mockResolvedValue(mockRoot)
  })

  describe('Initialization', () => {
    it('should initialize successfully with OPFS support', async () => {
      await expect(storage.init()).resolves.toBeUndefined()
      expect(mockGetDirectory).toHaveBeenCalled()
    })

    it('should throw error if OPFS not available', async () => {
      const oldNavigator = globalThis.navigator
      globalThis.navigator = {} as any

      const noOPFSStorage = new OPFSStorage()
      await expect(noOPFSStorage.init()).rejects.toThrow('OPFS not available')

      globalThis.navigator = oldNavigator
    })

    it('should create metadata file if it does not exist', async () => {
      mockDocsDir.getFileHandle = vi.fn().mockImplementation((name: string) => {
        if (name === '.metadata.json') {
          // First call: file doesn't exist, second call: file created
          throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
        }
        return Promise.resolve(mockDocFile)
      })

      // Mock createWritable for metadata creation
      const writableMock = {
        write: vi.fn(),
        close: vi.fn(),
      }

      mockDocFile.createWritable = vi.fn().mockResolvedValue(writableMock)
      mockDocsDir.getFileHandle = vi.fn().mockImplementation((_name: string, options?: any) => {
        if (options?.create) {
          return Promise.resolve(mockDocFile)
        }
        throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
      })

      await storage.init()

      // Should have attempted to create metadata file
      expect(mockDocsDir.getFileHandle).toHaveBeenCalled()
    })
  })

  describe('Document Operations', () => {
    beforeEach(async () => {
      await storage.init()
    })

    it('should return null for non-existent document', async () => {
      mockDocsDir.getFileHandle = vi.fn().mockImplementation(() => {
        throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
      })

      const result = await storage.get('non-existent')
      expect(result).toBeNull()
    })

    it('should save and retrieve document', async () => {
      const doc: StoredDocument = {
        id: 'test-doc',
        data: { hello: 'world' },
        version: { 'client-1': 1 },
        updatedAt: Date.now(),
      }

      const writableMock = {
        write: vi.fn(),
        close: vi.fn(),
      }

      mockDocFile.createWritable = vi.fn().mockResolvedValue(writableMock)

      await storage.set('test-doc', doc)

      expect(mockDocsDir.getFileHandle).toHaveBeenCalledWith('test-doc.json', { create: true })
      expect(writableMock.write).toHaveBeenCalled()
      expect(writableMock.close).toHaveBeenCalled()
    })

    it('should delete document', async () => {
      await storage.delete('test-doc')

      expect(mockRemoveEntry).toHaveBeenCalledWith('test-doc.json')
    })

    it('should handle delete of non-existent document gracefully', async () => {
      mockRemoveEntry.mockRejectedValueOnce(
        Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
      )

      await expect(storage.delete('non-existent')).resolves.toBeUndefined()
    })

    it('should list all document IDs', async () => {
      const metadata = {
        version: 1,
        documentIds: ['doc-1', 'doc-2', 'doc-3'],
        lastModified: Date.now(),
      }

      mockMetaFile.getFile = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(metadata)),
      })

      // Re-initialize to load new metadata
      const newStorage = new OPFSStorage()
      await newStorage.init()

      const ids = await newStorage.list()
      expect(ids).toEqual(['doc-1', 'doc-2', 'doc-3'])
    })

    it('should clear all documents', async () => {
      const metadata = {
        version: 1,
        documentIds: ['doc-1', 'doc-2'],
        lastModified: Date.now(),
      }

      mockMetaFile.getFile = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(metadata)),
      })

      const newStorage = new OPFSStorage()
      await newStorage.init()

      const writableMock = {
        write: vi.fn(),
        close: vi.fn(),
      }
      mockDocFile.createWritable = vi.fn().mockResolvedValue(writableMock)

      await newStorage.clear()

      // Should have removed both documents
      expect(mockRemoveEntry).toHaveBeenCalledTimes(2)
      expect(mockRemoveEntry).toHaveBeenCalledWith('doc-1.json')
      expect(mockRemoveEntry).toHaveBeenCalledWith('doc-2.json')
    })
  })

  describe('Storage Statistics', () => {
    beforeEach(async () => {
      await storage.init()
    })

    it('should get storage stats', async () => {
      const stats = await storage.getStats()

      expect(stats).toHaveProperty('used')
      expect(stats).toHaveProperty('quota')
      expect(stats.used).toBe(1024)
      expect(stats.quota).toBe(1024 * 1024 * 1024)
    })

    it('should return zero stats if estimate API unavailable', async () => {
      const oldNavigator = globalThis.navigator
      globalThis.navigator = {
        storage: {
          getDirectory: mockGetDirectory,
        },
      } as any

      const stats = await storage.getStats()

      expect(stats.used).toBe(0)
      expect(stats.quota).toBe(0)

      globalThis.navigator = oldNavigator
    })
  })

  describe('Filename Sanitization', () => {
    it('should sanitize document IDs for filesystem use', async () => {
      await storage.init()

      const writableMock = {
        write: vi.fn(),
        close: vi.fn(),
      }
      mockDocFile.createWritable = vi.fn().mockResolvedValue(writableMock)

      const doc: StoredDocument = {
        id: 'test/doc:with*special?chars',
        data: {},
        version: {},
        updatedAt: Date.now(),
      }

      await storage.set('test/doc:with*special?chars', doc)

      // Should sanitize to only alphanumeric, dash, underscore
      expect(mockDocsDir.getFileHandle).toHaveBeenCalledWith('test_doc_with_special_chars.json', {
        create: true,
      })
    })
  })
})
