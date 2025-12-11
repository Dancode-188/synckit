/**
 * Test utilities for Svelte adapter tests
 */

import { vi } from 'vitest';
import type { SyncKit } from '../../../synckit';
import type { AwarenessState } from '../../../awareness';

/**
 * Create a mock SyncKit instance for testing
 */
export function createMockSyncKit(overrides: Partial<SyncKit> = {}): SyncKit {
  return {
    document: vi.fn(),
    getAwareness: vi.fn(),
    getNetworkStatus: vi.fn(),
    onNetworkStatusChange: vi.fn(),
    ...overrides,
  } as unknown as SyncKit;
}

/**
 * Create a mock document for testing
 */
export function createMockDocument(data: any = {}) {
  const subscribers: Array<(data: any) => void> = [];

  return {
    init: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue(data),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((callback) => {
      subscribers.push(callback);
      // Call immediately with initial data
      callback(data);
      // Return unsubscribe function
      return vi.fn(() => {
        const index = subscribers.indexOf(callback);
        if (index > -1) subscribers.splice(index, 1);
      });
    }),
    _trigger: (newData: any) => {
      subscribers.forEach((cb) => cb(newData));
    },
  };
}

/**
 * Create a mock text field for testing
 */
export function createMockTextField(initialText: string = '') {
  const subscribers: Array<(text: string) => void> = [];
  let text = initialText;

  return {
    get: vi.fn(() => text),
    toString: vi.fn(() => text),
    insert: vi.fn(async (pos: number, insertText: string) => {
      text = text.slice(0, pos) + insertText + text.slice(pos);
      subscribers.forEach((cb) => cb(text));
    }),
    delete: vi.fn(async (start: number, length: number) => {
      text = text.slice(0, start) + text.slice(start + length);
      subscribers.forEach((cb) => cb(text));
    }),
    length: vi.fn(() => text.length),
    subscribe: vi.fn((callback) => {
      subscribers.push(callback);
      callback(text);
      return vi.fn(() => {
        const index = subscribers.indexOf(callback);
        if (index > -1) subscribers.splice(index, 1);
      });
    }),
  };
}

/**
 * Create a mock rich text field for testing
 */
export function createMockRichTextField(initialText: string = '') {
  const subscribers: Array<(text: string) => void> = [];
  let text = initialText;
  const formats: Map<number, Record<string, any>> = new Map();

  return {
    get: vi.fn(() => text),
    toString: vi.fn(() => text),
    getRanges: vi.fn(() => []),
    insert: vi.fn(async (pos: number, insertText: string) => {
      text = text.slice(0, pos) + insertText + text.slice(pos);
      subscribers.forEach((cb) => cb(text));
    }),
    delete: vi.fn(async (start: number, end: number) => {
      text = text.slice(0, start) + text.slice(end);
      subscribers.forEach((cb) => cb(text));
    }),
    format: vi.fn(async (start: number, end: number, attributes: Record<string, any>) => {
      for (let i = start; i < end; i++) {
        formats.set(i, { ...formats.get(i), ...attributes });
      }
    }),
    unformat: vi.fn(async (start: number, end: number, attributes: string[]) => {
      for (let i = start; i < end; i++) {
        const current = formats.get(i) || {};
        attributes.forEach((attr) => delete current[attr]);
        formats.set(i, current);
      }
    }),
    getFormats: vi.fn((position: number) => formats.get(position) || {}),
    subscribe: vi.fn((callback) => {
      subscribers.push(callback);
      callback(text);
      return vi.fn(() => {
        const index = subscribers.indexOf(callback);
        if (index > -1) subscribers.splice(index, 1);
      });
    }),
    subscribeFormats: vi.fn(() => vi.fn()),
  };
}

/**
 * Create a mock awareness instance for testing
 */
export function createMockAwareness() {
  const subscribers: Array<() => void> = [];
  const states = new Map<string, AwarenessState>();
  let localClientId = 'client-1';

  // Initialize with empty local state
  states.set(localClientId, {
    client_id: localClientId,
    state: {},
    clock: Date.now(),
  });

  return {
    init: vi.fn().mockResolvedValue(undefined),
    getClientId: vi.fn(() => localClientId),
    getStates: vi.fn(() => states),
    setLocalState: vi.fn(async (state: Record<string, unknown>) => {
      states.set(localClientId, {
        client_id: localClientId,
        state,
        clock: Date.now(),
      });
      subscribers.forEach((cb) => cb());
    }),
    subscribe: vi.fn((callback) => {
      subscribers.push(callback);
      callback();
      return vi.fn(() => {
        const index = subscribers.indexOf(callback);
        if (index > -1) subscribers.splice(index, 1);
      });
    }),
    createLeaveUpdate: vi.fn(() => new Uint8Array()),
    applyUpdate: vi.fn(),
    _addClient: (clientId: string, state: Record<string, unknown>) => {
      states.set(clientId, {
        client_id: clientId,
        state,
        clock: Date.now(),
      });
      subscribers.forEach((cb) => cb());
    },
    _removeClient: (clientId: string) => {
      states.delete(clientId);
      subscribers.forEach((cb) => cb());
    },
  };
}

/**
 * Wait for next tick
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait for all pending promises
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}
