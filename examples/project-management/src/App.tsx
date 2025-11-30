import { useEffect, useState } from 'react'
// Default variant (49 KB) - full-featured, perfect for production apps
import { SyncKit } from '@synckit-js/sdk'
import { SyncProvider } from '@synckit-js/sdk/react'
import { useStore } from './store'
import type { Task } from './types'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import KanbanBoard from './components/KanbanBoard'
import TaskModal from './components/TaskModal'
import TeamPresence from './components/TeamPresence'

// Initialize SyncKit
const sync = new SyncKit({
  storage: 'indexeddb',
  serverUrl: 'ws://localhost:8080/ws', // Server sync enabled for testing
})

function App() {
  const { sidebarOpen, taskModalOpen } = useStore()
  const [syncReady, setSyncReady] = useState(false)

  // Initialize SyncKit and load tasks from storage
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await sync.init()

        // Load all tasks from IndexedDB
        await loadTasksFromStorage()

        setSyncReady(true)
      } catch (error) {
        console.error('Failed to initialize SyncKit:', error)
        setSyncReady(true) // Still render the app in offline-only mode
      }
    }

    // Function to load all persisted tasks from IndexedDB
    const loadTasksFromStorage = async () => {
      // Get list of known task IDs from localStorage
      const taskIds = getKnownTaskIds()

      const loadedTasks: any[] = []

      for (const taskId of taskIds) {
        try {
          const doc = sync.document(taskId)
          await doc.init()
          const taskData = doc.get()

          // Only add if it has valid data
          if (taskData && Object.keys(taskData).length > 0) {
            loadedTasks.push(taskData)
          }
        } catch (error) {
          console.warn(`Failed to load task ${taskId}:`, error)
        }
      }

      // Merge loaded tasks with hardcoded tasks
      // This ensures hardcoded tasks are always present, but uses saved versions if available
      const currentTasks = useStore.getState().tasks
      const mergedTasks = currentTasks.map(task => {
        const loaded = loadedTasks.find((t: any) => t.id === task.id)
        return loaded || task
      })

      // Add any new user-created tasks that weren't in the hardcoded list
      loadedTasks.forEach(task => {
        if (!mergedTasks.find(t => t.id === task.id)) {
          mergedTasks.push(task)
        }
      })

      useStore.setState({ tasks: mergedTasks })
    }

    // Get list of all known task IDs from localStorage
    const getKnownTaskIds = (): string[] => {
      const stored = localStorage.getItem('synckit-task-ids')
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch {
          return getDefaultTaskIds()
        }
      }
      return getDefaultTaskIds()
    }

    // Get default task IDs (the hardcoded ones)
    const getDefaultTaskIds = (): string[] => {
      return ['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6']
    }

    // Listen for new tasks created in other tabs (cross-tab sync)
    const handleStorageChange = async (event: StorageEvent) => {
      // Only handle changes to task IDs
      if (event.key !== 'synckit-task-ids') return

      const newTaskIds = event.newValue ? JSON.parse(event.newValue) : []
      const oldTaskIds = event.oldValue ? JSON.parse(event.oldValue) : []

      // Find newly added task IDs
      const addedTaskIds = newTaskIds.filter((id: string) => !oldTaskIds.includes(id))

      // Notify about new task IDs so components can subscribe
      for (const taskId of addedTaskIds) {
        try {
          const doc = sync.document<Task>(taskId)
          await doc.init()

          // Check if data already exists locally
          const existingData = doc.get()

          if (existingData && Object.keys(existingData).length > 0) {
            // Data already here - add to store immediately
            const currentTasks = useStore.getState().tasks
            if (!currentTasks.find(t => t.id === taskId)) {
              useStore.setState({ tasks: [...currentTasks, existingData as Task] })
              // Dispatch event so KanbanBoard can subscribe
              window.dispatchEvent(new CustomEvent('synckit:newtask', { detail: { taskId, taskData: existingData } }))
            }
          } else {
            // Data not here yet - will arrive from server via subscription
            // Dispatch event with just taskId so KanbanBoard subscribes and waits for data
            window.dispatchEvent(new CustomEvent('synckit:newtask', { detail: { taskId, taskData: { id: taskId, projectId: 'project-1' } } }))
          }
        } catch (error) {
          console.warn(`Failed to load new task ${taskId} from other tab:`, error)
        }
      }
    }

    // Register storage event listener (fires when localStorage changes in OTHER tabs)
    window.addEventListener('storage', handleStorageChange)

    initializeApp()

    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  if (!syncReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-lg">Initializing...</div>
        </div>
      </div>
    )
  }

  return (
    <SyncProvider synckit={sync}>
      <div className="flex h-screen overflow-hidden bg-background">
        {sidebarOpen && <Sidebar sync={sync} />}

        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />

          <main className="flex-1 overflow-hidden p-6">
            <div className="relative h-full">
              <KanbanBoard sync={sync} />
              <TeamPresence />
            </div>
          </main>
        </div>

        {taskModalOpen && <TaskModal sync={sync} />}
      </div>
    </SyncProvider>
  )
}

export default App
