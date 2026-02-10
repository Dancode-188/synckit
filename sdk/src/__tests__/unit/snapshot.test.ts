/**
 * Snapshot functionality tests
 * Tests the snapshot(), loadFromSnapshot(), and getDocumentSize() methods
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SyncDocument } from '../../document'
import type { StorageAdapter, StoredDocument } from '../../types'

/**
 * Simple in-memory storage adapter for testing
 */
class MemoryStorage implements StorageAdapter {
  private store = new Map<string, StoredDocument>()

  async init(): Promise<void> {
    // No-op for memory storage
  }

  async get(id: string): Promise<StoredDocument | null> {
    return this.store.get(id) ?? null
  }

  async set(id: string, doc: StoredDocument): Promise<void> {
    this.store.set(id, doc)
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id)
  }

  async clear(): Promise<void> {
    this.store.clear()
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys())
  }

  // Helper for tests
  has(id: string): boolean {
    return this.store.has(id)
  }
}

describe('SyncDocument Snapshot', () => {
  let storage: MemoryStorage
  let doc: SyncDocument<{ title?: string; count?: number; tags?: string[]; description?: string }>

  beforeEach(async () => {
    storage = new MemoryStorage()
    doc = new SyncDocument('test-doc', 'client1', storage)
    await doc.init()
  })

  describe('snapshot()', () => {
    it('should create a snapshot with correct metadata', async () => {
      // Add some data to the document
      await doc.set('title', 'Test Document')
      await doc.set('count', 42)
      await doc.set('tags', ['test', 'snapshot'])

      // Create snapshot
      const metadata = await doc.snapshot()

      expect(metadata).toMatchObject({
        documentId: 'test-doc',
        version: expect.any(Object),
        timestamp: expect.any(Number),
        sizeBytes: expect.any(Number),
        compressed: false
      })

      // Verify size is positive
      expect(metadata.sizeBytes).toBeGreaterThan(0)

      // Verify version clock is set
      expect(Object.keys(metadata.version).length).toBeGreaterThan(0)
      expect(metadata.version['client1']).toBeGreaterThan(0)
    })

    it('should store snapshot with default key', async () => {
      await doc.set('title', 'Snapshot Test')
      await doc.snapshot()

      // Verify snapshot was stored with default key
      const stored = await storage.get('test-doc:snapshot')
      expect(stored).toBeDefined()
      expect(stored?.data).toMatchObject({
        title: 'Snapshot Test'
      })
    })

    it('should store snapshot with custom key', async () => {
      await doc.set('title', 'Custom Key Test')
      await doc.snapshot({ key: 'test-doc:backup' })

      // Verify snapshot was stored with custom key
      const stored = await storage.get('test-doc:backup')
      expect(stored).toBeDefined()
      expect(stored?.data).toMatchObject({
        title: 'Custom Key Test'
      })
    })

    it('should include all document data in snapshot', async () => {
      await doc.set('title', 'Complete Test')
      await doc.set('count', 100)
      await doc.set('tags', ['a', 'b', 'c'])

      await doc.snapshot()

      const stored = await storage.get('test-doc:snapshot')
      expect(stored?.data).toMatchObject({
        title: 'Complete Test',
        count: 100,
        tags: ['a', 'b', 'c']
      })
    })

    it('should include vector clock in snapshot', async () => {
      await doc.set('title', 'Vector Clock Test')
      const metadata = await doc.snapshot()

      expect(metadata.version).toBeDefined()
      expect(metadata.version['client1']).toBeDefined()
      const clockValue = metadata.version['client1']
      expect(clockValue).toBeDefined()
      if (clockValue !== undefined) {
        expect(clockValue).toBeGreaterThan(0)
      }
    })

    it('should throw error if document not initialized', async () => {
      const uninitDoc = new SyncDocument('uninit-doc', 'client1', storage)
      // Don't call init()

      await expect(uninitDoc.snapshot()).rejects.toThrow('Document not initialized')
    })

    it('should throw error if storage not available', async () => {
      const noStorageDoc = new SyncDocument('no-storage-doc', 'client1')
      await noStorageDoc.init()

      await expect(noStorageDoc.snapshot()).rejects.toThrow('Storage not available')
    })

    it('should calculate size correctly', async () => {
      await doc.set('title', 'Size Test')
      const metadata = await doc.snapshot()

      // Size should be reasonable (not zero, not gigantic)
      expect(metadata.sizeBytes).toBeGreaterThan(50) // At least some bytes
      expect(metadata.sizeBytes).toBeLessThan(10000)  // Not too large for this small doc
    })

    it('should update snapshot when called multiple times', async () => {
      // First snapshot
      await doc.set('title', 'Version 1')
      const snapshot1 = await doc.snapshot()

      // Update document
      await doc.set('title', 'Version 2')
      await doc.set('count', 999)

      // Second snapshot
      const snapshot2 = await doc.snapshot()

      // Verify stored snapshot was updated
      const stored = await storage.get('test-doc:snapshot')
      expect(stored?.data).toMatchObject({
        title: 'Version 2',
        count: 999
      })

      // Verify metadata changed
      expect(snapshot2.timestamp).toBeGreaterThanOrEqual(snapshot1.timestamp)

      const snapshot1Clock = snapshot1.version['client1']
      const snapshot2Clock = snapshot2.version['client1']
      expect(snapshot1Clock).toBeDefined()
      expect(snapshot2Clock).toBeDefined()

      if (snapshot1Clock !== undefined && snapshot2Clock !== undefined) {
        expect(snapshot2Clock).toBeGreaterThan(snapshot1Clock)
      }
    })
  })

  describe('loadFromSnapshot()', () => {
    it('should load document state from default snapshot', async () => {
      // Create initial state and snapshot
      await doc.set('title', 'Original Title')
      await doc.set('count', 42)
      await doc.snapshot()

      // Modify document
      await doc.set('title', 'Modified Title')
      await doc.set('count', 100)

      // Load from snapshot
      await doc.loadFromSnapshot()

      // Verify state was restored
      const data = doc.get()
      expect(data).toMatchObject({
        title: 'Original Title',
        count: 42
      })
    })

    it('should load from custom snapshot key', async () => {
      // Create snapshot with custom key
      await doc.set('title', 'Backup Title')
      await doc.snapshot({ key: 'test-doc:backup-2024' })

      // Modify document
      await doc.set('title', 'Current Title')

      // Load from custom snapshot
      await doc.loadFromSnapshot('test-doc:backup-2024')

      // Verify backup was restored
      const data = doc.get()
      expect(data.title).toBe('Backup Title')
    })

    it('should restore vector clock from snapshot', async () => {
      await doc.set('title', 'Clock Test')
      const snapshotMeta = await doc.snapshot()

      // Modify document (increments clock)
      await doc.set('title', 'Modified')

      // Load from snapshot
      await doc.loadFromSnapshot()

      // Vector clock should match snapshot
      const currentClock = doc.getVectorClock()
      const snapshotClockValue = snapshotMeta.version['client1']
      const currentClockValue = currentClock['client1']

      expect(snapshotClockValue).toBeDefined()
      expect(currentClockValue).toBeDefined()

      if (snapshotClockValue !== undefined && currentClockValue !== undefined) {
        expect(currentClockValue).toBeGreaterThanOrEqual(snapshotClockValue)
      }
    })

    it('should throw error if snapshot not found', async () => {
      await expect(
        doc.loadFromSnapshot('non-existent-snapshot')
      ).rejects.toThrow('Snapshot not found: non-existent-snapshot')
    })

    it('should throw error if document not initialized', async () => {
      const uninitDoc = new SyncDocument('uninit-doc', 'client1', storage)

      await expect(uninitDoc.loadFromSnapshot()).rejects.toThrow('Document not initialized')
    })

    it('should throw error if storage not available', async () => {
      const noStorageDoc = new SyncDocument('no-storage-doc', 'client1')
      await noStorageDoc.init()

      await expect(noStorageDoc.loadFromSnapshot()).rejects.toThrow('Storage not available')
    })

    it('should notify subscribers after loading snapshot', async () => {
      // Create snapshot
      await doc.set('title', 'Snapshot State')
      await doc.snapshot()

      // Track subscriber notifications
      let notificationCount = 0
      let lastData: any = null

      doc.subscribe((data) => {
        notificationCount++
        lastData = data
      })

      // Modify document
      await doc.set('title', 'Modified State')

      // Load from snapshot (should notify)
      await doc.loadFromSnapshot()

      // Verify subscribers were notified
      expect(notificationCount).toBeGreaterThan(1) // At least subscribe + loadFromSnapshot
      expect(lastData?.title).toBe('Snapshot State')
    })

    it('should handle empty document snapshots', async () => {
      // Create empty snapshot
      await doc.snapshot()

      // Add data
      await doc.set('title', 'New Data')
      expect(doc.get().title).toBe('New Data')

      // Load empty snapshot
      await doc.loadFromSnapshot()

      // Document should not have the added data
      const data = doc.get()
      expect(data.title).toBeUndefined()
      expect(doc.getFieldCount()).toBe(0)
    })
  })

  describe('getDocumentSize()', () => {
    it('should return size for empty document', () => {
      const size = doc.getDocumentSize()
      expect(size).toBeGreaterThan(0) // Even empty has some JSON overhead
    })

    it('should return larger size for document with data', async () => {
      const emptySize = doc.getDocumentSize()

      await doc.set('title', 'Test Document')
      await doc.set('count', 42)
      await doc.set('tags', ['a', 'b', 'c'])

      const fullSize = doc.getDocumentSize()
      expect(fullSize).toBeGreaterThan(emptySize)
    })

    it('should reflect size changes when data is added', async () => {
      const size1 = doc.getDocumentSize()

      await doc.set('title', 'Small')
      const size2 = doc.getDocumentSize()

      await doc.set('description', 'A'.repeat(1000)) // Add 1000 characters
      const size3 = doc.getDocumentSize()

      expect(size2).toBeGreaterThan(size1)
      expect(size3).toBeGreaterThan(size2)
    })

    it('should return positive number', async () => {
      await doc.set('title', 'Test')
      const size = doc.getDocumentSize()

      expect(typeof size).toBe('number')
      expect(size).toBeGreaterThan(0)
    })
  })

  describe('Snapshot Integration', () => {
    it('should support snapshot-modify-restore workflow', async () => {
      // 1. Create initial state
      await doc.set('title', 'Version 1')
      await doc.set('count', 1)

      // 2. Snapshot
      await doc.snapshot({ key: 'v1' })

      // 3. Make changes
      await doc.set('title', 'Version 2')
      await doc.set('count', 2)

      // 4. Snapshot again
      await doc.snapshot({ key: 'v2' })

      // 5. Make more changes
      await doc.set('title', 'Version 3')
      await doc.set('count', 3)

      // 6. Restore to v1
      await doc.loadFromSnapshot('v1')
      expect(doc.get()).toMatchObject({ title: 'Version 1', count: 1 })

      // 7. Restore to v2
      await doc.loadFromSnapshot('v2')
      expect(doc.get()).toMatchObject({ title: 'Version 2', count: 2 })
    })

    it('should handle rapid snapshots', async () => {
      // Create many snapshots quickly
      for (let i = 0; i < 10; i++) {
        await doc.set('count', i)
        await doc.snapshot({ key: `snap-${i}` })
      }

      // Load random snapshot
      await doc.loadFromSnapshot('snap-5')
      expect(doc.get().count).toBe(5)
    })

    it('should preserve data integrity across snapshot/restore cycles', async () => {
      const originalData = {
        title: 'Test',
        count: 42,
        tags: ['a', 'b', 'c']
      }

      // Set initial data
      await doc.set('title', originalData.title)
      await doc.set('count', originalData.count)
      await doc.set('tags', originalData.tags)

      // Snapshot
      await doc.snapshot()

      // Modify multiple times
      for (let i = 0; i < 5; i++) {
        await doc.set('count', i * 100)
        await doc.set('title', `Modified ${i}`)
      }

      // Restore
      await doc.loadFromSnapshot()

      // Verify data matches original
      const restored = doc.get()
      expect(restored).toMatchObject(originalData)
    })
  })
})
