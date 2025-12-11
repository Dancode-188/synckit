/**
 * Context utilities for Svelte adapter
 * Provides dependency injection pattern for SyncKit instance
 */

import { getContext, setContext } from 'svelte';
import type { SyncKit } from '../../../synckit';

/**
 * Symbol key for SyncKit context
 * Using Symbol ensures no naming conflicts with other libraries
 */
const SYNCKIT_KEY = Symbol('synckit');

/**
 * Set SyncKit instance in Svelte context
 *
 * @example
 * ```svelte
 * <script>
 *   import { setSyncKitContext } from '@synckit-js/sdk/svelte'
 *   import { SyncKit } from '@synckit-js/sdk'
 *
 *   const synckit = new SyncKit({ ... })
 *   setSyncKitContext(synckit)
 * </script>
 * ```
 *
 * @param synckit - SyncKit instance to provide to child components
 */
export function setSyncKitContext(synckit: SyncKit): void {
  setContext(SYNCKIT_KEY, synckit);
}

/**
 * Get SyncKit instance from Svelte context
 *
 * @example
 * ```svelte
 * <script>
 *   import { getSyncKitContext, syncDocument } from '@synckit-js/sdk/svelte'
 *
 *   const synckit = getSyncKitContext()
 *   const doc = syncDocument(synckit, 'doc-123')
 * </script>
 * ```
 *
 * @returns SyncKit instance from context
 * @throws Error if SyncKit context not found (no parent called setSyncKitContext)
 */
export function getSyncKitContext(): SyncKit {
  const synckit = getContext<SyncKit>(SYNCKIT_KEY);

  if (!synckit) {
    throw new Error(
      'getSyncKitContext: No SyncKit instance found in context. ' +
        'Make sure to call setSyncKitContext(synckit) in a parent component.'
    );
  }

  return synckit;
}

/**
 * Check if SyncKit context exists
 *
 * Useful for components that can work with or without SyncKit context
 *
 * @returns true if SyncKit context exists
 */
export function hasSyncKitContext(): boolean {
  try {
    const synckit = getContext<SyncKit>(SYNCKIT_KEY);
    return !!synckit;
  } catch {
    return false;
  }
}
