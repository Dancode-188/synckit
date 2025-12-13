/**
 * Test Harness for Playwright Chaos Testing
 *
 * This page exposes SyncKit state for Playwright to inspect and manipulate
 * during chaos testing scenarios (leader election, network partitions, etc.)
 */

import React, { useEffect, useState, useRef } from 'react'
import { SyncKit } from '@synckit-js/sdk'
import { MemoryStorage } from '@synckit-js/sdk/lite'

export function TestHarness() {
  const [text, setText] = useState('')
  const [isLeader, setIsLeader] = useState(false)
  const [tabId, setTabId] = useState('')
  const [undoStackSize, setUndoStackSize] = useState(0)
  const [redoStackSize, setRedoStackSize] = useState(0)

  const synckitRef = useRef<SyncKit | null>(null)
  const textDocRef = useRef<any>(null)
  const crossTabSyncRef = useRef<any>(null)
  const undoManagerRef = useRef<any>(null)

  // Initialize SyncKit on mount
  useEffect(() => {
    const initSyncKit = async () => {
      try {
        // Create SyncKit instance with memory storage (no IndexedDB for simpler testing)
        const storage = new MemoryStorage()
        const synckit = new SyncKit({
          storage,
          clientId: `test-client-${Math.random().toString(36).substring(7)}`
        })

        synckitRef.current = synckit

        // Get text document
        const textDoc = synckit.text('test-doc')
        await textDoc.init()
        textDocRef.current = textDoc

        // Update text state
        setText(textDoc.get())
        textDoc.subscribe((newText: string) => {
          setText(newText)
        })

        // Access CrossTabSync if available
        if ((synckit as any).crossTabSync) {
          const crossTabSync = (synckit as any).crossTabSync
          crossTabSyncRef.current = crossTabSync

          // Set initial tab ID
          setTabId(crossTabSync.tabId || 'unknown')

          // Check leader status periodically
          const checkLeader = () => {
            const leader = crossTabSync.isCurrentLeader ? crossTabSync.isCurrentLeader() : false
            setIsLeader(leader)
          }

          checkLeader()
          const interval = setInterval(checkLeader, 500)

          return () => clearInterval(interval)
        }

        // Access UndoManager if available
        if ((synckit as any).undoManager) {
          const undoManager = (synckit as any).undoManager
          undoManagerRef.current = undoManager

          // Update undo/redo stack sizes periodically
          const updateStacks = () => {
            setUndoStackSize(undoManager.undoStack?.length || 0)
            setRedoStackSize(undoManager.redoStack?.length || 0)
          }

          updateStacks()
          const interval = setInterval(updateStacks, 500)

          return () => clearInterval(interval)
        }
      } catch (error) {
        console.error('Failed to initialize SyncKit:', error)
      }
    }

    initSyncKit()
  }, [])

  // Expose state to Playwright via window object
  useEffect(() => {
    ;(window as any).__synckit_isLeader = isLeader
    ;(window as any).__synckit_tabId = tabId
    ;(window as any).__synckit_undoStackSize = undoStackSize
    ;(window as any).__synckit_redoStackSize = redoStackSize
    ;(window as any).__synckit_documentText = text
  })

  const handleTextChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    const textDoc = textDocRef.current

    if (!textDoc) return

    // Simple replace: delete all and insert new
    const currentText = textDoc.get()
    if (currentText.length > 0) {
      await textDoc.delete(0, currentText.length)
    }
    if (newText.length > 0) {
      await textDoc.insert(0, newText)
    }
  }

  const handleUndo = async () => {
    const undoManager = undoManagerRef.current
    if (undoManager && undoManager.canUndo && undoManager.canUndo()) {
      await undoManager.undo()
    }
  }

  const handleRedo = async () => {
    const undoManager = undoManagerRef.current
    if (undoManager && undoManager.canRedo && undoManager.canRedo()) {
      await undoManager.redo()
    }
  }

  const handleBoldAll = async () => {
    // For now, this is a placeholder since we'd need RichText integration
    console.log('Bold all clicked')
  }

  return (
    <div data-testid="test-harness" style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>SyncKit Test Harness</h1>

      <div style={{ marginBottom: '20px', display: 'grid', gap: '10px' }}>
        <div>
          <strong>Leader Status:</strong>{' '}
          <span data-testid="leader-status" style={{
            padding: '4px 8px',
            borderRadius: '4px',
            background: isLeader ? '#22c55e' : '#94a3b8',
            color: 'white',
            fontWeight: 'bold'
          }}>
            {isLeader ? 'LEADER' : 'FOLLOWER'}
          </span>
        </div>

        <div>
          <strong>Tab ID:</strong> <span data-testid="tab-id">{tabId}</span>
        </div>

        <div>
          <strong>Document Text:</strong> <span data-testid="document-text">{text || '(empty)'}</span>
        </div>

        <div>
          <strong>Undo Stack:</strong> <span data-testid="undo-stack-size">{undoStackSize}</span>
        </div>

        <div>
          <strong>Redo Stack:</strong> <span data-testid="redo-stack-size">{redoStackSize}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '10px' }}>
        <div>
          <label htmlFor="editor" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Editor:
          </label>
          <textarea
            id="editor"
            data-testid="editor"
            value={text}
            onChange={handleTextChange}
            style={{
              width: '100%',
              minHeight: '150px',
              padding: '10px',
              fontFamily: 'monospace',
              fontSize: '14px',
              border: '1px solid #cbd5e1',
              borderRadius: '4px'
            }}
            placeholder="Type here..."
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            data-testid="undo-btn"
            onClick={handleUndo}
            disabled={undoStackSize === 0}
            style={{
              padding: '8px 16px',
              background: undoStackSize > 0 ? '#3b82f6' : '#cbd5e1',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: undoStackSize > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            Undo
          </button>

          <button
            data-testid="redo-btn"
            onClick={handleRedo}
            disabled={redoStackSize === 0}
            style={{
              padding: '8px 16px',
              background: redoStackSize > 0 ? '#3b82f6' : '#cbd5e1',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: redoStackSize > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            Redo
          </button>

          <button
            data-testid="format-bold-btn"
            onClick={handleBoldAll}
            style={{
              padding: '8px 16px',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Bold All
          </button>
        </div>
      </div>
    </div>
  )
}
