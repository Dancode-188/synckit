/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import { writable } from 'svelte/store';
import { createState, createDerived, hasRunesSupport, isStore, getValue } from '../utils/runes';

describe('Rune utilities', () => {
  describe('createState', () => {
    it('should return initial value', () => {
      const state = createState(42);

      expect(state).toBe(42);
    });

    it('should work with objects', () => {
      const state = createState({ count: 0 });

      expect(state).toEqual({ count: 0 });
    });

    it('should work with arrays', () => {
      const state = createState([1, 2, 3]);

      expect(state).toEqual([1, 2, 3]);
    });
  });

  describe('createDerived', () => {
    it('should compute and return value', () => {
      const derived = createDerived(() => 2 + 2);

      expect(derived).toBe(4);
    });

    it('should execute compute function', () => {
      let executed = false;

      const derived = createDerived(() => {
        executed = true;
        return 'computed';
      });

      expect(executed).toBe(true);
      expect(derived).toBe('computed');
    });

    it('should work with complex computations', () => {
      const base = 10;
      const derived = createDerived(() => base * 2 + 5);

      expect(derived).toBe(25);
    });
  });

  describe('hasRunesSupport', () => {
    it('should check for Svelte 5 runes support', () => {
      const hasSupport = hasRunesSupport();

      // In test environment, this will depend on globalThis
      expect(typeof hasSupport).toBe('boolean');
    });

    it('should return false when $state not in globalThis', () => {
      // Ensure $state is not in globalThis
      // Save and remove the property descriptor to avoid triggering Svelte's getter error
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, '$state');
      if (descriptor) {
        delete (globalThis as any).$state;
      }

      const result = hasRunesSupport();

      // Restore if it existed
      if (descriptor) {
        Object.defineProperty(globalThis, '$state', descriptor);
      }

      // In normal test env, $state won't be available
      expect(result).toBe(false);
    });
  });

  describe('isStore', () => {
    it('should return true for Svelte stores', () => {
      const store = writable(42);

      expect(isStore(store)).toBe(true);
    });

    it('should return true for objects with subscribe method', () => {
      const storelike = {
        subscribe: () => () => {},
      };

      expect(isStore(storelike)).toBe(true);
    });

    it('should return false for non-stores', () => {
      expect(isStore(42)).toBe(false);
      expect(isStore('string')).toBe(false);
      expect(isStore({})).toBe(false);
      expect(isStore([])).toBe(false);
      expect(isStore(null)).toBe(false);
      expect(isStore(undefined)).toBe(false);
    });

    it('should return false for objects without subscribe', () => {
      const obj = { value: 42, update: () => {} };

      expect(isStore(obj)).toBe(false);
    });
  });

  describe('getValue', () => {
    it('should extract value from store', () => {
      const store = writable(42);

      const value = getValue(store);

      expect(value).toBe(42);
    });

    it('should return direct value if not a store', () => {
      const value = getValue(42);

      expect(value).toBe(42);
    });

    it('should work with string values', () => {
      const value = getValue('hello');

      expect(value).toBe('hello');
    });

    it('should work with object values', () => {
      const obj = { count: 10 };
      const value = getValue(obj);

      expect(value).toBe(obj);
    });

    it('should extract complex values from stores', () => {
      const store = writable({ name: 'Alice', age: 30 });

      const value = getValue(store);

      expect(value).toEqual({ name: 'Alice', age: 30 });
    });
  });
});
