/**
 * IndexedDB Quota Handling Tests
 *
 * Verifies that the IndexedDB storage layer can gracefully handle
 * quota exceeded errors with a 3-tier fallback strategy:
 * 1. Compression
 * 2. Truncation
 * 3. Clear old data
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IndexedDBStorage, type UndoRedoState } from '../../storage/indexed-db'
import 'fake-indexeddb/auto'

describe('IndexedDB Quota Handling', () => {
  let storage: IndexedDBStorage

  beforeEach(async () => {
    storage = new IndexedDBStorage()
    await storage.init()
  })

  afterEach(() => {
    storage.close()
  })

  it('saves state normally when quota is not exceeded', async () => {
    const state: UndoRedoState = {
      documentId: 'test-doc',
      undoStack: [{ type: 'insert', data: 'test' }],
      redoStack: [],
      timestamp: Date.now(),
    }

    await expect(storage.saveState(state)).resolves.not.toThrow()

    const loaded = await storage.loadState('test-doc')
    expect(loaded).toEqual(state)
  })

  it('handles quota exceeded with compression fallback', async () => {
    const state: UndoRedoState = {
      documentId: 'test-doc-compressed',
      undoStack: Array(100).fill({ type: 'test', data: 'x'.repeat(100) }),
      redoStack: [],
      timestamp: Date.now(),
    }

    // Mock putState to fail once (simulating quota error), then succeed with compressed data
    const originalPutState = (storage as any).putState.bind(storage)
    const putStateSpy = vi.spyOn(storage as any, 'putState')
    let callCount = 0

    putStateSpy.mockImplementation(async (data: any) => {
      callCount++
      if (callCount === 1 && !data.isCompressed) {
        // First call (uncompressed) fails with quota error
        const error = new Error('QuotaExceededError')
        error.name = 'QuotaExceededError'
        throw error
      }
      // Second call (compressed) or any other call succeeds
      return originalPutState(data)
    })

    await expect(storage.saveState(state)).resolves.not.toThrow()

    // Should have been called twice (normal + compressed)
    expect(putStateSpy).toHaveBeenCalledTimes(2)

    // Verify we can load the compressed data
    const loaded = await storage.loadState('test-doc-compressed')
    expect(loaded).toEqual(state)

    putStateSpy.mockRestore()
  })

  it('truncates undo/redo stacks when compression fails', async () => {
    const largeUndoStack = Array(1000).fill(null).map((_, i) => ({
      type: 'test',
      data: i,
    }))

    const state: UndoRedoState = {
      documentId: 'test-doc-truncated',
      undoStack: largeUndoStack,
      redoStack: Array(500).fill({ type: 'redo', data: 'test' }),
      timestamp: Date.now(),
    }

    // Mock: normal and compressed both fail, truncated succeeds
    const originalPutState = (storage as any).putState.bind(storage)
    const putStateSpy = vi.spyOn(storage as any, 'putState')
    let callCount = 0

    putStateSpy.mockImplementation(async (data: any) => {
      callCount++
      // Fail for non-truncated data (first two attempts)
      if (callCount <= 2 && (data.undoStack?.length > 50 || data.isCompressed)) {
        const error = new Error('QuotaExceededError')
        error.name = 'QuotaExceededError'
        throw error
      }
      // Third call (truncated) succeeds
      return originalPutState(data)
    })

    await storage.saveState(state)

    // Should have been called 3 times (normal + compressed + truncated)
    expect(putStateSpy).toHaveBeenCalledTimes(3)

    // Verify truncation happened
    const loaded = await storage.loadState('test-doc-truncated')
    expect(loaded).toBeDefined()
    expect(loaded!.undoStack.length).toBe(50)
    expect(loaded!.redoStack.length).toBe(50)

    putStateSpy.mockRestore()
  })

  it('clears old data when truncation still fails', async () => {
    // Create multiple old documents first
    for (let i = 0; i < 15; i++) {
      await storage.saveState({
        documentId: `old-doc-${i}`,
        undoStack: [],
        redoStack: [],
        timestamp: Date.now() - i * 1000,
      })
    }

    const state: UndoRedoState = {
      documentId: 'test-doc-final',
      undoStack: Array(100).fill({ type: 'test' }),
      redoStack: [],
      timestamp: Date.now(),
    }

    // Mock: normal, compressed, and truncated all fail, final retry succeeds
    const originalPutState = (storage as any).putState.bind(storage)
    const putStateSpy = vi.spyOn(storage as any, 'putState')
    const clearOldDataSpy = vi.spyOn(storage as any, 'clearOldData')
    let callCount = 0

    putStateSpy.mockImplementation(async (data: any) => {
      callCount++
      if (data.documentId === 'test-doc-final' && callCount <= 3) {
        // First 3 calls for our test doc fail
        const error = new Error('QuotaExceededError')
        error.name = 'QuotaExceededError'
        throw error
      }
      // Fourth call (after clearing) succeeds
      return originalPutState(data)
    })

    await storage.saveState(state)

    // Should have called clearOldData
    expect(clearOldDataSpy).toHaveBeenCalled()

    clearOldDataSpy.mockRestore()
    putStateSpy.mockRestore()
  })

  it('compresses and decompresses data correctly', async () => {
    const state: UndoRedoState = {
      documentId: 'test-compression',
      undoStack: [
        { type: 'insert', text: 'Hello World'.repeat(100), position: 0 },
        { type: 'delete', length: 10, position: 5 },
      ],
      redoStack: [{ type: 'insert', text: 'Test', position: 0 }],
      timestamp: Date.now(),
    }

    // Force compression by mocking first attempt to fail
    const originalPutState = (storage as any).putState.bind(storage)
    const putStateSpy = vi.spyOn(storage as any, 'putState')
    let callCount = 0

    putStateSpy.mockImplementation(async (data: any) => {
      callCount++
      if (callCount === 1) {
        const error = new Error('QuotaExceededError')
        error.name = 'QuotaExceededError'
        throw error
      }
      return originalPutState(data)
    })

    await storage.saveState(state)

    // Load and verify data is correctly decompressed
    const loaded = await storage.loadState('test-compression')
    expect(loaded).toEqual(state)

    putStateSpy.mockRestore()
  })

  it('preserves most recent undo/redo operations when truncating', async () => {
    const state: UndoRedoState = {
      documentId: 'test-truncate-order',
      undoStack: Array(100).fill(null).map((_, i) => ({ op: i })),
      redoStack: [],
      timestamp: Date.now(),
    }

    // Force truncation
    const originalPutState = (storage as any).putState.bind(storage)
    const putStateSpy = vi.spyOn(storage as any, 'putState')
    let callCount = 0

    putStateSpy.mockImplementation(async (data: any) => {
      callCount++
      if (callCount <= 2 && (data.undoStack?.length > 50 || data.isCompressed)) {
        const error = new Error('QuotaExceededError')
        error.name = 'QuotaExceededError'
        throw error
      }
      return originalPutState(data)
    })

    await storage.saveState(state)

    const loaded = await storage.loadState('test-truncate-order')
    expect(loaded).toBeDefined()
    expect(loaded!.undoStack.length).toBe(50)
    // Should keep the LAST 50 operations (operations 50-99)
    expect(loaded!.undoStack[0]).toEqual({ op: 50 })
    expect(loaded!.undoStack[49]).toEqual({ op: 99 })

    putStateSpy.mockRestore()
  })
})
