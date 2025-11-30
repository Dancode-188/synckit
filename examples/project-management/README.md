# Project Management Application

A production-ready project management application built with SyncKit, React, and shadcn/ui. This example demonstrates offline-first task management, real-time team collaboration, and conflict-free synchronization in a real-world application.

![Bundle Size](https://img.shields.io/badge/bundle-~451KB%20uncompressed%20|%20~164KB%20gzipped-success)
![SyncKit](https://img.shields.io/badge/synckit-~59KB%20gzipped-brightgreen)
![React](https://img.shields.io/badge/react-18.2-blue)
![TypeScript](https://img.shields.io/badge/typescript-5.0-blue)
![Tailwind](https://img.shields.io/badge/tailwind-3.4-38bdf8)

## Features

### Core Capabilities

- **Kanban Board**: Drag-and-drop task management with four columns (To Do, In Progress, Review, Done)
- **Offline-First**: Create, edit, and organize tasks completely offline
- **Real-time Collaboration**: See team members' changes instantly when online
- **Multi-Project Support**: Organize tasks across unlimited projects
- **Task Management**: Full CRUD operations with rich metadata (priority, tags, assignees, due dates)
- **Team Presence**: Live indicators showing active team members
- **Conflict Resolution**: Automatic merging of concurrent edits without data loss
- **Persistent Storage**: All data saved to IndexedDB for instant load times

### Technical Highlights

- **Production-Ready UI**: Built with shadcn/ui components and Tailwind CSS
- **Drag-and-Drop**: Powered by @dnd-kit for smooth, accessible interactions
- **Type-Safe**: Full TypeScript coverage throughout the codebase
- **Lightweight State**: Zustand (3KB) for UI state management
- **Optimized Bundle**: ~164KB gzipped (including all dependencies)
- **Full-Featured**: Uses SyncKit default (~59 KB gzipped) - all features included
- **Responsive Design**: Works seamlessly on desktop and mobile

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app will be available at `http://localhost:5173`.

## Architecture

### Component Structure

```
src/
├── components/
│   ├── ui/                  # shadcn/ui components
│   │   ├── button.tsx       # Button component with variants
│   │   ├── card.tsx         # Card component for containers
│   │   ├── badge.tsx        # Badge for tags and priorities
│   │   ├── input.tsx        # Form input component
│   │   └── textarea.tsx     # Textarea component
│   ├── Header.tsx           # Top navigation with project info
│   ├── Sidebar.tsx          # Project list and management
│   ├── KanbanBoard.tsx      # Main board with drag-and-drop
│   ├── TaskCard.tsx         # Individual task display
│   ├── TaskModal.tsx        # Task creation/editing modal
│   └── TeamPresence.tsx     # Live team member list
├── lib/
│   └── utils.ts             # Utility functions
├── store.ts                 # Zustand state management
├── types.ts                 # TypeScript interfaces
├── App.tsx                  # Main application component
└── main.tsx                 # Entry point
```

### Data Models

#### Task

```typescript
interface Task {
  id: string
  title: string
  description: string
  status: 'todo' | 'in-progress' | 'review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assigneeId: string | null
  projectId: string
  createdAt: number
  updatedAt: number
  dueDate: number | null
  tags: string[]
  order: number
}
```

#### Project

```typescript
interface Project {
  id: string
  name: string
  description: string
  color: string
  createdAt: number
  updatedAt: number
  archived: boolean
}
```

#### TeamMember

```typescript
interface TeamMember {
  id: string
  name: string
  email: string
  avatar: string
  color: string
  lastSeen: number
}
```

### State Management

This example uses a hybrid approach:

**Zustand** (UI State):
- Active project selection
- Sidebar open/closed state
- Modal visibility
- Connection status
- Team member presence

**SyncKit** (Data State):
- All tasks (CRUD operations)
- All projects (CRUD operations)
- Real-time synchronization
- Conflict resolution
- Persistence to IndexedDB

This separation keeps UI state ephemeral and fast while ensuring all data operations are persistent and synchronized.

### SyncKit Integration

#### Persistent Task Loading

On app initialization, tasks are loaded from IndexedDB storage:

```typescript
// App.tsx:21-75
useEffect(() => {
  const initializeApp = async () => {
    await sync.init()
    await loadTasksFromStorage()  // Load all persisted tasks
    setSyncReady(true)
  }

  const loadTasksFromStorage = async () => {
    // Get task IDs from localStorage
    const taskIds = JSON.parse(localStorage.getItem('synckit-task-ids') || '[]')

    // Load each task from IndexedDB
    const loadedTasks = []
    for (const taskId of taskIds) {
      const doc = sync.document(taskId)
      await doc.init()  // Loads from IndexedDB and subscribes to updates
      loadedTasks.push(doc.get())
    }

    // Merge with hardcoded tasks and add user-created tasks
    useStore.setState({ tasks: mergedTasks })
  }

  initializeApp()
}, [])
```

When tasks are created or deleted, their IDs are saved to localStorage (see TaskModal.tsx:91-113, 129-148). This allows the app to know which tasks exist and load them on the next session.

#### Task Synchronization

Every task is a SyncKit document that automatically syncs:

```typescript
// Create task (Sidebar.tsx:28-44)
const handleCreateTask = () => {
  const task: Task = {
    id: `task-${Date.now()}`,
    title: 'New task',
    status: 'todo',
    // ... more fields
  }

  // Save to SyncKit
  const doc = sync.document<Task>(task.id)
  doc.set(task)

  // Update local state
  addTask(task)
}
```

#### Real-time Updates

Subscribe to task changes to receive real-time updates:

```typescript
// KanbanBoard.tsx:48-61
useEffect(() => {
  const taskDocs = tasks.map((task) => {
    const doc = sync.document<Task>(task.id)
    return doc.subscribe((updatedTask) => {
      if (updatedTask) {
        updateTask(task.id, updatedTask)
      }
    })
  })

  return () => taskDocs.forEach((unsubscribe) => unsubscribe())
}, [tasks])
```

#### Drag-and-Drop Sync

When a task is dragged to a new column, the change syncs immediately:

```typescript
// KanbanBoard.tsx:76-88
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event

  // Update local state
  moveTask(taskId, newStatus, newOrder)

  // Sync to SyncKit
  const doc = sync.document<Task>(taskId)
  doc.update({ ...task, status: newStatus, updatedAt: Date.now() })
}
```

## Configuration

### Local-Only Mode (Default)

By default, the app runs offline-first with IndexedDB:

```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
})
```

### Collaborative Mode

Enable real-time team collaboration by adding a server URL:

```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
  serverUrl: 'ws://localhost:8080', // SyncKit sync server
})
```

Then start the sync server:

```bash
cd ../../server/node
npm install
npm start
```

### Customization

#### Change Color Scheme

Edit `tailwind.config.js` to customize the color palette:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      // ... more colors
    },
  },
}
```

Then update CSS variables in `src/index.css`:

```css
:root {
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
}
```

#### Add Custom Task Fields

1. Update the `Task` interface in `types.ts`
2. Add form fields in `TaskModal.tsx`
3. Display the field in `TaskCard.tsx`
4. SyncKit will automatically sync the new fields

## How It Works

### Offline-First Workflow

```
User creates/edits task
       ↓
Optimistic UI update (instant feedback)
       ↓
Write to IndexedDB (persistent storage)
       ↓
Update SyncKit document
       ↓
(If online) Sync to server in background
       ↓
Server broadcasts to other clients
       ↓
Other clients merge changes automatically
```

### Conflict Resolution Example

**Scenario**: Two team members edit the same task offline

**User A** (offline):
- Changes task title to "Fix authentication bug"
- Changes priority to "urgent"
- Timestamp: 1700000000

**User B** (offline):
- Changes task description to "Add unit tests"
- Changes status to "in-progress"
- Timestamp: 1700000100

**When both come online**:

SyncKit uses Last-Write-Wins (LWW) strategy with field-level granularity:

Final merged state:
```typescript
{
  title: "Fix authentication bug",        // From User A
  description: "Add unit tests",          // From User B
  priority: "urgent",                     // From User A
  status: "in-progress",                  // From User B (later timestamp)
  updatedAt: 1700000100                   // Latest timestamp
}
```

**No data loss, no conflicts, deterministic merge.**

### Drag-and-Drop Implementation

Uses @dnd-kit for accessible, performant drag-and-drop:

1. **DndContext** wraps the entire board
2. **SortableContext** wraps each column
3. **useSortable** hook in TaskCard handles dragging
4. **DragOverlay** shows the card being dragged
5. **onDragEnd** updates both local state and SyncKit

## Bundle Analysis

### Why SyncKit?

This project management app needs offline-first sync with real-time collaboration. SyncKit provides:
- ✅ Document sync (LWW)
- ✅ Conflict resolution
- ✅ Offline-first architecture
- ✅ Real-time collaboration
- ✅ All features in ~59 KB gzipped

**Full-featured and lightweight** - best of both worlds.

### Production Bundle Size

```
Component                    Uncompressed    Gzipped
────────────────────────────────────────────────────
React 18 + ReactDOM              142 KB       45 KB
@dnd-kit/*                        80 KB       28 KB
SyncKit (WASM + SDK)             138 KB       59 KB
shadcn/ui components              35 KB       12 KB
Tailwind CSS                      25 KB       10 KB
Zustand                            9 KB        3 KB
Application Code                  22 KB        8 KB
────────────────────────────────────────────────────
Total                           ~451 KB     ~164 KB
```

### Size-Critical Apps?

**Need smaller bundle?** Use SyncKit Lite (~45 KB gzipped):
```typescript
import { SyncKit } from '@synckit-js/sdk/lite'  // Local-only, ~45 KB gzipped
```

**Trade-off:** No server sync (local-only mode). For most apps, the 13 KB difference isn't worth losing server sync.

### Why These Choices?

- **@dnd-kit** (~28KB) vs react-beautiful-dnd (82KB): 66% smaller, better accessibility
- **shadcn/ui** (~12KB): Copy-paste components, no runtime library overhead
- **Zustand** (~3KB) vs Redux (20KB): 85% smaller, simpler API
- **SyncKit** (~59KB gzipped): Full offline-first capabilities with WASM portability

## Advanced Features

### Multi-user Presence

Track active team members in real-time:

```typescript
const { teamMembers, currentUser } = useStore()

// Filter active members (seen in last 30 seconds)
const activeMembers = Array.from(teamMembers.values())
  .filter((m) => Date.now() - m.lastSeen < 30000)
```

### Task Filtering

Add filtering by priority, assignee, or tags:

```typescript
const [filter, setFilter] = useState<{
  priority?: TaskPriority
  assigneeId?: string
  tags?: string[]
}>({})

const filteredTasks = tasks.filter((task) => {
  if (filter.priority && task.priority !== filter.priority) return false
  if (filter.assigneeId && task.assigneeId !== filter.assigneeId) return false
  if (filter.tags && !filter.tags.some(tag => task.tags.includes(tag))) return false
  return true
})
```

### Task Search

Implement full-text search across tasks:

```typescript
const [searchQuery, setSearchQuery] = useState('')

const searchResults = tasks.filter((task) =>
  task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
  task.description.toLowerCase().includes(searchQuery.toLowerCase())
)
```

### Keyboard Shortcuts

Add productivity shortcuts:

```typescript
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      openTaskModal(null) // Cmd/Ctrl + N to create task
    }
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      // Open command palette
    }
  }

  window.addEventListener('keydown', handleKeyPress)
  return () => window.removeEventListener('keydown', handleKeyPress)
}, [])
```

## Production Deployment

### Build Optimization

The `vite.config.ts` is already optimized:

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'dnd-kit': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        'vendor': ['react', 'react-dom', 'zustand', 'date-fns'],
      },
    },
  },
}
```

This creates optimal chunks for caching:
- **dnd-kit.js**: Drag-and-drop library (changes rarely)
- **vendor.js**: React + dependencies (stable)
- **index.js**: Application code (changes frequently)

### Deployment Options

**Static Hosting** (local-only mode):
- Vercel, Netlify, Cloudflare Pages
- Zero configuration required
- Perfect for personal use or small teams

**With Sync Server** (collaborative mode):
- Frontend: Any static host (Vercel, Netlify, etc.)
- Backend: Deploy SyncKit server to Railway, Fly.io, DigitalOcean
- Use `wss://` (secure WebSocket) in production

### Environment Configuration

```bash
# .env.production
VITE_SYNCKIT_SERVER=wss://sync.yourdomain.com
VITE_APP_NAME=My Project Manager
```

```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
  serverUrl: import.meta.env.VITE_SYNCKIT_SERVER,
})
```

## Troubleshooting

### Tasks Not Syncing

**Check connection status**: Look at the status indicator in the header
- Green = Connected and syncing
- Yellow = Connecting/Reconnecting
- Red = Offline (local-only mode)

**Verify server**: Ensure sync server is running and accessible

### Drag-and-Drop Not Working

**Check browser compatibility**: @dnd-kit requires modern browsers (Chrome 90+, Firefox 88+, Safari 14+)

**Pointer events**: Ensure no CSS is blocking pointer events on task cards

### Performance Issues with Many Tasks

**Enable virtualization** for large boards (100+ tasks per column):

```bash
npm install react-virtual
```

```typescript
import { useVirtual } from 'react-virtual'

const parentRef = useRef<HTMLDivElement>(null)
const rowVirtualizer = useVirtual({
  size: columnTasks.length,
  parentRef,
  estimateSize: useCallback(() => 100, []),
})
```

### IndexedDB Quota Exceeded

**Check storage usage**:

```typescript
if ('storage' in navigator && 'estimate' in navigator.storage) {
  const estimate = await navigator.storage.estimate()
  console.log(`Using ${estimate.usage} of ${estimate.quota} bytes`)
}
```

**Request persistent storage**:

```typescript
if ('storage' in navigator && 'persist' in navigator.storage) {
  const isPersisted = await navigator.storage.persist()
  console.log(`Persistent storage granted: ${isPersisted}`)
}
```

## Learn More

- **SyncKit Documentation**: `../../docs/README.md`
- **Getting Started Guide**: `../../docs/guides/getting-started.md`
- **Offline-First Patterns**: `../../docs/guides/offline-first.md`
- **Conflict Resolution**: `../../docs/guides/conflict-resolution.md`
- **API Reference**: `../../docs/api/sdk.md`

## License

This example is part of the SyncKit project and is licensed under the MIT License.
