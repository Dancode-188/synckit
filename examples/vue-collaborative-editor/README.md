# Vue Collaborative Editor

A real-time collaborative document editor built with SyncKit's Vue 3 adapter. This example demonstrates all the key features of the SyncKit Vue integration.

## Features Demonstrated

### Core Composables
- **useSyncDocument** - Synchronize document state across clients
- **useSyncField** - Track individual document fields
- **provideSyncKit** - Provide SyncKit instance to component tree

### Presence & Awareness
- **usePresence** - Track all users (self + others)
- **useSelf** - Manage current user's presence
- **useOthers** - Filter and display other users

### Network Monitoring
- **useNetworkStatus** - Monitor connection state and sync status

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Testing Collaboration

1. Open the app in your browser
2. Open the same URL in another tab or window
3. Edit your name in the presence bar
4. Watch real-time updates across tabs

## Architecture

### Component Structure

```
App.vue                  # Root component with SyncKit provider
├── PresenceBar.vue     # Shows online users with editable names
├── Editor.vue          # Document editor with title and content
└── StatusBar.vue       # Network status and connection info
```

### State Management

This example uses SyncKit's Vue composables for all state management:

- No Vuex or Pinia needed
- Automatic reactivity through Vue's ref/computed
- Real-time synchronization handled by SyncKit

### Data Flow

1. **SyncKit Provider** - App.vue provides SyncKit instance
2. **Composables** - Components use composables to access shared state
3. **Reactivity** - Vue's reactivity system updates UI automatically
4. **Sync** - SyncKit handles data synchronization

## Key Concepts

### Provide/Inject Pattern

```vue
<script setup>
import { provideSyncKit } from '@synckit-js/sdk/vue'

const synckit = new SyncKit({ name: 'my-app' })
provideSyncKit(synckit)
</script>
```

All child components can now use `useSyncKit()` to access the instance.

### Document Synchronization

```vue
<script setup>
import { useSyncDocument } from '@synckit-js/sdk/vue'

const { data, loading } = useSyncDocument('my-doc')
// data is reactive and syncs automatically
</script>
```

### Presence Tracking

```vue
<script setup>
import { usePresence } from '@synckit-js/sdk/vue'

const { self, others, updatePresence } = usePresence('my-doc', {
  initialState: { name: 'Alice', cursor: { x: 0, y: 0 } }
})
</script>
```

## Storage

This demo uses **IndexedDB storage** for persistent cross-tab synchronization.

Key features:
- Data persists across page refreshes
- Multiple tabs can share the same document
- Changes sync automatically between tabs
- Works entirely offline (no server needed)

## TypeScript Support

All composables are fully typed with TypeScript:

```ts
interface MyDoc {
  title: string
  content: string
}

const { data } = useSyncDocument<MyDoc>('my-doc')
// data.value.title is typed as string
```

## Learn More

- [SyncKit Documentation](../../README.md)
- [Vue Adapter API Reference](../../sdk/src/adapters/vue/README.md)
- [Other Examples](../)

## License

MIT
