/**
 * React adapter for SyncKit
 *
 * Provides React hooks for SyncKit functionality
 *
 * @module @synckit-js/sdk/react
 *
 * @example
 * ```tsx
 * import { useUndo } from '@synckit-js/sdk/react'
 *
 * function Editor() {
 *   const { canUndo, canRedo, undo, redo, add } = useUndo('doc-123')
 *
 *   return (
 *     <div>
 *       <button onClick={undo} disabled={!canUndo}>Undo</button>
 *       <button onClick={redo} disabled={!canRedo}>Redo</button>
 *     </div>
 *   )
 * }
 * ```
 */

// Undo/redo hook
export { useUndo } from './useUndo';
export type { UseUndoOptions, UseUndoReturn } from './useUndo';

// Re-export core types
export type { Operation } from '../../undo/undo-manager';

// Cursor/Selection components
export { Cursor } from './Cursor';
export { Cursors } from './Cursors';
export { Selection } from './Selection';
export { Selections } from './Selections';
export { useCursorTracking } from './useCursor';
export { useSelection } from './useSelection';
