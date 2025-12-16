/**
 * Test Harness for Playwright Chaos Testing
 *
 * This page exposes SyncKit state for Playwright to inspect and manipulate
 * during chaos testing scenarios (leader election, network partitions, etc.)
 */

import React, { useEffect, useState, useRef } from 'react'
import { SyncKit, SyncText, CrossTabSync, UndoManager, type Operation } from '@synckit-js/sdk'
import { MemoryStorage } from '@synckit-js/sdk/lite'
import * as SelectionUtils from '@synckit-js/sdk/cursor/selection'

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
    let leaderCheckInterval: ReturnType<typeof setInterval> | null = null
    let stackCheckInterval: ReturnType<typeof setInterval> | null = null

    const initSyncKit = async () => {
      try {
        // Create SyncKit instance with memory storage (no IndexedDB for simpler testing)
        const storage = new MemoryStorage()
        const synckit = new SyncKit({
          storage,
          clientId: `test-client-${Math.random().toString(36).substring(7)}`
        })

        synckitRef.current = synckit

        // Create CrossTabSync instance
        const crossTabSync = new CrossTabSync('test-doc', { enabled: true })
        crossTabSync.enable()
        crossTabSyncRef.current = crossTabSync

        // Set initial tab ID
        setTabId(crossTabSync.getTabId())

        // Check leader status periodically
        const checkLeader = () => {
          const leader = crossTabSync.isCurrentLeader()
          setIsLeader(leader)
        }

        checkLeader()
        leaderCheckInterval = setInterval(checkLeader, 500)

        // Create UndoManager instance with CrossTabSync
        const undoManager = new UndoManager({
          documentId: 'test-doc',
          crossTabSync,
          onStateChanged: (state) => {
            setUndoStackSize(state.undoStack.length)
            setRedoStackSize(state.redoStack.length)
          }
        })

        await undoManager.init()
        undoManagerRef.current = undoManager

        // Create text document with CrossTabSync integration
        const textDoc = new SyncText(
          'test-doc',
          synckit.getClientId(),
          synckit.getStorage(),
          undefined, // syncManager
          crossTabSync
        )
        await textDoc.init()
        textDocRef.current = textDoc

        // Update text state
        setText(textDoc.get())
        textDoc.subscribe((newText: string) => {
          setText(newText)
        })

        // Update undo/redo stack sizes periodically
        const updateStacks = () => {
          const state = undoManager.getState()
          setUndoStackSize(state.undoStack.length)
          setRedoStackSize(state.redoStack.length)
        }

        updateStacks()
        stackCheckInterval = setInterval(updateStacks, 500)
      } catch (error) {
        console.error('Failed to initialize SyncKit:', error)
      }
    }

    initSyncKit()

    // Cleanup on unmount
    return () => {
      if (leaderCheckInterval) clearInterval(leaderCheckInterval)
      if (stackCheckInterval) clearInterval(stackCheckInterval)
      if (crossTabSyncRef.current) {
        crossTabSyncRef.current.destroy()
      }
      if (undoManagerRef.current) {
        undoManagerRef.current.destroy()
      }
    }
  }, [])

  // Expose state to Playwright via window object
  useEffect(() => {
    ;(window as any).__synckit_isLeader = isLeader
    ;(window as any).__synckit_tabId = tabId
    ;(window as any).__synckit_undoStackSize = undoStackSize
    ;(window as any).__synckit_redoStackSize = redoStackSize
    ;(window as any).__synckit_documentText = text
    ;(window as any).__synckit_selection = SelectionUtils
  })

  const handleTextChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    const textDoc = textDocRef.current
    const undoManager = undoManagerRef.current

    if (!textDoc) return

    // Store previous text for undo
    const previousText = textDoc.get()

    // Simple replace: delete all and insert new
    if (previousText.length > 0) {
      await textDoc.delete(0, previousText.length)
    }
    if (newText.length > 0) {
      await textDoc.insert(0, newText)
    }

    // Track operation in undo manager (store as text snapshot)
    if (undoManager) {
      const operation: Operation = {
        type: 'text-change',
        data: {
          previousText,
          newText
        },
        timestamp: Date.now()
      }
      undoManager.add(operation)
    }
  }

  const handleUndo = async () => {
    const undoManager = undoManagerRef.current
    const textDoc = textDocRef.current

    if (!undoManager || !textDoc || !undoManager.canUndo()) {
      return
    }

    // Get the operation to undo
    const operation = undoManager.undo()

    if (!operation || !operation.data) {
      return
    }

    // Restore previous text
    const { previousText } = operation.data
    const currentText = textDoc.get()

    if (currentText.length > 0) {
      await textDoc.delete(0, currentText.length)
    }
    if (previousText && previousText.length > 0) {
      await textDoc.insert(0, previousText)
    }
  }

  const handleRedo = async () => {
    const undoManager = undoManagerRef.current
    const textDoc = textDocRef.current

    if (!undoManager || !textDoc || !undoManager.canRedo()) return

    // Get the operation to redo
    const operation = undoManager.redo()
    if (!operation || !operation.data) return

    // Restore new text
    const { newText } = operation.data
    const currentText = textDoc.get()

    if (currentText.length > 0) {
      await textDoc.delete(0, currentText.length)
    }
    if (newText.length > 0) {
      await textDoc.insert(0, newText)
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
