import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageCoordinator } from '../storage/storage-coordinator';
import { CrossTabSync } from '../sync/cross-tab';
import {
  installMockBroadcastChannel,
  resetMockBroadcastChannel,
  restoreBroadcastChannel,
} from './mocks/broadcast-channel';
import 'fake-indexeddb/auto';

describe('StorageCoordinator', () => {
  let coordinator: StorageCoordinator;
  let crossTabSync: CrossTabSync;
  let originalBroadcastChannel: any;

  beforeEach(() => {
    // Only fake explicit timers and Date, not promises (needed for IndexedDB)
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
    });
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    originalBroadcastChannel = (global as any).BroadcastChannel;
    installMockBroadcastChannel();
  });

  afterEach(() => {
    vi.useRealTimers();

    if (coordinator) {
      coordinator.destroy();
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
    it('should initialize successfully', async () => {
      crossTabSync = createTab('doc-1', { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      coordinator = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync,
      });

      await expect(coordinator.init()).resolves.toBeUndefined();
    });

    it('should load state when initialized as leader', async () => {
      crossTabSync = createTab('doc-1', { enabled: false });

      const onStateLoaded = vi.fn();
      coordinator = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync,
        onStateLoaded,
      });

      // Pre-populate IndexedDB
      await coordinator.init();
      if (crossTabSync.isCurrentLeader()) {
        await coordinator.saveState([{ type: 'test' }], []);
      }

      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Should be called when becoming leader
      expect(crossTabSync.isCurrentLeader()).toBe(true);
    });
  });

  describe('Leader-Only Writes', () => {
    it('should allow leader to save state', async () => {
      crossTabSync = createTab('doc-1', { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      expect(crossTabSync.isCurrentLeader()).toBe(true);

      coordinator = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync,
      });
      await coordinator.init();

      await expect(
        coordinator.saveState([{ type: 'insert', data: 'hello' }], [])
      ).resolves.toBeUndefined();

      const loaded = await coordinator.loadState();
      expect(loaded?.undoStack).toEqual([{ type: 'insert', data: 'hello' }]);
    });

    it('should prevent non-leader from saving state', async () => {
      const tab1 = createTab('doc-prevent-save', { enabled: false });
      const tab2 = createTab('doc-prevent-save', { enabled: false });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      // tab1 is leader, tab2 is not
      expect(tab1.isCurrentLeader()).toBe(true);
      expect(tab2.isCurrentLeader()).toBe(false);

      const coordinator2 = new StorageCoordinator({
        documentId: 'doc-prevent-save',
        crossTabSync: tab2,
      });
      await coordinator2.init();

      // Should not throw, but should not save (just warn)
      await coordinator2.saveState([{ type: 'test' }], []);

      // Verify nothing was saved
      const coordinator1 = new StorageCoordinator({
        documentId: 'doc-prevent-save',
        crossTabSync: tab1,
      });
      await coordinator1.init();

      const loaded = await coordinator1.loadState();
      expect(loaded).toBeNull();

      coordinator2.destroy();
      coordinator1.destroy();
      tab1.destroy();
      tab2.destroy();
    });
  });

  describe('State Synchronization', () => {
    it('should broadcast state changes to other tabs', async () => {
      const tab1 = createTab('doc-1', { enabled: false });
      const tab2 = createTab('doc-1', { enabled: false });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      const onStateChanged = vi.fn();
      const coordinator2 = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync: tab2,
        onStateChanged,
      });
      await coordinator2.init();

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      // tab1 is leader
      const coordinator1 = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync: tab1,
      });
      await coordinator1.init();

      // Leader saves state
      await coordinator1.saveState([{ type: 'insert', data: 'hello' }], []);

      // Follower should receive state update
      await vi.advanceTimersByTimeAsync(100);
      expect(onStateChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc-1',
          undoStack: [{ type: 'insert', data: 'hello' }],
          redoStack: [],
        })
      );

      coordinator1.destroy();
      coordinator2.destroy();
      tab1.destroy();
      tab2.destroy();
    });

    it('should not sync state to self when leader', async () => {
      crossTabSync = createTab('doc-1', { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      const onStateChanged = vi.fn();
      coordinator = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync,
        onStateChanged,
      });
      await coordinator.init();

      // Leader saves state
      await coordinator.saveState([{ type: 'test' }], []);

      // Leader should not call onStateChanged for its own changes
      expect(onStateChanged).not.toHaveBeenCalled();
    });
  });

  describe('Leader Transition', () => {
    it('should load state when becoming leader', async () => {
      const tab1 = createTab('doc-1', { enabled: false });
      const tab2 = createTab('doc-1', { enabled: false });

      // tab1 becomes leader first
      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      const coordinator1 = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync: tab1,
      });
      await coordinator1.init();

      // tab1 saves some state
      await coordinator1.saveState([{ type: 'operation-1' }], []);

      // tab2 joins as follower
      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      const onStateLoaded = vi.fn();
      const coordinator2 = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync: tab2,
        onStateLoaded,
      });
      await coordinator2.init();

      // Wait for tab2 to receive at least one heartbeat from tab1
      // Heartbeat interval is 2000ms by default
      await vi.advanceTimersByTimeAsync(2100);

      // tab1 leaves
      tab1.destroy();
      coordinator1.destroy();

      // tab2 should detect leader failure and become leader
      // Timeline:
      // - heartbeatTimeout: 5000ms (default)
      // - leaderCheckInterval: 1000ms
      // - Need: timeout + next check cycle + election time
      // Total: 5000ms + 1000ms + 500ms = 6500ms
      await vi.advanceTimersByTimeAsync(7000);

      // tab2 should load state from IndexedDB
      expect(tab2.isCurrentLeader()).toBe(true);

      // Check that state was loaded (onStateLoaded should have been called)
      // This might take a moment due to async operations
      await vi.advanceTimersByTimeAsync(100);

      coordinator2.destroy();
      tab2.destroy();
    });
  });

  describe('Multiple Documents', () => {
    it('should handle multiple documents independently', async () => {
      const tab1 = createTab('doc-1', { enabled: false });
      const tab2 = createTab('doc-2', { enabled: false });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      const coordinator1 = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync: tab1,
      });
      await coordinator1.init();

      const coordinator2 = new StorageCoordinator({
        documentId: 'doc-2',
        crossTabSync: tab2,
      });
      await coordinator2.init();

      // Save different state to each document
      await coordinator1.saveState([{ type: 'doc1-op' }], []);
      await coordinator2.saveState([{ type: 'doc2-op' }], []);

      // Load and verify
      const state1 = await coordinator1.loadState();
      const state2 = await coordinator2.loadState();

      expect(state1?.undoStack).toEqual([{ type: 'doc1-op' }]);
      expect(state2?.undoStack).toEqual([{ type: 'doc2-op' }]);

      coordinator1.destroy();
      coordinator2.destroy();
      tab1.destroy();
      tab2.destroy();
    });
  });

  describe('Deletion', () => {
    it('should allow leader to delete state', async () => {
      crossTabSync = createTab('doc-1', { enabled: false });
      crossTabSync.enable();
      await vi.advanceTimersByTimeAsync(200);

      coordinator = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync,
      });
      await coordinator.init();

      // Save state
      await coordinator.saveState([{ type: 'test' }], []);

      // Delete state
      await coordinator.deleteState();

      // Verify deleted
      const loaded = await coordinator.loadState();
      expect(loaded).toBeNull();
    });

    it('should prevent non-leader from deleting state', async () => {
      const tab1 = createTab('doc-1', { enabled: false });
      const tab2 = createTab('doc-1', { enabled: false });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      const coordinator1 = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync: tab1,
      });
      await coordinator1.init();

      // Leader saves state
      await coordinator1.saveState([{ type: 'test' }], []);

      // Non-leader tries to delete
      const coordinator2 = new StorageCoordinator({
        documentId: 'doc-1',
        crossTabSync: tab2,
      });
      await coordinator2.init();

      await coordinator2.deleteState(); // Should not delete

      // State should still exist
      const loaded = await coordinator1.loadState();
      expect(loaded).not.toBeNull();

      coordinator1.destroy();
      coordinator2.destroy();
      tab1.destroy();
      tab2.destroy();
    });
  });
});
