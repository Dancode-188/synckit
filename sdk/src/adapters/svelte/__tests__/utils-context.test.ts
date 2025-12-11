/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setContext, getContext } from 'svelte';
import { setSyncKitContext, getSyncKitContext, hasSyncKitContext } from '../utils/context';
import { createMockSyncKit } from './utils';

// Mock Svelte context
const contextStore = new Map();

vi.mock('svelte', async () => {
  return {
    setContext: vi.fn((key, value) => {
      contextStore.set(key, value);
    }),
    getContext: vi.fn((key) => {
      return contextStore.get(key);
    }),
  };
});

describe('Context utilities', () => {
  beforeEach(() => {
    // Clear context store between tests
    contextStore.clear();
    vi.clearAllMocks();
  });
  describe('setSyncKitContext', () => {
    it('should set SyncKit instance in context', () => {
      const mockSyncKit = createMockSyncKit();

      setSyncKitContext(mockSyncKit);

      expect(setContext).toHaveBeenCalled();
    });
  });

  describe('getSyncKitContext', () => {
    it('should retrieve SyncKit instance from context', () => {
      const mockSyncKit = createMockSyncKit();

      setSyncKitContext(mockSyncKit);
      const retrieved = getSyncKitContext();

      expect(retrieved).toBe(mockSyncKit);
    });

    it('should throw error when context not found', () => {
      // Clear context by mocking getContext to return undefined
      vi.mocked(getContext).mockReturnValueOnce(undefined);

      expect(() => getSyncKitContext()).toThrow('No SyncKit instance found in context');
    });

    it('should provide helpful error message', () => {
      vi.mocked(getContext).mockReturnValueOnce(undefined);

      expect(() => getSyncKitContext()).toThrow('Make sure to call setSyncKitContext');
    });
  });

  describe('hasSyncKitContext', () => {
    it('should return true when context exists', () => {
      const mockSyncKit = createMockSyncKit();
      setSyncKitContext(mockSyncKit);

      const exists = hasSyncKitContext();

      expect(exists).toBe(true);
    });

    it('should return false when context does not exist', () => {
      vi.mocked(getContext).mockReturnValueOnce(undefined);

      const exists = hasSyncKitContext();

      expect(exists).toBe(false);
    });

    it('should not throw error when context missing', () => {
      vi.mocked(getContext).mockImplementationOnce(() => {
        throw new Error('Context not found');
      });

      expect(() => hasSyncKitContext()).not.toThrow();
      expect(hasSyncKitContext()).toBe(false);
    });
  });
});
