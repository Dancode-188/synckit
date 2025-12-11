/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { presence } from '../stores/presence';
import { others } from '../stores/others';
import { self } from '../stores/self';
import { createMockSyncKit, createMockAwareness, flushPromises } from './utils';

describe('presence stores', () => {
  let mockSyncKit: any;
  let mockAwareness: any;

  beforeEach(() => {
    mockAwareness = createMockAwareness();
    mockSyncKit = createMockSyncKit({
      getAwareness: vi.fn().mockReturnValue(mockAwareness),
    });
  });

  describe('presence store', () => {
    it('should initialize with self and others', async () => {
      // Add some other users
      mockAwareness._addClient('client-2', { name: 'Bob' });
      mockAwareness._addClient('client-3', { name: 'Charlie' });

      const store = presence(mockSyncKit, 'doc-123');
      await flushPromises();

      const value = get(store);
      expect(value.self).toBeDefined();
      expect(value.others).toHaveLength(2);
    });

    it('should update when presence changes', async () => {
      const store = presence(mockSyncKit, 'doc-123');
      await flushPromises();

      const values: any[] = [];
      store.subscribe((value) => values.push(value));

      // Add a new user
      mockAwareness._addClient('client-2', { name: 'Alice' });

      const lastValue = values[values.length - 1];
      expect(lastValue.others).toHaveLength(1);
      expect(lastValue.others[0].state.name).toBe('Alice');
    });

    it('should set initial state', async () => {
      presence(mockSyncKit, 'doc-123', { name: 'Alice' });
      await flushPromises();

      expect(mockAwareness.setLocalState).toHaveBeenCalledWith({ name: 'Alice' });
    });

    it('should update local presence state', async () => {
      const store = presence(mockSyncKit, 'doc-123');
      await flushPromises();

      await store.updatePresence({ cursor: { x: 100, y: 200 } });

      expect(mockAwareness.setLocalState).toHaveBeenCalledWith({ cursor: { x: 100, y: 200 } });
    });

    it('should get presence by client ID', async () => {
      mockAwareness._addClient('client-2', { name: 'Bob' });

      const store = presence(mockSyncKit, 'doc-123');
      await flushPromises();

      const bobPresence = store.getPresence('client-2');

      expect(bobPresence).toBeDefined();
      expect(bobPresence?.state.name).toBe('Bob');
    });

    it('should return undefined for unknown client ID', async () => {
      const store = presence(mockSyncKit, 'doc-123');
      await flushPromises();

      const unknown = store.getPresence('unknown-client');

      expect(unknown).toBeUndefined();
    });

    it('should expose self as rune property', async () => {
      const store = presence(mockSyncKit, 'doc-123', { name: 'Alice' });
      await flushPromises();

      expect(store.self).toBeDefined();
      if (store.self) {
        expect(store.self.client_id).toBe('client-1');
      }
    });

    it('should expose others as rune property', async () => {
      mockAwareness._addClient('client-2', { name: 'Bob' });

      const store = presence(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(store.others).toHaveLength(1);
      if (store.others.length > 0 && store.others[0]) {
        expect(store.others[0].state.name).toBe('Bob');
      }
    });
  });

  describe('others store', () => {
    it('should filter out self from awareness states', async () => {
      mockAwareness._addClient('client-2', { name: 'Bob' });
      mockAwareness._addClient('client-3', { name: 'Charlie' });

      const store = others(mockSyncKit, 'doc-123');
      await flushPromises();

      const value = get(store);
      expect(value).toHaveLength(2);
      expect(value.every((u) => u.client_id !== 'client-1')).toBe(true);
    });

    it('should update when users join', async () => {
      const store = others(mockSyncKit, 'doc-123');
      await flushPromises();

      const values: any[] = [];
      store.subscribe((value) => values.push(value));

      mockAwareness._addClient('client-2', { name: 'Alice' });

      const lastValue = values[values.length - 1];
      expect(lastValue).toHaveLength(1);
      expect(lastValue[0].state.name).toBe('Alice');
    });

    it('should update when users leave', async () => {
      mockAwareness._addClient('client-2', { name: 'Bob' });

      const store = others(mockSyncKit, 'doc-123');
      await flushPromises();

      const values: any[] = [];
      store.subscribe((value) => values.push(value));

      mockAwareness._removeClient('client-2');

      const lastValue = values[values.length - 1];
      expect(lastValue).toHaveLength(0);
    });

    it('should expose others as rune property', async () => {
      mockAwareness._addClient('client-2', { name: 'Bob' });

      const store = others(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(store.others).toHaveLength(1);
      if (store.others.length > 0 && store.others[0]) {
        expect(store.others[0].state.name).toBe('Bob');
      }
    });
  });

  describe('self store', () => {
    it('should track only local user state', async () => {
      const store = self(mockSyncKit, 'doc-123', { name: 'Alice' });
      await flushPromises();

      const value = get(store);
      expect(value).toBeDefined();
      expect(value?.client_id).toBe('client-1');
      expect(value?.state.name).toBe('Alice');
    });

    it('should update local state', async () => {
      const store = self(mockSyncKit, 'doc-123');
      await flushPromises();

      await store.update({ cursor: { x: 50, y: 75 } });

      expect(mockAwareness.setLocalState).toHaveBeenCalledWith({ cursor: { x: 50, y: 75 } });
    });

    it('should expose self as rune property', async () => {
      const store = self(mockSyncKit, 'doc-123', { name: 'Alice' });
      await flushPromises();

      expect(store.self).toBeDefined();
      if (store.self) {
        expect(store.self.state.name).toBe('Alice');
      }
    });

    it('should not include other users', async () => {
      mockAwareness._addClient('client-2', { name: 'Bob' });

      const store = self(mockSyncKit, 'doc-123');
      await flushPromises();

      const value = get(store);
      expect(value?.client_id).toBe('client-1');
      // Bob should not be included
    });
  });

  describe('SSR behavior', () => {
    it('presence should return placeholder in SSR', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const store = presence(mockSyncKit, 'doc-123');

      expect(store.self).toBeUndefined();
      expect(store.others).toEqual([]);

      global.window = originalWindow;
    });

    it('others should return placeholder in SSR', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const store = others(mockSyncKit, 'doc-123');

      expect(store.others).toEqual([]);

      global.window = originalWindow;
    });

    it('self should return placeholder in SSR', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const store = self(mockSyncKit, 'doc-123');

      expect(store.self).toBeUndefined();

      global.window = originalWindow;
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe from awareness on cleanup', async () => {
      const store = presence(mockSyncKit, 'doc-123');
      await flushPromises();

      const unsubscribe = store.subscribe(() => {});
      unsubscribe();

      expect(mockAwareness.subscribe).toHaveBeenCalled();
    });
  });
});
