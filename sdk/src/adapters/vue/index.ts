/**
 * Vue 3 Adapter for SyncKit
 * Following VueUse patterns for best DX
 *
 * @module adapters/vue
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { provideSyncKit, useSyncDocument } from '@synckit-js/sdk/vue'
 * import { createSyncKit } from '@synckit-js/sdk'
 *
 * // In parent component
 * const synckit = await createSyncKit({ serverUrl: 'ws://localhost:8080' })
 * provideSyncKit(synckit)
 *
 * // In any child component
 * interface Todo {
 *   id: string
 *   text: string
 *   completed: boolean
 * }
 *
 * const { data: todos, update, loading } = useSyncDocument<Todo[]>('todos-123')
 * </script>
 * ```
 */

// Core composables
export { provideSyncKit, useSyncKit, tryUseSyncKit, SyncKitSymbol } from './composables/useSyncKit'
export { useSyncDocument } from './composables/useSyncDocument'
export { useSyncField } from './composables/useSyncField'
export { useNetworkStatus } from './composables/useNetworkStatus'

// Awareness composables
export { usePresence } from './composables/usePresence'
export { useOthers } from './composables/useOthers'
export { useSelf } from './composables/useSelf'

// Rich text composable
export { useRichText } from './composables/useRichText'

// Undo/redo composable
export { useUndo } from './composables/useUndo'

// Types
export type {
  MaybeRefOrGetter,
  UseSyncDocumentOptions,
  UseSyncDocumentReturn,
  UseSyncFieldOptions,
  UseSyncFieldReturn,
  UseNetworkStatusOptions,
  UseNetworkStatusReturn,
  UseSyncStatusOptions,
  UseSyncStatusReturn
} from './types'

// Awareness types
export type { UsePresenceOptions, UsePresenceReturn } from './composables/usePresence'
export type { UseSelfOptions, UseSelfReturn } from './composables/useSelf'

// Rich text types
export type { UseRichTextOptions, UseRichTextReturn } from './composables/useRichText'

// Undo/redo types
export type { UseUndoOptions, UseUndoReturn } from './composables/useUndo'

// Re-export core types
export type { AwarenessState, AwarenessUpdate } from '../../awareness'
export type { FormatAttributes } from '../../crdt/peritext'
export type { RichText, FormatRange } from '../../crdt/richtext'
export type { Operation } from '../../undo/undo-manager'

// Utilities (advanced users)
export { toValue } from './utils/refs'
export { useCleanup, tryOnScopeDispose } from './utils/lifecycle'
export { isSSR, isBrowser } from './utils/ssr'

// Selection composable
export { useSelection } from './composables/useSelection'

// Selection components
export { default as Selection } from './components/Selection.vue'
export { default as Selections } from './components/Selections.vue'

// Selection types
export type { UseSelectionOptions, UseSelectionReturn } from './composables/useSelection'
export type { SelectionUser } from './types/selection'
