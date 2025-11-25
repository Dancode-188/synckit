import { useState, useEffect } from 'react'
import type { SyncKit } from '@synckit/sdk'
import type { Task, TaskPriority, TaskStatus } from '../types'
import { useStore } from '../store'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Card } from './ui/card'
import { X, Trash2 } from 'lucide-react'

interface TaskModalProps {
  sync: SyncKit
}

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
]

const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export default function TaskModal({ sync }: TaskModalProps) {
  const {
    tasks,
    selectedTaskId,
    activeProjectId,
    closeTaskModal,
    addTask,
    updateTask,
    deleteTask,
    currentUser,
  } = useStore()

  const existingTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId)
    : null

  const [title, setTitle] = useState(existingTask?.title || '')
  const [description, setDescription] = useState(existingTask?.description || '')
  const [status, setStatus] = useState<TaskStatus>(existingTask?.status || 'todo')
  const [priority, setPriority] = useState<TaskPriority>(
    existingTask?.priority || 'medium'
  )
  const [tags, setTags] = useState(existingTask?.tags.join(', ') || '')

  useEffect(() => {
    if (existingTask) {
      setTitle(existingTask.title)
      setDescription(existingTask.description)
      setStatus(existingTask.status)
      setPriority(existingTask.priority)
      setTags(existingTask.tags.join(', '))
    }
  }, [existingTask])

  const handleSave = async () => {
    if (!title.trim() || !activeProjectId) return

    const taskData: Task = {
      id: existingTask?.id || `task-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      assigneeId: existingTask?.assigneeId || currentUser.id,
      projectId: activeProjectId,
      createdAt: existingTask?.createdAt || Date.now(),
      updatedAt: Date.now(),
      dueDate: existingTask?.dueDate || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t),
      order: existingTask?.order || 0,
    }

    // Save to SyncKit
    const doc = sync.document<Task>(taskData.id)
    await doc.init()
    await doc.update(taskData)

    if (existingTask) {
      updateTask(taskData.id, taskData)
    } else {
      addTask(taskData)
      // Save task ID to localStorage for persistence
      saveTaskIdToStorage(taskData.id)
    }

    closeTaskModal()
  }

  // Helper function to save task ID to localStorage
  const saveTaskIdToStorage = (taskId: string) => {
    try {
      const stored = localStorage.getItem('synckit-task-ids')
      const taskIds: string[] = stored ? JSON.parse(stored) : []

      if (!taskIds.includes(taskId)) {
        taskIds.push(taskId)
        localStorage.setItem('synckit-task-ids', JSON.stringify(taskIds))
      }
    } catch (error) {
      console.error('Failed to save task ID to localStorage:', error)
    }
  }

  const handleDelete = async () => {
    if (!existingTask) return

    if (confirm('Are you sure you want to delete this task?')) {
      // Delete from SyncKit
      await sync.deleteDocument(existingTask.id)
      deleteTask(existingTask.id)
      // Remove task ID from localStorage
      removeTaskIdFromStorage(existingTask.id)
      closeTaskModal()
    }
  }

  // Helper function to remove task ID from localStorage
  const removeTaskIdFromStorage = (taskId: string) => {
    try {
      const stored = localStorage.getItem('synckit-task-ids')
      if (stored) {
        const taskIds: string[] = JSON.parse(stored)
        const filtered = taskIds.filter(id => id !== taskId)
        localStorage.setItem('synckit-task-ids', JSON.stringify(filtered))
      }
    } catch (error) {
      console.error('Failed to remove task ID from localStorage:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeTaskModal()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={closeTaskModal}
    >
      <Card
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {existingTask ? 'Edit Task' : 'Create Task'}
            </h2>
            <Button variant="ghost" size="icon" onClick={closeTaskModal}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Title</label>
              <Input
                autoFocus
                placeholder="Task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Description
              </label>
              <Textarea
                placeholder="Add a description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Status</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Priority
                </label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                >
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Tags (comma-separated)
              </label>
              <Input
                placeholder="e.g., frontend, bug, urgent"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div>
              {existingTask && (
                <Button variant="destructive" onClick={handleDelete}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={closeTaskModal}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!title.trim()}>
                {existingTask ? 'Save Changes' : 'Create Task'}
              </Button>
            </div>
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            Tip: Press{' '}
            <kbd className="rounded border px-1">Ctrl/Cmd + Enter</kbd> to save,{' '}
            <kbd className="rounded border px-1">Esc</kbd> to cancel
          </div>
        </div>
      </Card>
    </div>
  )
}
