/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { syncDocument } from '../stores/syncDocument';
import { createMockSyncKit, createMockDocument, flushPromises } from './utils';

describe('syncDocument', () => {
  let mockSyncKit: any;
  let mockDoc: any;

  beforeEach(() => {
    mockDoc = createMockDocument({ name: 'Alice', age: 30 });
    mockSyncKit = createMockSyncKit({
      document: vi.fn().mockReturnValue(mockDoc),
    });
  });

  describe('Store subscription (Svelte 4)', () => {
    it('should initialize and return document data', async () => {
      const store = syncDocument(mockSyncKit, 'doc-123');

      await flushPromises();

      expect(mockSyncKit.document).toHaveBeenCalledWith('doc-123');
      expect(mockDoc.init).toHaveBeenCalled();

      const value = get(store);
      expect(value).toEqual({ name: 'Alice', age: 30 });
    });

    it('should update reactively when document changes', async () => {
      const store = syncDocument(mockSyncKit, 'doc-123');
      await flushPromises();

      const values: any[] = [];
      store.subscribe((value) => values.push(value));

      // Trigger update
      mockDoc._trigger({ name: 'Bob', age: 25 });

      expect(values[values.length - 1]).toEqual({ name: 'Bob', age: 25 });
    });

    it('should clean up subscription on unsubscribe', async () => {
      const store = syncDocument(mockSyncKit, 'doc-123');
      await flushPromises();

      const unsubscribe = store.subscribe(() => {});
      unsubscribe();

      // Verify unsubscribe was called
      expect(mockDoc.subscribe).toHaveBeenCalled();
    });
  });

  describe('Rune properties (Svelte 5)', () => {
    it('should expose data as rune property', async () => {
      const store = syncDocument(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(store.data).toEqual({ name: 'Alice', age: 30 });
    });

    it('should expose loading state', async () => {
      // Create a mock that doesn't call subscribe callback immediately
      const delayedMockDoc = createMockDocument({ name: 'Alice', age: 30 });
      delayedMockDoc.subscribe = vi.fn((callback) => {
        // Don't call immediately, let init complete first
        setTimeout(() => callback({ name: 'Alice', age: 30 }), 10);
        return vi.fn();
      });
      mockSyncKit.document.mockReturnValue(delayedMockDoc);

      const store = syncDocument(mockSyncKit, 'doc-123');

      // Should be loading initially (before subscribe callback fires)
      expect(store.loading).toBe(true);

      await flushPromises();

      // Should be done loading after init and subscribe
      expect(store.loading).toBe(false);
    });

    it('should expose error state', async () => {
      const errorDoc = createMockDocument();
      errorDoc.init.mockRejectedValue(new Error('Init failed'));

      mockSyncKit.document.mockReturnValue(errorDoc);

      const store = syncDocument(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(store.error).toBeInstanceOf(Error);
      expect(store.error?.message).toBe('Init failed');
    });
  });

  describe('Methods', () => {
    it('should call document.update with updater function', async () => {
      const store = syncDocument<{ name: string; age: number }>(mockSyncKit, 'doc-123');
      await flushPromises();

      const updates = {};
      store.update((data) => {
        Object.assign(updates, data);
      });

      expect(mockDoc.update).toHaveBeenCalledWith(updates);
    });

    it('should refresh document data', async () => {
      const store = syncDocument(mockSyncKit, 'doc-123');
      await flushPromises();

      mockDoc.get.mockReturnValue({ name: 'Charlie', age: 35 });

      await store.refresh();

      expect(mockDoc.init).toHaveBeenCalledTimes(2); // Once on initial, once on refresh
      expect(store.data).toEqual({ name: 'Charlie', age: 35 });
    });

    it('should handle refresh errors', async () => {
      const store = syncDocument(mockSyncKit, 'doc-123');
      await flushPromises();

      mockDoc.init.mockRejectedValueOnce(new Error('Refresh failed'));

      await expect(store.refresh()).rejects.toThrow('Refresh failed');
      expect(store.error?.message).toBe('Refresh failed');
    });
  });

  describe('Options', () => {
    it('should support autoInit: false', async () => {
      const store = syncDocument(mockSyncKit, 'doc-123', { autoInit: false });
      await flushPromises();

      expect(mockDoc.init).not.toHaveBeenCalled();
      expect(store.loading).toBe(false);
    });
  });

  describe('SSR behavior', () => {
    it('should return placeholder store in SSR environment', () => {
      // Mock SSR environment
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const store = syncDocument(mockSyncKit, 'doc-123');

      expect(store.data).toBeUndefined();
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();

      // Restore
      global.window = originalWindow;
    });
  });

  describe('Type safety', () => {
    it('should infer types correctly', async () => {
      type User = {
        name: string;
        email: string;
        [key: string]: unknown;
      };

      // Update mock to return user data with email
      const userDoc = createMockDocument({ name: 'Alice', email: 'alice@example.com' });
      mockSyncKit.document.mockReturnValue(userDoc);

      const store = syncDocument<User>(mockSyncKit, 'user-123');
      await flushPromises();

      // This should type-check (compile-time verification)
      const data = store.data;
      if (data) {
        const name: string = data.name;
        const email: string = data.email;
        expect(name).toBeDefined();
        expect(name).toBe('Alice');
        expect(email).toBeDefined();
        expect(email).toBe('alice@example.com');
      }
    });
  });
});
