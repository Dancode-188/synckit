/**
 * SSR detection utilities
 * @module adapters/vue/utils/ssr
 */

/**
 * Check if we're running in an SSR environment
 * Works with Nuxt 3, Vite SSR, and other frameworks
 */
export function isSSR(): boolean {
  return typeof window === 'undefined'
}

/**
 * Check if we're running in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Safe access to window object
 * Returns undefined during SSR
 */
export function getWindow(): Window | undefined {
  return isBrowser() ? window : undefined
}

/**
 * Safe access to document object
 * Returns undefined during SSR
 */
export function getDocument(): Document | undefined {
  return isBrowser() ? document : undefined
}

/**
 * Safe access to navigator object
 * Returns undefined during SSR
 */
export function getNavigator(): Navigator | undefined {
  return isBrowser() ? navigator : undefined
}
