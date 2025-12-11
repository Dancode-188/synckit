/**
 * Lifecycle utilities for composables
 * @module adapters/vue/utils/lifecycle
 */

import { onScopeDispose, onUnmounted, getCurrentScope } from 'vue'

/**
 * Try to use onScopeDispose if in an active scope, otherwise use onUnmounted
 * Following VueUse pattern for cleanup
 */
export function tryOnScopeDispose(fn: () => void): boolean {
  if (getCurrentScope()) {
    onScopeDispose(fn)
    return true
  }
  return false
}

/**
 * Register a cleanup function that runs on scope dispose or unmount
 * This is the recommended pattern for composables
 */
export function useCleanup(fn: () => void): void {
  // Try onScopeDispose first (works in setup and composables)
  if (tryOnScopeDispose(fn)) {
    return
  }

  // Fallback to onUnmounted (works in component setup)
  try {
    onUnmounted(fn)
  } catch {
    // If neither works, we're not in a Vue context
    // This is acceptable for some edge cases (e.g., testing)
    console.warn('[SyncKit] Cleanup function registered outside Vue context')
  }
}

/**
 * Check if we're currently in an active Vue scope
 */
export function isInScope(): boolean {
  return !!getCurrentScope()
}
