/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isBrowser, isServer, onBrowser, browserOnly } from '../utils/ssr';

describe('SSR utilities', () => {
  let originalWindow: any;
  let originalDocument: any;

  beforeEach(() => {
    originalWindow = global.window;
    originalDocument = global.document;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
  });

  describe('isBrowser', () => {
    it('should return true in browser environment', () => {
      expect(isBrowser()).toBe(true);
    });

    it('should return false when window is undefined', () => {
      // @ts-ignore
      delete global.window;

      expect(isBrowser()).toBe(false);
    });

    it('should return false when document is undefined', () => {
      // @ts-ignore
      delete global.document;

      expect(isBrowser()).toBe(false);
    });

    it('should return false when both window and document are undefined', () => {
      // @ts-ignore
      delete global.window;
      // @ts-ignore
      delete global.document;

      expect(isBrowser()).toBe(false);
    });
  });

  describe('isServer', () => {
    it('should return false in browser environment', () => {
      expect(isServer()).toBe(false);
    });

    it('should return true in server environment', () => {
      // @ts-ignore
      delete global.window;
      // @ts-ignore
      delete global.document;

      expect(isServer()).toBe(true);
    });
  });

  describe('onBrowser', () => {
    it('should execute callback in browser environment', () => {
      let executed = false;

      onBrowser(() => {
        executed = true;
      });

      expect(executed).toBe(true);
    });

    it('should not execute callback in server environment', () => {
      // @ts-ignore
      delete global.window;
      // @ts-ignore
      delete global.document;

      let executed = false;

      onBrowser(() => {
        executed = true;
      });

      expect(executed).toBe(false);
    });

    it('should pass through callback return value in browser', () => {
      let result: number | undefined;

      onBrowser(() => {
        result = 42;
      });

      expect(result).toBe(42);
    });
  });

  describe('browserOnly', () => {
    it('should return value from getter in browser environment', () => {
      const result = browserOnly(() => 'browser value', 'fallback');

      expect(result).toBe('browser value');
    });

    it('should return fallback in server environment', () => {
      // @ts-ignore
      delete global.window;
      // @ts-ignore
      delete global.document;

      const result = browserOnly(() => 'browser value', 'fallback');

      expect(result).toBe('fallback');
    });

    it('should work with complex values', () => {
      const browserValue = { online: true, status: 'connected' };
      const fallbackValue = { online: false, status: 'disconnected' };

      const result = browserOnly(() => browserValue, fallbackValue);

      expect(result).toBe(browserValue);
      expect(result.online).toBe(true);
    });

    it('should handle navigator.onLine safely', () => {
      const result = browserOnly(() => navigator.onLine, false);

      expect(typeof result).toBe('boolean');
    });

    it('should return fallback when navigator unavailable on server', () => {
      // @ts-ignore
      delete global.window;
      // @ts-ignore
      delete global.document;

      const result = browserOnly(() => (navigator as any).onLine, false);

      expect(result).toBe(false);
    });
  });
});
