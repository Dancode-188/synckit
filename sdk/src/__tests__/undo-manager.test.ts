import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UndoManager, Operation } from '../undo/undo-manager';
import { CrossTabSync } from '../sync/cross-tab';
import {
  installMockBroadcastChannel,
  resetMockBroadcastChannel,
  restoreBroadcastChannel,
} from './mocks/broadcast-channel';
import 'fake-indexeddb/auto';

describe('UndoManager', () => {
  let undoManager: UndoManager;
  let crossTabSync: CrossTabSync;
  let originalBroadcastChannel: any;

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

  describe('Initialization', () => {
    it('should initialize with empty stacks', async () => {
      crossTabSync = createTab('doc-1', { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      undoManager = new UndoManager({
        documentId: 'doc-1',
        crossTabSync,
      });
      await undoManager.init();

      const state = undoManager.getState();
      expect(state.undoStack).toEqual([]);
      expect(state.redoStack).toEqual([]);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(false);
    });

    it('should load existing state from storage', async () => {
      // Create first manager and add operations
      crossTabSync = createTab('doc-load-test', { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      const manager1 = new UndoManager({
        documentId: 'doc-load-test',
        crossTabSync,
        mergeWindow: 0, // Disable merging for this test
      });
      await manager1.init();

      manager1.add({ type: 'insert', data: 'hello' });
      manager1.add({ type: 'insert', data: 'world' });

      // Wait for async saves to complete
      await vi.advanceTimersByTimeAsync(100);

      manager1.destroy();
      crossTabSync.destroy();

      // Create new manager and verify it loads the state
      crossTabSync = createTab('doc-load-test', { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      undoManager = new UndoManager({
        documentId: 'doc-load-test',
        crossTabSync,
      });
      await undoManager.init();

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(2);
      expect(state.undoStack[0]!.data).toBe('hello');
      expect(state.undoStack[1]!.data).toBe('world');
    });
  });

  describe('Adding Operations', () => {
    let testCounter = 0;

    beforeEach(async () => {
      const docId = `doc-add-${testCounter++}`;
      crossTabSync = createTab(docId, { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      undoManager = new UndoManager({
        documentId: docId,
        crossTabSync,
        mergeWindow: 0, // Disable merging for these tests
      });
      await undoManager.init();
    });

    it('should add operation to undo stack', () => {
      const operation: Operation = { type: 'insert', data: 'test' };
      undoManager.add(operation);

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]!.type).toBe('insert');
      expect(state.undoStack[0]!.data).toBe('test');
    });

    it('should add timestamp to operation if not provided', () => {
      const operation: Operation = { type: 'insert', data: 'test' };
      undoManager.add(operation);

      const state = undoManager.getState();
      expect(state.undoStack[0]!.timestamp).toBeDefined();
      expect(typeof state.undoStack[0]!.timestamp).toBe('number');
    });

    it('should preserve timestamp if provided', () => {
      const timestamp = Date.now() - 1000;
      const operation: Operation = { type: 'insert', data: 'test', timestamp };
      undoManager.add(operation);

      const state = undoManager.getState();
      expect(state.undoStack[0]!.timestamp).toBe(timestamp);
    });

    it('should clear redo stack when adding new operation', () => {
      undoManager.add({ type: 'insert', data: 'first' });
      undoManager.add({ type: 'insert', data: 'second' });
      undoManager.undo();

      expect(undoManager.canRedo()).toBe(true);

      undoManager.add({ type: 'insert', data: 'third' });

      expect(undoManager.canRedo()).toBe(false);
      const state = undoManager.getState();
      expect(state.redoStack).toEqual([]);
    });

    it('should enforce max undo size', async () => {
      const smallManager = new UndoManager({
        documentId: 'doc-small',
        crossTabSync,
        maxUndoSize: 3,
        mergeWindow: 0, // Disable merging for this test
      });
      await smallManager.init();

      smallManager.add({ type: 'op', data: '1' });
      smallManager.add({ type: 'op', data: '2' });
      smallManager.add({ type: 'op', data: '3' });
      smallManager.add({ type: 'op', data: '4' });

      const state = smallManager.getState();
      expect(state.undoStack).toHaveLength(3);
      expect(state.undoStack[0]!.data).toBe('2');
      expect(state.undoStack[2]!.data).toBe('4');

      smallManager.destroy();
    });
  });

  describe('Undo', () => {
    let testCounter = 0;

    beforeEach(async () => {
      const docId = `doc-undo-${testCounter++}`;
      crossTabSync = createTab(docId, { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      undoManager = new UndoManager({
        documentId: docId,
        crossTabSync,
        mergeWindow: 0, // Disable merging for these tests
      });
      await undoManager.init();
    });

    it('should undo operation', () => {
      undoManager.add({ type: 'insert', data: 'test' });
      expect(undoManager.canUndo()).toBe(true);

      const operation = undoManager.undo();

      expect(operation).not.toBeNull();
      expect(operation!.type).toBe('insert');
      expect(operation!.data).toBe('test');

      const state = undoManager.getState();
      expect(state.undoStack).toEqual([]);
      expect(state.redoStack).toHaveLength(1);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(true);
    });

    it('should return null when undo stack is empty', () => {
      const operation = undoManager.undo();
      expect(operation).toBeNull();
    });

    it('should handle multiple undos', () => {
      undoManager.add({ type: 'insert', data: 'first' });
      undoManager.add({ type: 'insert', data: 'second' });
      undoManager.add({ type: 'insert', data: 'third' });

      const op1 = undoManager.undo();
      expect(op1!.data).toBe('third');

      const op2 = undoManager.undo();
      expect(op2!.data).toBe('second');

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.redoStack).toHaveLength(2);
    });
  });

  describe('Redo', () => {
    let testCounter = 0;

    beforeEach(async () => {
      const docId = `doc-redo-${testCounter++}`;
      crossTabSync = createTab(docId, { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      undoManager = new UndoManager({
        documentId: docId,
        crossTabSync,
        mergeWindow: 0, // Disable merging for these tests
      });
      await undoManager.init();
    });

    it('should redo operation', () => {
      undoManager.add({ type: 'insert', data: 'test' });
      undoManager.undo();

      expect(undoManager.canRedo()).toBe(true);

      const operation = undoManager.redo();

      expect(operation).not.toBeNull();
      expect(operation!.type).toBe('insert');
      expect(operation!.data).toBe('test');

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.redoStack).toEqual([]);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
    });

    it('should return null when redo stack is empty', () => {
      const operation = undoManager.redo();
      expect(operation).toBeNull();
    });

    it('should handle multiple redos', () => {
      undoManager.add({ type: 'insert', data: 'first' });
      undoManager.add({ type: 'insert', data: 'second' });
      undoManager.undo();
      undoManager.undo();

      const op1 = undoManager.redo();
      expect(op1!.data).toBe('first');

      const op2 = undoManager.redo();
      expect(op2!.data).toBe('second');

      const state = undoManager.getState();
      expect(state.undoStack).toHaveLength(2);
      expect(state.redoStack).toEqual([]);
    });
  });

  describe('Clear', () => {
    let testCounter = 0;

    beforeEach(async () => {
      const docId = `doc-clear-${testCounter++}`;
      crossTabSync = createTab(docId, { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      undoManager = new UndoManager({
        documentId: docId,
        crossTabSync,
        mergeWindow: 0, // Disable merging for these tests
      });
      await undoManager.init();
    });

    it('should clear all history', () => {
      undoManager.add({ type: 'insert', data: 'first' });
      undoManager.add({ type: 'insert', data: 'second' });
      undoManager.undo();

      expect(undoManager.canUndo()).toBe(true);
      expect(undoManager.canRedo()).toBe(true);

      undoManager.clear();

      const state = undoManager.getState();
      expect(state.undoStack).toEqual([]);
      expect(state.redoStack).toEqual([]);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(false);
    });
  });

  describe('State Changes', () => {
    it('should notify on state changes', async () => {
      crossTabSync = createTab('doc-notify', { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      const onStateChanged = vi.fn();
      undoManager = new UndoManager({
        documentId: 'doc-notify',
        crossTabSync,
        onStateChanged,
      });
      await undoManager.init();

      // Should be called on init with empty state
      expect(onStateChanged).toHaveBeenCalledTimes(1);

      undoManager.add({ type: 'insert', data: 'test' });
      expect(onStateChanged).toHaveBeenCalledTimes(2);

      undoManager.undo();
      expect(onStateChanged).toHaveBeenCalledTimes(3);

      undoManager.redo();
      expect(onStateChanged).toHaveBeenCalledTimes(4);

      undoManager.clear();
      expect(onStateChanged).toHaveBeenCalledTimes(5);
    });
  });

  describe('Cross-Tab Synchronization', () => {
    it('should synchronize state across tabs', async () => {
      const tab1 = createTab('doc-sync-tabs', { enabled: false });
      const tab2 = createTab('doc-sync-tabs', { enabled: false });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      // tab1 is leader
      expect(tab1.isCurrentLeader()).toBe(true);
      expect(tab2.isCurrentLeader()).toBe(false);

      const onStateChanged1 = vi.fn();
      const manager1 = new UndoManager({
        documentId: 'doc-sync-tabs',
        crossTabSync: tab1,
        onStateChanged: onStateChanged1,
      });
      await manager1.init();

      const onStateChanged2 = vi.fn();
      const manager2 = new UndoManager({
        documentId: 'doc-sync-tabs',
        crossTabSync: tab2,
        onStateChanged: onStateChanged2,
      });
      await manager2.init();

      // Leader adds operation
      manager1.add({ type: 'insert', data: 'from-tab1' });

      // Wait for sync
      await vi.advanceTimersByTimeAsync(100);

      // Follower should receive the state
      expect(onStateChanged2).toHaveBeenCalled();
      const state2 = manager2.getState();
      expect(state2.undoStack).toHaveLength(1);
      expect(state2.undoStack[0]!.data).toBe('from-tab1');

      manager1.destroy();
      manager2.destroy();
      tab1.destroy();
      tab2.destroy();
    });
  });
});
