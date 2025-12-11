/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { richText } from '../stores/richText';
import { createMockSyncKit, createMockDocument, createMockRichTextField, flushPromises } from './utils';

describe('richText', () => {
  let mockSyncKit: any;
  let mockDoc: any;
  let mockRichTextField: any;

  beforeEach(() => {
    mockRichTextField = createMockRichTextField('Hello World');
    mockDoc = createMockDocument();
    mockDoc.init = vi.fn(async () => {
      (mockDoc as any).getField = vi.fn(() => mockRichTextField);
      (mockDoc as any).richText = mockRichTextField;
    });

    mockSyncKit = createMockSyncKit({
      document: vi.fn().mockReturnValue(mockDoc),
    });
  });

  describe('Store subscription (Svelte 4)', () => {
    it('should initialize and return rich text content', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');

      await flushPromises();

      expect(mockSyncKit.document).toHaveBeenCalledWith('doc-123');
      expect(mockDoc.init).toHaveBeenCalled();

      const value = get(store);
      expect(value).toBe('Hello World');
    });
  });

  describe('Rune properties (Svelte 5)', () => {
    it('should expose text as rune property', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      expect(store.text).toBe('Hello World');
    });

    it('should expose loading state', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');

      expect(store.loading).toBe(true);

      await flushPromises();

      expect(store.loading).toBe(false);
    });
  });

  describe('Text operations', () => {
    it('should insert text at position', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      await store.insert(5, ' Beautiful');

      expect(mockRichTextField.insert).toHaveBeenCalledWith(5, ' Beautiful');
    });

    it('should delete text range', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      await store.delete(6, 11); // Delete "World"

      expect(mockRichTextField.delete).toHaveBeenCalledWith(6, 11);
    });
  });

  describe('Formatting operations', () => {
    it('should apply formatting to range', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      await store.format(0, 5, { bold: true });

      expect(mockRichTextField.format).toHaveBeenCalledWith(0, 5, { bold: true });
    });

    it('should remove formatting from range', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      await store.unformat(0, 5, ['bold']);

      expect(mockRichTextField.unformat).toHaveBeenCalledWith(0, 5, ['bold']);
    });

    it('should get formatting at position', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      // Apply some formatting
      await store.format(0, 5, { bold: true, color: 'red' });

      const formats = store.getFormats(2);

      expect(formats).toEqual({ bold: true, color: 'red' });
    });

    it('should return empty object when no formatting', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      const formats = store.getFormats(0);

      expect(formats).toEqual({});
    });

    it('should handle format errors', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      mockRichTextField.format.mockRejectedValueOnce(new Error('Format failed'));

      await expect(store.format(0, 5, { bold: true })).rejects.toThrow('Format failed');
    });

    it('should throw when not initialized', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content', { autoInit: false });

      await expect(store.format(0, 5, { bold: true })).rejects.toThrow('Not initialized');
      await expect(store.insert(0, 'test')).rejects.toThrow('Not initialized');
    });
  });

  describe('Options', () => {
    it('should support autoInit: false', async () => {
      richText(mockSyncKit, 'doc-123', 'content', { autoInit: false });
      await flushPromises();

      expect(mockDoc.init).not.toHaveBeenCalled();
    });

    it('should use default field name "content"', async () => {
      richText(mockSyncKit, 'doc-123');
      await flushPromises();

      expect(mockDoc.init).toHaveBeenCalled();
    });
  });

  describe('SSR behavior', () => {
    it('should return placeholder store in SSR environment', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const store = richText(mockSyncKit, 'doc-123', 'content');

      expect(store.text).toBe('');
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();

      global.window = originalWindow;
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe on store cleanup', async () => {
      const store = richText(mockSyncKit, 'doc-123', 'content');
      await flushPromises();

      const unsubscribe = store.subscribe(() => {});
      unsubscribe();

      expect(mockRichTextField.subscribe).toHaveBeenCalled();
    });
  });
});
