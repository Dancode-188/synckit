import { useState, useEffect } from 'react'
import { SyncKit } from '@synckit-js/sdk'
import { SyncProvider, useSyncDocument, useAwareness, useOthers } from '@synckit-js/sdk/react'
import './App.css'

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

// Get random color for user avatar
const getUserColor = () => {
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6']
  return colors[Math.floor(Math.random() * colors.length)]
}

// Get username from localStorage or generate new one
const getUsername = () => {
  let username = localStorage.getItem('synckit-username')
  if (!username) {
    const adjectives = ['Quick', 'Happy', 'Clever', 'Brave', 'Swift', 'Cool']
    const animals = ['Fox', 'Eagle', 'Panda', 'Tiger', 'Hawk', 'Wolf']
    username = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${animals[Math.floor(Math.random() * animals.length)]}`
    localStorage.setItem('synckit-username', username)
  }
  return username
}

function TodoApp() {
  const [roomId] = useState(getRoomId())
  const [username] = useState(getUsername())
  const [userColor] = useState(getUserColor())
  const [newTodo, setNewTodo] = useState('')
  const [copied, setCopied] = useState(false)
  const [stats, setStats] = useState({ used: 0, quota: 0 })

  const [data, { set: setField }, doc] = useSyncDocument(roomId)
  const [awareness, { setLocalState }] = useAwareness(roomId)
  const others = useOthers(roomId)

  const shareUrl = window.location.href

  // Set user awareness (name and color) - only when awareness is initialized
  useEffect(() => {
    if (!awareness) return // Wait for awareness to initialize

    setLocalState({
      user: { name: username, color: userColor }
    }).catch(err => {
      console.error('Failed to set awareness state:', err)
    })
  }, [awareness, setLocalState, username, userColor])

  // Update OPFS stats periodically (if using OPFS storage)
  useEffect(() => {
    const updateStats = async () => {
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate()
          setStats({
            used: estimate.usage || 0,
            quota: estimate.quota || 0
          })
        } catch (e) {
          // OPFS not available
        }
      }
    }

    updateStats()
    const interval = setInterval(updateStats, 5000)
    return () => clearInterval(interval)
  }, [])

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const addTodo = (e) => {
    e.preventDefault()
    if (!newTodo.trim()) return

    const todos = data.todos || []
    const newTodoItem = {
      id: Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      text: newTodo.trim(),
      completed: false,
      createdBy: username,
      createdAt: Date.now()
    }

    setField('todos', [...todos, newTodoItem])
    setNewTodo('')
  }

  const toggleTodo = (todoId) => {
    const todos = data.todos || []
    const updated = todos.map(todo =>
      todo.id === todoId ? { ...todo, completed: !todo.completed } : todo
    )
    setField('todos', updated)
  }

  const deleteTodo = (todoId) => {
    const todos = data.todos || []
    setField('todos', todos.filter(todo => todo.id !== todoId))
  }

  const todos = data.todos || []
  const completedCount = todos.filter(t => t.completed).length
  const totalCount = todos.length
  const onlineUsers = others.filter(s => s?.state?.user)

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1>🚀 SyncKit Showcase</h1>
            <p>Collaborative Todo List - Local-first, Real-time, Zero Config</p>
          </div>
          <div className="header-right">
            <div className="stat-badge">
              <span className="stat-label">Room:</span>
              <code>{roomId}</code>
            </div>
            <div className="stat-badge online-badge">
              <div className="online-indicator"></div>
              <span>{onlineUsers.length} online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Left Sidebar - Stats */}
        <aside className="sidebar">
          <div className="panel">
            <h3>📊 Storage Stats</h3>
            <div className="stats-grid">
              <div className="stat">
                <div className="stat-value">{formatBytes(stats.used)}</div>
                <div className="stat-label">Used</div>
              </div>
              <div className="stat">
                <div className="stat-value">{formatBytes(stats.quota)}</div>
                <div className="stat-label">Quota</div>
              </div>
              <div className="stat">
                <div className="stat-value">{totalCount}</div>
                <div className="stat-label">Total Todos</div>
              </div>
              <div className="stat">
                <div className="stat-value">{completedCount}</div>
                <div className="stat-label">Completed</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>👥 Online Users</h3>
            <div className="users-list">
              {onlineUsers.length === 0 ? (
                <p className="empty-state">No other users online</p>
              ) : (
                onlineUsers.map((awarenessState, idx) => (
                  <div key={idx} className="user-item">
                    <div
                      className="user-avatar"
                      style={{ background: awarenessState.state.user.color }}
                    >
                      {awarenessState.state.user.name.charAt(0)}
                    </div>
                    <span className="user-name">{awarenessState.state.user.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <h3>🔗 Share Room</h3>
            <p className="panel-description">Copy this URL to invite collaborators</p>
            <div className="share-input-group">
              <input
                type="text"
                value={shareUrl}
                readOnly
                onClick={(e) => e.target.select()}
                className="share-input"
              />
              <button onClick={copyUrl} className={`copy-btn ${copied ? 'copied' : ''}`}>
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        </aside>

        {/* Main Todo List */}
        <main className="main">
          <div className="panel todo-panel">
            <div className="panel-header">
              <h2>✨ Collaborative Todos</h2>
              <p>Add, complete, or delete todos - watch them sync in real-time!</p>
            </div>

            {/* Add Todo Form */}
            <form onSubmit={addTodo} className="add-todo-form">
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="What needs to be done?"
                className="todo-input"
                autoFocus
              />
              <button type="submit" className="add-btn">
                Add Todo
              </button>
            </form>

            {/* Todo List */}
            <div className="todos-container">
              {todos.length === 0 ? (
                <div className="empty-todos">
                  <p>No todos yet. Add one above!</p>
                  <p className="empty-hint">
                    💡 Open this page in another tab to see real-time collaboration
                  </p>
                </div>
              ) : (
                <ul className="todos-list">
                  {todos.map((todo) => (
                    <li key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
                      <div className="todo-content">
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => toggleTodo(todo.id)}
                          className="todo-checkbox"
                        />
                        <div className="todo-text-container">
                          <span className="todo-text">{todo.text}</span>
                          <span className="todo-meta">
                            by {todo.createdBy} · {new Date(todo.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTodo(todo.id)}
                        className="delete-btn"
                        title="Delete todo"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Features Section */}
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h4>Real-time Sync</h4>
              <p>Changes appear instantly across all connected devices</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h4>Local-first</h4>
              <p>Works offline, syncs when reconnected. Your data stays on your device</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🚫</div>
              <h4>Conflict-free</h4>
              <p>Multiple users can edit simultaneously without overwrites</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💾</div>
              <h4>OPFS Storage</h4>
              <p>2-4x faster than IndexedDB, immune to Safari's 7-day eviction</p>
            </div>
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>
          Built with ❤️ using SyncKit -
          <a href="https://github.com/Dancode-188/synckit" target="_blank" rel="noopener noreferrer">
            {' '}⭐ Star on GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}

// Wrap TodoApp with SyncProvider
export default function App() {
  const [synckitInstance, setSynckitInstance] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Create and initialize SyncKit instance
    const clientId = getClientId()

    // Try to use OPFS if available, fallback to IndexedDB
    const storageType = (navigator.storage && navigator.storage.getDirectory) ? 'opfs' : 'indexeddb'

    const synckit = new SyncKit({
      clientId,
      storage: storageType
    })

    synckit.init().then(() => {
      console.log(`✅ SyncKit initialized with ${storageType} storage`)
      setSynckitInstance(synckit)
    }).catch((err) => {
      console.error('Failed to initialize SyncKit:', err)
      setError(err.message)
    })

    return () => {
      // Cleanup if needed
    }
  }, [])

  // Show error state
  if (error) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <h2>❌ Initialization Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  // Show loading state while initializing
  if (!synckitInstance) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <h2>Loading SyncKit...</h2>
          <p>Initializing WASM and storage...</p>
        </div>
      </div>
    )
  }

  return (
    <SyncProvider synckit={synckitInstance}>
      <TodoApp />
    </SyncProvider>
  )
}
