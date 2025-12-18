import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { useSyncKit, usePresence, useOthers } from '@synckit-js/sdk/react'
import type { RichText } from '@synckit-js/sdk'
import type { QuillAPI } from '@synckit-js/sdk/integrations/quill'
import Cursor from './Cursor'
import UndoRedoToolbar from './UndoRedoToolbar'

interface EditorProps {
  documentId: string
  language: 'markdown' | 'javascript' | 'typescript' | 'plaintext'
}

export default function Editor({ documentId }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const bindingRef = useRef<any>(null)
  const richTextRef = useRef<RichText | null>(null)
  const synckit = useSyncKit()
  const [loading, setLoading] = useState(true)

  // Initialize presence with random color
  const initialPresence = useMemo(() => ({
    name: 'Anonymous',
    color: '#' + Math.floor(Math.random()*16777215).toString(16),
    cursor: null
  }), [])
  const [presence, setPresence] = usePresence(documentId, initialPresence)
  const others = useOthers(documentId)

  // Track latest presence with ref to avoid stale closures
  const presenceRef = useRef(presence)
  useEffect(() => {
    presenceRef.current = presence
  }, [presence])

  useEffect(() => {
    if (!editorRef.current || !synckit) return

    // Guard against double initialization (React Strict Mode runs effects twice)
    if (quillRef.current) {
      console.log('[Editor] Already initialized, skipping')
      return
    }

    let mounted = true

    const initializeEditor = async () => {
      try {
        console.log('[Editor] Starting initialization for document:', documentId)

        // Create RichText instance
        console.log('[Editor] Creating RichText instance...')
        const richText = synckit.richText(documentId)

        console.log('[Editor] Initializing RichText...')
        await richText.init()
        console.log('[Editor] RichText initialized successfully')

        richTextRef.current = richText

        if (!mounted) {
          richText.dispose()
          return
        }

        // Initialize Quill editor
        console.log('[Editor] Creating Quill instance...')
        const quill = new Quill(editorRef.current!, {
          theme: 'snow',
          placeholder: 'Start typing to collaborate in real-time...',
          modules: {
            toolbar: [
              [{ 'header': [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ 'color': [] }, { 'background': [] }],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              ['blockquote', 'code-block'],
              ['link'],
              ['clean']
            ]
          }
        })

        quillRef.current = quill
        console.log('[Editor] Quill instance created')

        // Dynamically import QuillBinding
        console.log('[Editor] Importing QuillBinding...')
        const { QuillBinding } = await import('@synckit-js/sdk/integrations/quill')
        console.log('[Editor] QuillBinding imported')

        if (!mounted) {
          quill.enable(false)
          return
        }

        // Create binding between Quill and RichText
        // Cast to QuillAPI since QuillBinding uses a simplified interface
        console.log('[Editor] Creating QuillBinding...')
        const binding = new QuillBinding(richText, quill as unknown as QuillAPI)
        bindingRef.current = binding
        console.log('[Editor] QuillBinding created successfully')


        console.log('[Editor] Initialization complete!')
        setLoading(false)
      } catch (error) {
        console.error('Failed to initialize editor:', error)
        setLoading(false)
      }
    }

    initializeEditor()

    return () => {
      mounted = false

      // Cleanup in reverse order
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }

      if (quillRef.current) {
        // Quill doesn't have a destroy method, but we can clear it
        quillRef.current.enable(false)
        quillRef.current = null
      }

      // DON'T dispose richText - it's a shared resource managed by SyncKit's cache
      // Only clear the ref
      if (richTextRef.current) {
        richTextRef.current = null
      }
    }
  }, [documentId, synckit])

  // Removed early return - render the editor div immediately so ref is set

  // Cursor tracking for presence
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Use ref to get latest presence value
    const current = presenceRef.current
    if (current) {
      setPresence({
        ...current,
        cursor: { x, y }
      }).catch(() => {
        // Awareness not ready yet, ignore
      })
    }
  }, [setPresence])

  const handleMouseLeave = useCallback(() => {
    // Use ref to get latest presence value
    const current = presenceRef.current
    if (current) {
      setPresence({
        ...current,
        cursor: null
      }).catch(() => {
        // Awareness not ready yet, ignore
      })
    }
  }, [setPresence])

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Undo/Redo Toolbar */}
      <UndoRedoToolbar documentId={documentId} />

      {loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#666'
        }}>
          Loading editor...
        </div>
      )}

      <div
        ref={editorRef}
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: '#fff',
          display: loading ? 'none' : 'block'
        }}
      />

      {/* Render teammate cursors */}
      {others.map((user) => {
        const cursor = user.state.cursor as { x: number; y: number } | null | undefined
        if (!cursor) return null

        return (
          <Cursor
            key={user.client_id}
            position={cursor}
            color={(user.state.color as string) || '#888'}
            name={(user.state.name as string) || 'Anonymous'}
          />
        )
      })}
    </div>
  )
}
