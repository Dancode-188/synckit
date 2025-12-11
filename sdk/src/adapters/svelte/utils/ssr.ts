/**
 * SSR (Server-Side Rendering) utilities for Svelte adapter
 * Handles browser vs server environment detection
 */

/**
 * Check if code is running in browser environment
 *
 * SvelteKit and other SSR frameworks render components on the server first,
 * then hydrate on the client. SyncKit requires browser APIs (WebSocket, IndexedDB, etc.)
 * so we need to detect the environment.
 *
 * @returns true if running in browser
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Check if code is running on server
 *
 * @returns true if running on server (SSR)
 */
export function isServer(): boolean {
  return !isBrowser();
}

/**
 * Execute callback only in browser environment
 *
 * Useful for initialization code that should only run client-side
 *
 * @example
 * ```svelte
 * <script>
 *   import { onBrowser } from '@synckit-js/sdk/svelte'
 *
 *   onBrowser(() => {
 *     // This only runs in the browser
 *     synckit.init()
 *   })
 * </script>
 * ```
 *
 * @param callback - Function to execute in browser
 */
export function onBrowser(callback: () => void): void {
  if (isBrowser()) {
    callback();
  }
}

/**
 * Get a safe value that works in both SSR and browser
 *
 * @example
 * ```typescript
 * const online = browserOnly(() => navigator.onLine, false)
 * // Returns navigator.onLine in browser, false on server
 * ```
 *
 * @param getter - Function to get value in browser
 * @param fallback - Fallback value for server
 * @returns Value from getter if browser, fallback if server
 */
export function browserOnly<T>(getter: () => T, fallback: T): T {
  return isBrowser() ? getter() : fallback;
}
