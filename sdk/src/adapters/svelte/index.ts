/**
 * Svelte adapter for SyncKit
 *
 * Provides Svelte stores with hybrid Svelte 4/5 support:
 * - Svelte 4: Use `$store` syntax for auto-subscription
 * - Svelte 5: Use `store.property` for rune access
 *
 * @example
 * ```svelte
 * <script>
 *   import { syncDocument, presence, syncStatus } from '@synckit-js/sdk/svelte'
 *   import { getSyncKitContext } from '@synckit-js/sdk/svelte'
 *
 *   const synckit = getSyncKitContext()
 *
 *   // Create stores
 *   const doc = syncDocument(synckit, 'doc-123')
 *   const pres = presence(synckit, 'doc-123', { name: 'Alice' })
 *   const status = syncStatus(synckit, 'doc-123')
 * </script>
 *
 * <!-- Svelte 4 style -->
 * <div>{$doc.title}</div>
 * <div>{$pres.others.length} others online</div>
 *
 * <!-- Svelte 5 style -->
 * <div>{doc.data?.title}</div>
 * <div>{pres.others.length} others online</div>
 * ```
 *
 * @module @synckit-js/sdk/svelte
 */

// Core stores
export { syncDocument } from './stores/syncDocument';
export { syncText } from './stores/syncText';
export { richText } from './stores/richText';

// Undo/redo store
export { undo } from './stores/undo';

// Awareness stores
export { presence } from './stores/presence';
export { others } from './stores/others';
export { self } from './stores/self';

// Status store
export { syncStatus } from './stores/syncStatus';

// Context utilities
export { setSyncKitContext, getSyncKitContext, hasSyncKitContext } from './utils/context';

// SSR utilities
export { isBrowser, isServer, onBrowser, browserOnly } from './utils/ssr';

// Rune utilities
export { isStore, getValue } from './utils/runes';

// Type exports
export type {
  SyncDocumentStore,
  SyncTextStore,
  RichTextStore,
  PresenceStore,
  OthersStore,
  SelfStore,
  SyncStatusStore,
  SyncStatusState,
  UndoStore,
  UndoState,
  AwarenessState,
  Operation,
  SyncOptions,
} from './types';

// Selection store
export { selectionStore } from './stores/selectionStore';

// Selection components
export { default as Selection } from './components/Selection.svelte';
export { default as Selections } from './components/Selections.svelte';

// Selection types
export type { SelectionStoreOptions, SelectionStoreReturn } from './stores/selectionStore';
export type { SelectionUser } from './types/selection';
