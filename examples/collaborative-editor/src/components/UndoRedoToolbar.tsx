import { useEffect } from 'react'
import { useUndo } from '@synckit-js/sdk/react'

interface UndoRedoToolbarProps {
  documentId: string
}

export default function UndoRedoToolbar({ documentId }: UndoRedoToolbarProps) {
  const { undo, redo, canUndo, canRedo, undoStack, redoStack } = useUndo(documentId, {
    maxUndoSize: 100,
    mergeWindow: 500
  })

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo) undo()
      }

      if ((e.metaKey || e.ctrlKey) && (
        (e.shiftKey && e.key === 'z') || e.key === 'y'
      )) {
        e.preventDefault()
        if (canRedo) redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, canUndo, canRedo])

  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      padding: '8px 16px',
      borderBottom: '1px solid #e0e0e0',
      backgroundColor: '#f5f5f5',
      alignItems: 'center'
    }}>
      <button
        onClick={undo}
        disabled={!canUndo}
        style={{
          padding: '6px 12px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: canUndo ? '#fff' : '#f0f0f0',
          cursor: canUndo ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '14px'
        }}
        title={`Undo (${undoStack.length} operations) - Cmd/Ctrl+Z`}
      >
        <span>↶</span>
        <span>Undo</span>
        {undoStack.length > 0 && (
          <span style={{ fontSize: '12px', color: '#666' }}>
            ({undoStack.length})
          </span>
        )}
      </button>

      <button
        onClick={redo}
        disabled={!canRedo}
        style={{
          padding: '6px 12px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: canRedo ? '#fff' : '#f0f0f0',
          cursor: canRedo ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '14px'
        }}
        title={`Redo (${redoStack.length} operations) - Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y`}
      >
        <span>↷</span>
        <span>Redo</span>
        {redoStack.length > 0 && (
          <span style={{ fontSize: '12px', color: '#666' }}>
            ({redoStack.length})
          </span>
        )}
      </button>

      <div style={{
        marginLeft: 'auto',
        fontSize: '12px',
        color: '#666'
      }}>
        <kbd style={{
          padding: '2px 6px',
          backgroundColor: '#fff',
          border: '1px solid #ccc',
          borderRadius: '3px',
          fontSize: '11px'
        }}>
          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Z
        </kbd>
        {' '}to undo,{' '}
        <kbd style={{
          padding: '2px 6px',
          backgroundColor: '#fff',
          border: '1px solid #ccc',
          borderRadius: '3px',
          fontSize: '11px'
        }}>
          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Shift+Z
        </kbd>
        {' '}to redo
      </div>
    </div>
  )
}
