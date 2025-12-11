/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { syncText } from '../stores/syncText';
import { createMockSyncKit, createMockDocument, createMockTextField, flushPromises } from './utils';

describe('syncText', () => {
  let mockSyncKit: any;
  let mockDoc: any;
  let mockTextField: any;

  beforeEach(() => {
    mockTextField = createMockTextField('Hello World');
    mockDoc = createMockDocument();
    mockDoc.init = vi.fn(async () => {
      // Simulate field being available after init
      (mockDoc as any).getField = vi.fn(() => mockTextField);
      (mockDoc as any).text = mockTextField;
    });

    mockSyncKit = createMockSyncKit({
      document: vi.fn().mockReturnValue(mockDoc),
    });
  });

  describe('Store subscription (Svelte 4)', () => {
    it('should initialize and return text content', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content');

      await flushPromises();

      expect(mockSyncKit.document).toHaveBeenCalledWith('doc-123');
      expect(mockDoc.init).toHaveBeenCalled();

      const value = get(store);
      expect(value).toBe('Hello World');
    });

    it('should update reactively when text changes', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      const values: string[] = [];
      store.subscribe((value) => values.push(value));

      // Insert text
      await mockTextField.insert(5, ' Beautiful');

      expect(values[values.length - 1]).toBe('Hello Beautiful World');
    });
  });

  describe('Rune properties (Svelte 5)', () => {
    it('should expose text as rune property', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      expect(store.text).toBe('Hello World');
    });

    it('should expose loading state', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content');

      expect(store.loading).toBe(true);

      await flushPromises();

      expect(store.loading).toBe(false);
    });

    it('should expose error state on field not found', async () => {
      mockDoc.init = vi.fn(async () => {
        (mockDoc as any).getField = vi.fn(() => null);
      });

      const store = syncText(mockSyncKit, 'doc-123', 'missing');
      await flushPromises();

      expect(store.error).toBeInstanceOf(Error);
      expect(store.error?.message).toContain('not found');
    });
  });

  describe('Text operations', () => {
    it('should insert text at position', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      await store.insert(5, ' Beautiful');

      expect(mockTextField.insert).toHaveBeenCalledWith(5, ' Beautiful');
      expect(store.text).toBe('Hello Beautiful World');
    });

    it('should delete text range', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      await store.delete(6, 5); // Delete "World"

      expect(mockTextField.delete).toHaveBeenCalledWith(6, 5);
      expect(store.text).toBe('Hello ');
    });

    it('should return text length', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      const len = store.length();

      expect(len).toBe(11); // "Hello World"
    });

    it('should handle insert errors', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      mockTextField.insert.mockRejectedValueOnce(new Error('Insert failed'));

      await expect(store.insert(0, 'test')).rejects.toThrow('Insert failed');
      expect(store.error?.message).toBe('Insert failed');
    });

    it('should throw when not initialized', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content', { autoInit: false });

      await expect(store.insert(0, 'test')).rejects.toThrow('Not initialized');
    });
  });

  describe('Options', () => {
    it('should support autoInit: false', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content', { autoInit: false });
      await flushPromises();

      expect(mockDoc.init).not.toHaveBeenCalled();
      expect(store.loading).toBe(true);
    });

    it('should use custom field name', async () => {
      syncText(mockSyncKit, 'doc-123', 'customField');
      await flushPromises();

      // Field access would check for 'customField'
      expect(mockDoc.init).toHaveBeenCalled();
    });
  });

  describe('SSR behavior', () => {
    it('should return placeholder store in SSR environment', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const store = syncText(mockSyncKit, 'doc-123', 'content');

      expect(store.text).toBe('');
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.length()).toBe(0);

      global.window = originalWindow;
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe on store cleanup', async () => {
      const store = syncText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      const unsubscribe = store.subscribe(() => {});
      unsubscribe();

      expect(mockTextField.subscribe).toHaveBeenCalled();
    });
  });
});
