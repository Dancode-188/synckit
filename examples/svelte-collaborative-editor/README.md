# Svelte Collaborative Editor

A real-time collaborative document editor built with SyncKit's Svelte 5 adapter. This example demonstrates all the key features of the SyncKit Svelte integration.

## Features Demonstrated

### Core Stores
- **syncDocument** - Synchronize document state across clients
- **syncStatus** - Monitor connection state and sync status
- **setSyncKitContext/getSyncKitContext** - Provide SyncKit instance to component tree

### Presence & Awareness
- **presence** - Track all users (self + others)
- **self** - Manage current user's presence
- **others** - Filter and display other users

### Svelte 5 Runes
All stores expose their state as **reactive rune properties** (`.data`, `.loading`, `.error`, etc.) that work seamlessly with Svelte 5's reactivity system.

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

### Testing Collaboration

1. Open the app in your browser
2. Open the same URL in another tab or window
3. Edit your name in the presence bar
4. Watch real-time updates across tabs

## Architecture

### Component Structure

```
App.svelte              # Root component with SyncKit provider
├── PresenceBar.svelte  # Shows online users with editable names
├── Editor.svelte       # Document editor with title and content
└── StatusBar.svelte    # Network status and connection info
```

### State Management

This example uses SyncKit's Svelte stores for all state management:

- No additional state management library needed
- Automatic reactivity through Svelte 5 runes
- Real-time synchronization handled by SyncKit

### Data Flow

1. **SyncKit Context** - App.svelte provides SyncKit instance via `setSyncKitContext()`
2. **Stores** - Components use stores to access shared state
3. **Reactivity** - Svelte 5's rune properties (`$derived`) update UI automatically
4. **Sync** - SyncKit handles data synchronization

## Key Concepts

### Context Pattern

```svelte
<script lang="ts">
import { setSyncKitContext } from '@synckit-js/sdk/svelte'
import { SyncKit } from '@synckit-js/sdk'

const synckit = new SyncKit({ name: 'my-app' })
setSyncKitContext(synckit)
</script>
```

All child components can now use `getSyncKitContext()` to access the instance.

### Document Synchronization

```svelte
<script lang="ts">
import { getSyncKitContext, syncDocument } from '@synckit-js/sdk/svelte'

const synckit = getSyncKitContext()
const doc = syncDocument(synckit, 'my-doc')

// Access reactive properties
const title = $derived(doc.data?.title)
const isLoading = $derived(doc.loading)
</script>
```

### Presence Tracking

```svelte
<script lang="ts">
import { getSyncKitContext, presence } from '@synckit-js/sdk/svelte'

const synckit = getSyncKitContext()
const { self, others, updatePresence } = presence(synckit, 'my-doc', {
  user: { name: 'Alice', cursor: { x: 0, y: 0 } }
})

// Access reactive rune properties
const currentUser = $derived(self.self)
const otherUsers = $derived(others.others)
</script>
```

## Svelte 5 Runes Integration

All SyncKit stores expose their state as **rune properties** that integrate seamlessly with Svelte 5:

```svelte
<script lang="ts">
const doc = syncDocument(synckit, 'my-doc')

// These are reactive rune properties:
doc.data      // Current document data
doc.loading   // Loading state
doc.error     // Error state

// Use with $derived for computed values
const title = $derived(doc.data?.title || 'Untitled')
</script>

<!-- Use directly in templates -->
{#if doc.loading}
  Loading...
{:else}
  <h1>{doc.data?.title}</h1>
{/if}
```

## Storage

This demo uses **IndexedDB storage** for persistent cross-tab synchronization.

Key features:
- Data persists across page refreshes
- Multiple tabs can share the same document
- Changes sync automatically between tabs
- Works entirely offline (no server needed)

## TypeScript Support

All stores are fully typed with TypeScript:

```ts
interface MyDoc {
  title: string
  content: string
}

const doc = syncDocument<MyDoc>(synckit, 'my-doc')
// doc.data?.title is typed as string | undefined
```

## Learn More

- [SyncKit Documentation](../../README.md)
- [Svelte Adapter API Reference](../../sdk/src/adapters/svelte/README.md)
- [Other Examples](../)

## License

MIT
