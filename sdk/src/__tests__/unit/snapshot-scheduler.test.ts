/**
 * Tests for automatic snapshot scheduling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SyncDocument } from '../../document'
import type { StorageAdapter, StoredDocument } from '../../types'

// Simple in-memory storage implementation for testing
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

  async list(): Promise<string[]> {
    return Array.from(this.store.keys())
  }

  async clear(): Promise<void> {
    this.store.clear()
  }
}

// Helper to wait for a specific time
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Automatic Snapshot Scheduling', () => {
  let storage: MemoryStorage
  let doc: SyncDocument<{ count?: number; data?: string }>

  beforeEach(async () => {
    storage = new MemoryStorage()
    doc = new SyncDocument('test-doc', 'client1', storage)
    await doc.init()
  })

  afterEach(() => {
    doc.dispose()
  })

  describe('enableAutoSnapshot()', () => {
    it('should enable automatic snapshots with default config', () => {
      doc.enableAutoSnapshot()
      const stats = doc.getAutoSnapshotStats()

      expect(stats).toBeDefined()
      expect(stats?.isRunning).toBe(true)
    })

    it('should enable automatic snapshots with custom config', () => {
      doc.enableAutoSnapshot({
        sizeThresholdBytes: 1024,
        timeIntervalMs: 5000,
        operationCount: 100,
        maxSnapshots: 3,
      })

      const stats = doc.getAutoSnapshotStats()
      expect(stats).toBeDefined()
      expect(stats?.isRunning).toBe(true)
    })

    it('should throw error if storage not available', async () => {
      const docWithoutStorage = new SyncDocument('test', 'client1')
      await docWithoutStorage.init()

      expect(() => {
        docWithoutStorage.enableAutoSnapshot()
      }).toThrow('Storage not available for automatic snapshots')

      docWithoutStorage.dispose()
    })
  })

  describe('disableAutoSnapshot()', () => {
    it('should disable automatic snapshots', () => {
      doc.enableAutoSnapshot()
      expect(doc.getAutoSnapshotStats()?.isRunning).toBe(true)

      doc.disableAutoSnapshot()
      expect(doc.getAutoSnapshotStats()).toBeNull()
    })

    it('should be safe to call even if not enabled', () => {
      expect(() => {
        doc.disableAutoSnapshot()
      }).not.toThrow()
    })
  })

  describe('Operation count trigger', () => {
    it('should create snapshot after specified operation count', async () => {
      doc.enableAutoSnapshot({
        operationCount: 3,
        timeIntervalMs: 0, // Disable time trigger
        sizeThresholdBytes: 0, // Disable size trigger
      })

      // Perform 3 operations
      await doc.set('count', 1)
      await doc.set('count', 2)
      await doc.set('count', 3)

      // Wait for async snapshot creation
      await wait(100)

      // Check that a snapshot was created
      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeGreaterThan(0)

      // Stats should show reset operation count
      const stats = doc.getAutoSnapshotStats()
      expect(stats?.operationsSinceLastSnapshot).toBe(0)
    })

    it('should handle update() operations correctly', async () => {
      doc.enableAutoSnapshot({
        operationCount: 2,
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      // update() with 2 fields = 2 operations
      await doc.update({ count: 1, data: 'test' })

      // Wait for async snapshot creation
      await wait(100)

      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeGreaterThan(0)
    })

    it('should handle delete() operations correctly', async () => {
      doc.enableAutoSnapshot({
        operationCount: 2,
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      await doc.set('count', 1)
      await doc.delete('count')

      // Wait for async snapshot creation
      await wait(100)

      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeGreaterThan(0)
    })
  })

  describe('Time interval trigger', () => {
    it('should create snapshot after time interval', async () => {
      // Use a short interval for testing
      doc.enableAutoSnapshot({
        timeIntervalMs: 200, // 200ms
        operationCount: 0, // Disable operation trigger
        sizeThresholdBytes: 0, // Disable size trigger
      })

      // Do at least one operation so there's data
      await doc.set('count', 1)

      // Wait for time interval to trigger
      await wait(300)

      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeGreaterThan(0)
    }, 10000) // Increase test timeout
  })

  describe('Snapshot cleanup', () => {
    it('should keep only maxSnapshots most recent snapshots', async () => {
      doc.enableAutoSnapshot({
        operationCount: 1,
        maxSnapshots: 3,
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      // Create 5 snapshots (more than maxSnapshots)
      for (let i = 0; i < 5; i++) {
        await doc.set('count', i)
        await wait(50) // Small delay to ensure different timestamps
      }

      // Wait for cleanup
      await wait(100)

      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeLessThanOrEqual(3)
    })

    it('should keep newest snapshots and delete oldest', async () => {
      doc.enableAutoSnapshot({
        operationCount: 1,
        maxSnapshots: 2,
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      // Create 3 snapshots
      await doc.set('count', 1)
      await wait(50)
      await doc.set('count', 2)
      await wait(50)
      await doc.set('count', 3)
      await wait(100)

      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeLessThanOrEqual(2)

      // Snapshots should be sorted newest first
      // So the first snapshot should be the most recent
      expect(snapshots[0]).toBeDefined()
      const latestSnapshot = await storage.get(snapshots[0]!)
      expect(latestSnapshot?.data.count).toBe(3)
    })
  })

  describe('triggerAutoSnapshot()', () => {
    it('should manually trigger a snapshot', async () => {
      doc.enableAutoSnapshot({
        operationCount: 0, // Disable automatic triggers
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      await doc.set('count', 42)

      const metadata = await doc.triggerAutoSnapshot()
      expect(metadata).toBeDefined()
      expect(metadata?.documentId).toBe('test-doc')
      expect(metadata?.sizeBytes).toBeGreaterThan(0)
    })

    it('should throw if auto snapshots not enabled', async () => {
      await expect(doc.triggerAutoSnapshot()).rejects.toThrow(
        'Automatic snapshots not enabled'
      )
    })
  })

  describe('listAutoSnapshots()', () => {
    it('should return empty array if no snapshots', async () => {
      doc.enableAutoSnapshot()
      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots).toEqual([])
    })

    it('should return snapshots sorted by timestamp (newest first)', async () => {
      doc.enableAutoSnapshot({
        operationCount: 1,
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      await doc.set('count', 1)
      await wait(50)
      await doc.set('count', 2)
      await wait(50)
      await doc.set('count', 3)
      await wait(100)

      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeGreaterThan(0)

      // Verify they're sorted newest first by checking timestamps
      for (let i = 0; i < snapshots.length - 1; i++) {
        const timestampA = parseInt(snapshots[i]!.split(':')[2] || '0', 10)
        const timestampB = parseInt(snapshots[i + 1]!.split(':')[2] || '0', 10)
        expect(timestampA).toBeGreaterThanOrEqual(timestampB)
      }
    })
  })

  describe('getAutoSnapshotStats()', () => {
    it('should return null if auto snapshots not enabled', () => {
      expect(doc.getAutoSnapshotStats()).toBeNull()
    })

    it('should return stats when enabled', () => {
      doc.enableAutoSnapshot()
      const stats = doc.getAutoSnapshotStats()

      expect(stats).toBeDefined()
      expect(stats?.isRunning).toBe(true)
      expect(stats?.operationsSinceLastSnapshot).toBe(0)
      expect(stats?.snapshotInProgress).toBe(false)
      expect(stats?.lastSnapshotTime).toBeGreaterThan(0)
      expect(stats?.timeSinceLastSnapshot).toBeGreaterThanOrEqual(0)
    })

    it('should track operations correctly', async () => {
      doc.enableAutoSnapshot({
        operationCount: 100, // High threshold to prevent auto-snapshot
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      await doc.set('count', 1)
      await doc.set('count', 2)

      const stats = doc.getAutoSnapshotStats()
      expect(stats?.operationsSinceLastSnapshot).toBe(2)
    })
  })

  describe('updateAutoSnapshotConfig()', () => {
    it('should update configuration', async () => {
      doc.enableAutoSnapshot({
        operationCount: 100,
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      // Change operation count to 1
      doc.updateAutoSnapshotConfig({
        operationCount: 1,
      })

      // Now one operation should trigger a snapshot
      await doc.set('count', 1)
      await wait(100)

      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeGreaterThan(0)
    })

    it('should throw if auto snapshots not enabled', () => {
      expect(() => {
        doc.updateAutoSnapshotConfig({ operationCount: 50 })
      }).toThrow('Automatic snapshots not enabled')
    })
  })

  describe('dispose()', () => {
    it('should stop snapshot scheduler on dispose', () => {
      doc.enableAutoSnapshot()
      expect(doc.getAutoSnapshotStats()?.isRunning).toBe(true)

      doc.dispose()
      expect(doc.getAutoSnapshotStats()).toBeNull()
    })
  })

  describe('Integration with existing snapshots', () => {
    it('should not interfere with manual snapshots', async () => {
      doc.enableAutoSnapshot({
        operationCount: 100, // High threshold
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      await doc.set('count', 42)

      // Create manual snapshot with different key
      const manualSnapshot = await doc.snapshot({ key: 'manual-snapshot' })
      expect(manualSnapshot.documentId).toBe('test-doc')

      // Auto snapshots should still work
      const autoSnapshot = await doc.triggerAutoSnapshot()
      expect(autoSnapshot).toBeDefined()

      // Both snapshots should exist
      const allKeys = await storage.list()
      expect(allKeys).toContain('manual-snapshot')

      const autoSnapshots = await doc.listAutoSnapshots()
      expect(autoSnapshots.length).toBeGreaterThan(0)
    })

    it('should be able to load from auto snapshot', async () => {
      doc.enableAutoSnapshot({
        operationCount: 1,
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      await doc.set('count', 100)
      await wait(100)

      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeGreaterThan(0)

      // Modify document
      await doc.set('count', 999)
      expect(doc.get().count).toBe(999)

      // Load from snapshot
      await doc.loadFromSnapshot(snapshots[0])
      expect(doc.get().count).toBe(100)
    })
  })

  describe('Non-blocking behavior', () => {
    it('should not block operations while snapshot in progress', async () => {
      doc.enableAutoSnapshot({
        operationCount: 1,
        timeIntervalMs: 0,
        sizeThresholdBytes: 0,
      })

      // Perform rapid operations
      await doc.set('count', 1)
      await doc.set('count', 2)
      await doc.set('count', 3)

      // All operations should complete immediately
      expect(doc.get().count).toBe(3)

      // Snapshot should happen in background
      await wait(100)
      const snapshots = await doc.listAutoSnapshots()
      expect(snapshots.length).toBeGreaterThan(0)
    })
  })
})
