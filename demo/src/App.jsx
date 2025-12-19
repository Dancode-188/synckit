import { useState, useEffect } from 'react'
import { SyncKit } from '@synckit-js/sdk'
import { SyncProvider, useRichText } from '@synckit-js/sdk/react'

// Generate or retrieve room ID from URL hash
const getRoomId = () => {
  if (window.location.hash) {
    return window.location.hash.replace('#', '')
  }
  const randomId = 'room-' + Math.random().toString(36).substring(2, 9)
  window.location.hash = randomId
  return randomId
}

// Generate unique client ID for this browser session
const getClientId = () => {
  let clientId = sessionStorage.getItem('synckit-client-id')
  if (!clientId) {
    clientId = 'client-' + Math.random().toString(36).substring(2, 9)
    sessionStorage.setItem('synckit-client-id', clientId)
  }
  return clientId
}

function Editor() {
  const [roomId] = useState(getRoomId())
  const { text, insert, delete: del } = useRichText(roomId)
  const [copied, setCopied] = useState(false)

  const shareUrl = window.location.href

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTextChange = (e) => {
    const newValue = e.target.value
    const oldValue = text

    // Calculate diff and apply changes
    if (newValue.length > oldValue.length) {
      // Text was added - insert at the end
      insert(oldValue.length, newValue.slice(oldValue.length))
    } else if (newValue.length < oldValue.length) {
      // Text was deleted - delete from the end
      del(newValue.length, oldValue.length - newValue.length)
    }
    // If lengths are equal, text might have been replaced in the middle
    // For simplicity, we'll just handle the basic cases above
  }

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: '0 0 10px 0' }}>
          🚀 SyncKit Live Demo
        </h1>
        <p style={{ color: '#666', margin: 0 }}>
          Local-first collaboration that actually works
        </p>
      </div>

      {/* Room Info */}
      <div style={{
        background: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{ marginBottom: '15px' }}>
          <strong style={{ display: 'block', marginBottom: '5px' }}>
            Your Room ID:
          </strong>
          <code style={{
            background: '#fff',
            padding: '8px 12px',
            borderRadius: '4px',
            display: 'inline-block',
            fontFamily: 'monospace',
            fontSize: '14px'
          }}>
            {roomId}
          </code>
        </div>

        <div>
          <strong style={{ display: 'block', marginBottom: '8px' }}>
            ✨ Try It Now:
          </strong>
          <ol style={{ margin: '0 0 15px 20px', paddingLeft: '0' }}>
            <li>Copy the URL below</li>
            <li>Open it in a new tab (or send to a friend)</li>
            <li>Watch real-time sync magic happen! 🎩</li>
          </ol>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={shareUrl}
              readOnly
              style={{
                flex: 1,
                padding: '10px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}
              onClick={(e) => e.target.select()}
            />
            <button
              onClick={copyUrl}
              style={{
                padding: '10px 20px',
                background: copied ? '#28a745' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'background 0.2s'
              }}
            >
              {copied ? '✓ Copied!' : 'Copy URL'}
            </button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontWeight: '600'
        }}>
          Collaborative Editor:
        </label>
        <textarea
          value={text}
          onChange={handleTextChange}
          placeholder="Start typing here... Open this page in another tab to see real-time sync!"
          style={{
            width: '100%',
            minHeight: '300px',
            padding: '15px',
            fontSize: '16px',
            fontFamily: 'monospace',
            border: '2px solid #007bff',
            borderRadius: '8px',
            resize: 'vertical',
            lineHeight: '1.6'
          }}
        />
      </div>

      {/* Features */}
      <div style={{
        background: '#e7f5ff',
        border: '1px solid #339af0',
        borderRadius: '8px',
        padding: '20px'
      }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '16px' }}>
          What Makes This Special:
        </h3>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Real-time sync:</strong> Changes appear instantly across all connected tabs
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Conflict-free:</strong> Multiple people can edit simultaneously without overwrites
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Offline-first:</strong> Works without internet, syncs when reconnected
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>No server required:</strong> Peer-to-peer or bring your own backend
          </li>
        </ul>
      </div>

      {/* CTA */}
      <div style={{
        marginTop: '30px',
        padding: '20px',
        background: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <p style={{ margin: '0 0 15px 0', fontSize: '16px' }}>
          Ready to build your own collaborative app?
        </p>
        <a
          href="https://github.com/Dancode-188/synckit"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#28a745',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            fontSize: '16px'
          }}
        >
          ⭐ Star on GitHub
        </a>
      </div>
    </div>
  )
}

// Wrap Editor with SyncProvider
export default function App() {
  const [synckitInstance, setSynckitInstance] = useState(null)

  useEffect(() => {
    // Create and initialize SyncKit instance
    const clientId = getClientId()
    const synckit = new SyncKit({ clientId })

    synckit.init().then(() => {
      setSynckitInstance(synckit)
    }).catch((error) => {
      console.error('Failed to initialize SyncKit:', error)
    })

    return () => {
      // Cleanup if needed
    }
  }, [])

  // Show loading state while initializing
  if (!synckitInstance) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Loading SyncKit...</h2>
          <p>Initializing WASM and storage...</p>
        </div>
      </div>
    )
  }

  return (
    <SyncProvider synckit={synckitInstance}>
      <Editor />
    </SyncProvider>
  )
}
