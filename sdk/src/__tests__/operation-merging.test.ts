import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UndoManager, Operation } from '../undo/undo-manager';
import { CrossTabSync } from '../sync/cross-tab';
import {
  installMockBroadcastChannel,
  resetMockBroadcastChannel,
  restoreBroadcastChannel,
} from './mocks/broadcast-channel';
import 'fake-indexeddb/auto';

describe('Operation Merging', () => {
  let undoManager: UndoManager;
  let crossTabSync: CrossTabSync;
  let originalBroadcastChannel: any;
  let testCounter = 0;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
    });
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    originalBroadcastChannel = (global as any).BroadcastChannel;
    installMockBroadcastChannel();
  });

  afterEach(() => {
    vi.useRealTimers();

    if (undoManager) {
      undoManager.destroy();
    }
    if (crossTabSync) {
      crossTabSync.destroy();
    }

    resetMockBroadcastChannel();
    restoreBroadcastChannel(originalBroadcastChannel);
  });

  function createTab(docId: string, options?: any): CrossTabSync {
    const tab = new CrossTabSync(docId, options);
    vi.advanceTimersByTime(1);
    return tab;
  }

  async function createManager(options?: Partial<any>) {
    const docId = `doc-merge-${testCounter++}`;
    crossTabSync = createTab(docId, { enabled: false });
    crossTabSync.enable();
    await vi.advanceTimersByTimeAsync(200);

    undoManager = new UndoManager({
      documentId: docId,
      crossTabSync,
      ...options,
    });
    await undoManager.init();
  }

  describe('Default Merge Strategy', () => {
    it('should merge operations of the same type within time window', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'a' });
      vi.advanceTimersByTime(500); // Within 1000ms window
      undoManager.add({ type: 'insert', data: 'b' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data).toBe('ab');
    });

    it('should not merge operations of different types', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'a' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'delete', data: 'b' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(2);
    });

    it('should not merge operations outside time window', async () => {
      await createManager({ mergeWindow: 1000 });

      undoManager.add({ type: 'insert', data: 'a' });
      vi.advanceTimersByTime(1100); // Beyond 1000ms window
      undoManager.add({ type: 'insert', data: 'b' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(2);
    });

    it('should not merge operations from different users', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'a', userId: 'user1' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'b', userId: 'user2' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(2);
    });

    it('should merge operations from the same user', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'a', userId: 'user1' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'b', userId: 'user1' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data).toBe('ab');
      expect(state.undoStack[0]!.userId).toBe('user1');
    });

    it('should use custom merge window from operation', async () => {
      await createManager({ mergeWindow: 1000 });

      undoManager.add({ type: 'insert', data: 'a', mergeWindow: 2000 });
      vi.advanceTimersByTime(1500); // Within 2000ms custom window
      undoManager.add({ type: 'insert', data: 'b' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data).toBe('ab');
    });
  });

  describe('Data Type Merging', () => {
    it('should concatenate string data', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'hello' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: ' world' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data).toBe('hello world');
    });

    it('should sum number data', async () => {
      await createManager();

      undoManager.add({ type: 'increment', data: 5 });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'increment', data: 3 });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data).toBe(8);
    });

    it('should concatenate array data', async () => {
      await createManager();

      undoManager.add({ type: 'batch', data: ['a', 'b'] });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'batch', data: ['c', 'd'] });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data).toEqual(['a', 'b', 'c', 'd']);
    });

    it('should replace object data with latest', async () => {
      await createManager();

      undoManager.add({ type: 'update', data: { x: 1 } });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'update', data: { y: 2 } });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data).toEqual({ y: 2 });
    });
  });

  describe('Metadata Preservation', () => {
    it('should preserve original timestamp when merging', async () => {
      await createManager();

      const firstTimestamp = Date.now();
      undoManager.add({ type: 'insert', data: 'a' });

      vi.advanceTimersByTime(500);
      undoManager.add({ type: 'insert', data: 'b' });

      const state = undoManager.getState();
      expect(state.undoStack[0]!.timestamp).toBe(firstTimestamp);
    });

    it('should preserve userId when merging', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'a', userId: 'alice' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'b', userId: 'alice' });

      const state = undoManager.getState();
      expect(state.undoStack[0]!.userId).toBe('alice');
    });

    it('should preserve merge window when merging', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'a', mergeWindow: 5000 });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'b' });

      const state = undoManager.getState();
      expect(state.undoStack[0]!.mergeWindow).toBe(5000);
    });
  });

  describe('Custom Merge Strategies', () => {
    it('should use custom canMerge function', async () => {
      const canMerge = (prev: Operation, next: Operation) => {
        // Only merge if both have 'mergeable' flag
        return prev.data?.mergeable === true && next.data?.mergeable === true;
      };

      await createManager({ canMerge });

      undoManager.add({ type: 'op', data: { mergeable: true, value: 'a' } });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'op', data: { mergeable: false, value: 'b' } });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(2); // Not merged
    });

    it('should use custom merge function', async () => {
      const merge = (prev: Operation, next: Operation) => {
        return {
          type: prev.type,
          data: { count: (prev.data?.count ?? 0) + (next.data?.count ?? 0) },
          timestamp: prev.timestamp,
          userId: prev.userId,
        };
      };

      await createManager({ merge });

      undoManager.add({ type: 'count', data: { count: 5 } });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'count', data: { count: 3 } });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data.count).toBe(8);
    });
  });

  describe('Merge with Undo/Redo', () => {
    it('should clear redo stack when merging', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'a' });
      undoManager.add({ type: 'insert', data: 'b' });
      undoManager.undo();

      // This should merge with 'a' and clear redo
      undoManager.add({ type: 'insert', data: 'c' });

      const state = undoManager.getState();
      expect(state.redoStack).toHaveLength(0);
    });

    it('should undo merged operations as a single unit', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'h' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'e' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'l' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'lo' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data).toBe('hello');

      // Undo should remove the entire merged operation
      undoManager.undo();

      const afterUndo = undoManager.getState();
      expect(afterUndo.undoStack).toHaveLength(0);
      expect(afterUndo.redoStack).toHaveLength(1);
      expect(afterUndo.redoStack[0]!.data).toBe('hello');
    });
  });

  describe('Multiple Consecutive Merges', () => {
    it('should merge multiple operations in sequence', async () => {
      await createManager();

      undoManager.add({ type: 'insert', data: 'a' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'b' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'c' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'd' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.data).toBe('abcd');
    });

    it('should create separate groups when merge conditions break', async () => {
      await createManager();

      // Group 1
      undoManager.add({ type: 'insert', data: 'a' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'b' });

      // Different type - new group
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'delete', data: 'x' });

      // Back to insert - new group
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'c' });
      vi.advanceTimersByTime(100);
      undoManager.add({ type: 'insert', data: 'd' });

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(3);
      expect(state.undoStack[0]!.data).toBe('ab');
      expect(state.undoStack[1]!.data).toBe('x');
      expect(state.undoStack[2]!.data).toBe('cd');
    });
  });
});
