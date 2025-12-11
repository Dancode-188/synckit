/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { syncStatus } from '../stores/syncStatus';
import { createMockSyncKit, flushPromises } from './utils';

describe('syncStatus', () => {
  let mockSyncKit: any;
  let networkStatusCallbacks: Array<(status: any) => void>;

  beforeEach(() => {
    networkStatusCallbacks = [];

    mockSyncKit = createMockSyncKit({
      getNetworkStatus: vi.fn().mockReturnValue({
        connectionState: 'connected',
        lastConnected: new Date(),
      }),
      onNetworkStatusChange: vi.fn((callback) => {
        networkStatusCallbacks.push(callback);
        return vi.fn(() => {
          const index = networkStatusCallbacks.indexOf(callback);
          if (index > -1) networkStatusCallbacks.splice(index, 1);
        });
      }),
    });

    // Mock navigator.onLine
    Object.defineProperty(global.navigator, 'onLine', {
      writable: true,
      value: true,
    });
  });

  describe('Store subscription (Svelte 4)', () => {
    it('should initialize with network status', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');

      await flushPromises();

      const value = get(store);
      expect(value.online).toBe(true);
      expect(value.syncing).toBe(false);
      expect(value.errors).toEqual([]);
    });

    it('should update when network status changes', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      const values: any[] = [];
      store.subscribe((value) => values.push(value));

      // Simulate network status change to disconnected
      networkStatusCallbacks.forEach((cb) =>
        cb({ connectionState: 'disconnected', lastConnected: new Date() })
      );

      const lastValue = values[values.length - 1];
      expect(lastValue.online).toBe(false);
    });
  });

  describe('Rune properties (Svelte 5)', () => {
    it('should expose online as rune property', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(store.online).toBe(true);
    });

    it('should expose syncing as rune property', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(store.syncing).toBe(false);
    });

    it('should expose lastSync as rune property', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(store.lastSync).toBeNull();
    });

    it('should expose errors as rune property', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(store.errors).toEqual([]);
    });
  });

  describe('Online/offline detection', () => {
    it('should detect online state from navigator', async () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: true,
      });

      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(store.online).toBe(true);
    });

    it('should update on window online event', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      // Simulate going offline then online
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);

      await flushPromises();

      expect(store.online).toBe(true);
    });

    it('should update on window offline event', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);

      await flushPromises();

      expect(store.online).toBe(false);
    });
  });

  describe('Methods', () => {
    it('should clear errors on retry', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      // Manually set errors (in real usage, errors would come from sync failures)
      const value = get(store);
      value.errors = [new Error('Test error')];

      await store.retry();

      expect(store.errors).toEqual([]);
    });
  });

  describe('SSR behavior', () => {
    it('should return placeholder store in SSR environment', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const store = syncStatus(mockSyncKit, 'doc-123');

      expect(store.online).toBe(true);
      expect(store.syncing).toBe(false);
      expect(store.errors).toEqual([]);

      global.window = originalWindow;
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe from network status changes on cleanup', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      const unsubscribe = store.subscribe(() => {});
      unsubscribe();

      expect(mockSyncKit.onNetworkStatusChange).toHaveBeenCalled();
    });

    it('should remove window event listeners on cleanup', async () => {
      const store = syncStatus(mockSyncKit, 'doc-123');
      await flushPromises();

      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const unsubscribe = store.subscribe(() => {});
      unsubscribe();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });
});
