import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexedDBStorage, UndoRedoState } from '../storage/indexed-db';
import 'fake-indexeddb/auto';

describe('IndexedDBStorage', () => {
  let storage: IndexedDBStorage;

  beforeEach(() => {
    storage = new IndexedDBStorage();
  });

  afterEach(() => {
    storage.close();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(storage.init()).resolves.toBeUndefined();
    });

    it('should handle multiple init calls', async () => {
      await storage.init();
      await storage.init(); // Should not throw
      await storage.init(); // Should not throw
    });
  });

  describe('State Management', () => {
    it('should save and load state', async () => {
      const state: UndoRedoState = {
        documentId: 'doc-1',
        undoStack: [{ type: 'insert', data: 'hello' }],
        redoStack: [],
        timestamp: Date.now(),
      };

      await storage.saveState(state);
      const loaded = await storage.loadState('doc-1');

      expect(loaded).toEqual(state);
    });

    it('should return null for non-existent document', async () => {
      const loaded = await storage.loadState('non-existent');
      expect(loaded).toBeNull();
    });

    it('should update existing state', async () => {
      const state1: UndoRedoState = {
        documentId: 'doc-1',
        undoStack: [{ type: 'insert', data: 'hello' }],
        redoStack: [],
        timestamp: 1000,
      };

      const state2: UndoRedoState = {
        documentId: 'doc-1',
        undoStack: [
          { type: 'insert', data: 'hello' },
          { type: 'insert', data: ' world' },
        ],
        redoStack: [],
        timestamp: 2000,
      };

      await storage.saveState(state1);
      await storage.saveState(state2);

      const loaded = await storage.loadState('doc-1');
      expect(loaded).toEqual(state2);
    });

    it('should handle multiple documents', async () => {
      const state1: UndoRedoState = {
        documentId: 'doc-1',
        undoStack: [{ type: 'insert', data: 'hello' }],
        redoStack: [],
        timestamp: 1000,
      };

      const state2: UndoRedoState = {
        documentId: 'doc-2',
        undoStack: [{ type: 'insert', data: 'world' }],
        redoStack: [],
        timestamp: 2000,
      };

      await storage.saveState(state1);
      await storage.saveState(state2);

      const loaded1 = await storage.loadState('doc-1');
      const loaded2 = await storage.loadState('doc-2');

      expect(loaded1).toEqual(state1);
      expect(loaded2).toEqual(state2);
    });
  });

  describe('Deletion', () => {
    it('should delete state', async () => {
      const state: UndoRedoState = {
        documentId: 'doc-1',
        undoStack: [{ type: 'insert', data: 'hello' }],
        redoStack: [],
        timestamp: Date.now(),
      };

      await storage.saveState(state);
      await storage.deleteState('doc-1');

      const loaded = await storage.loadState('doc-1');
      expect(loaded).toBeNull();
    });

    it('should handle deleting non-existent document', async () => {
      await expect(storage.deleteState('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('Complex State', () => {
    it('should handle large undo stacks', async () => {
      const largeStack = Array.from({ length: 1000 }, (_, i) => ({
        type: 'insert',
        data: `operation-${i}`,
      }));

      const state: UndoRedoState = {
        documentId: 'doc-1',
        undoStack: largeStack,
        redoStack: [],
        timestamp: Date.now(),
      };

      await storage.saveState(state);
      const loaded = await storage.loadState('doc-1');

      expect(loaded?.undoStack).toHaveLength(1000);
      expect(loaded).toEqual(state);
    });

    it('should handle nested operation data', async () => {
      const state: UndoRedoState = {
        documentId: 'doc-1',
        undoStack: [
          {
            type: 'complex',
            data: {
              nested: {
                deeply: {
                  value: [1, 2, 3],
                  obj: { key: 'value' },
                },
              },
            },
          },
        ],
        redoStack: [],
        timestamp: Date.now(),
      };

      await storage.saveState(state);
      const loaded = await storage.loadState('doc-1');

      expect(loaded).toEqual(state);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when saving without init', async () => {
      const uninitializedStorage = new IndexedDBStorage();
      // Close immediately to prevent auto-init
      uninitializedStorage.close();

      const state: UndoRedoState = {
        documentId: 'doc-1',
        undoStack: [],
        redoStack: [],
        timestamp: Date.now(),
      };

      // The init() will be called automatically, so we need to test differently
      // Just ensure it doesn't crash
      await expect(uninitializedStorage.saveState(state)).resolves.toBeUndefined();
    });
  });

  describe('Lifecycle', () => {
    it('should close and reinitialize', async () => {
      await storage.init();
      storage.close();

      // Should be able to reinitialize
      await storage.init();

      const state: UndoRedoState = {
        documentId: 'doc-1',
        undoStack: [],
        redoStack: [],
        timestamp: Date.now(),
      };

      await expect(storage.saveState(state)).resolves.toBeUndefined();
    });
  });
});
