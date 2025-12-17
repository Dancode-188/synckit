# Counter & Set API Reference

**Production-ready distributed data structures for collaborative applications**

SyncKit v0.2.0 includes two additional CRDTs for common use cases: Counters for increment/decrement operations (likes, votes, inventory) and Sets for managing collections (tags, participants, selections).

---

## Table of Contents

1. [PN-Counter (Increment/Decrement)](#pn-counter-incrementdecrement)
2. [OR-Set (Add/Remove)](#or-set-addremove)
3. [Complete Examples](#complete-examples)
4. [TypeScript Types](#typescript-types)
5. [Performance & Best Practices](#performance--best-practices)

---

## PN-Counter (Increment/Decrement)

**PN-Counter** (Positive-Negative Counter) is a conflict-free replicated data type that allows multiple clients to increment and decrement a shared counter without conflicts.

### When to Use

**Perfect for:**
- Like/upvote buttons
- View counters
- Inventory tracking (stock levels)
- Vote tallying
- Download counters
- Concurrent user counts

**How it works:** Each client maintains separate increment and decrement counts. The final value is the sum of all increments minus all decrements across all clients. This ensures eventual consistency without conflicts.

---

### Core API

#### Basic Counter

```typescript
import { SyncCounter } from '@synckit-js/sdk'

const sync = new SyncKit({ storage: 'indexeddb' })
await sync.init()

// Create or get counter
const likesCounter = sync.counter('likes-post-123')

// Subscribe to changes
likesCounter.subscribe((value) => {
  console.log('Likes:', value)
  updateUI(value)
})

// Increment by 1 (default)
await likesCounter.increment()

// Increment by N
await likesCounter.increment(5)

// Decrement by 1 (default)
await likesCounter.decrement()

// Decrement by N
await likesCounter.decrement(3)

// Get current value
const currentCount = likesCounter.get()

// Reset to zero (use with caution - see notes below)
await likesCounter.reset()
```

**Important:** `reset()` should be used carefully as it clears the counter's history. In a distributed system, prefer setting counters to specific values by calculating the delta rather than resetting.

---

### React Hook: `useCounter`

```typescript
import { useCounter } from '@synckit-js/sdk/react'

function LikeButton({ postId }: { postId: string }) {
  const [likes, { increment, decrement, reset }] = useCounter(`likes-${postId}`)

  return (
    <div className="like-button">
      <button onClick={() => increment()}>
        👍 {likes}
      </button>
      <button onClick={() => decrement()}>
        👎
      </button>
    </div>
  )
}
```

**API Signature:**
```typescript
function useCounter(id: string): [
  number,  // Current count
  {
    increment: (delta?: number) => Promise<void>
    decrement: (delta?: number) => Promise<void>
    reset: () => Promise<void>
  }
]
```

---

### Vue Composable: `useCounter`

```vue
<script setup lang="ts">
import { useCounter } from '@synckit-js/sdk/vue'

const { count, increment, decrement } = useCounter('vote-count')
</script>

<template>
  <div class="vote-counter">
    <button @click="decrement()">-</button>
    <span class="count">{{ count }}</span>
    <button @click="increment()">+</button>
  </div>
</template>

<style scoped>
.count {
  font-size: 2rem;
  margin: 0 1rem;
  min-width: 3rem;
  text-align: center;
}
</style>
```

**API Signature:**
```typescript
function useCounter(id: string): {
  count: Ref<number>
  increment: (delta?: number) => Promise<void>
  decrement: (delta?: number) => Promise<void>
  reset: () => Promise<void>
}
```

---

### Svelte Store: `counterStore`

```svelte
<script lang="ts">
  import { counterStore } from '@synckit-js/sdk/svelte'

  const likes = counterStore('likes')
</script>

<div class="counter">
  <button onclick={() => likes.increment()}>
    👍 {$likes}
  </button>
  <button onclick={() => likes.decrement()}>
    Remove Like
  </button>
</div>
```

**API Signature:**
```typescript
function counterStore(id: string): {
  subscribe: (callback: (value: number) => void) => Unsubscribe
  increment: (delta?: number) => Promise<void>
  decrement: (delta?: number) => Promise<void>
  reset: () => Promise<void>
}
```

---

### Counter Methods Reference

```typescript
class SyncCounter {
  // Subscribe to counter changes
  subscribe(callback: (value: number) => void): () => void

  // Increment counter by delta (default: 1)
  increment(delta?: number): Promise<void>

  // Decrement counter by delta (default: 1)
  decrement(delta?: number): Promise<void>

  // Get current value (synchronous)
  get(): number

  // Reset counter to zero
  // WARNING: Loses history - use carefully in distributed scenarios
  reset(): Promise<void>

  // Get counter ID
  readonly id: string
}
```

---

## OR-Set (Add/Remove)

**OR-Set** (Observed-Remove Set) is a conflict-free replicated data type that allows multiple clients to add and remove items from a shared set without conflicts.

### When to Use

**Perfect for:**
- Tag systems
- Participant lists (users in a room)
- Selected items (multi-select)
- Feature flags
- Permission sets
- Shopping cart items
- Playlist tracks

**How it works:** Each added item gets a unique ID. Removes are tracked separately. An item is in the set if it has at least one add operation without a corresponding remove. This ensures eventual consistency when multiple clients add/remove concurrently.

---

### Core API

#### Basic Set

```typescript
import { SyncSet } from '@synckit-js/sdk'

const sync = new SyncKit({ storage: 'indexeddb' })
await sync.init()

// Create or get set
const tags = sync.set<string>('tags-post-123')

// Subscribe to changes
tags.subscribe((items) => {
  console.log('Tags:', Array.from(items))
  renderTags(items)
})

// Add single item
await tags.add('important')

// Add multiple items
await tags.addAll(['urgent', 'review', 'bug'])

// Remove item
await tags.remove('important')

// Check membership
const hasTag = tags.has('urgent')  // true

// Get all items (returns Set<T>)
const allTags = tags.get()
console.log('Count:', allTags.size)

// Iterate
for (const tag of allTags) {
  console.log(tag)
}

// Clear all items
await tags.clear()
```

---

### React Hook: `useSet`

```typescript
import { useSet } from '@synckit-js/sdk/react'

function TagManager({ documentId }: { documentId: string }) {
  const [tags, { add, remove, has, clear }] = useSet<string>(`tags-${documentId}`)
  const [newTag, setNewTag] = useState('')

  const handleAdd = () => {
    if (newTag.trim()) {
      add(newTag.trim())
      setNewTag('')
    }
  }

  return (
    <div className="tag-manager">
      <div className="tags">
        {Array.from(tags).map(tag => (
          <span key={tag} className="tag">
            {tag}
            <button onClick={() => remove(tag)}>×</button>
          </span>
        ))}
      </div>

      <div className="add-tag">
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add tag..."
        />
        <button onClick={handleAdd}>Add</button>
      </div>

      {tags.size > 0 && (
        <button onClick={() => clear()}>Clear All</button>
      )}
    </div>
  )
}
```

**API Signature:**
```typescript
function useSet<T>(id: string): [
  Set<T>,  // Current set items
  {
    add: (item: T) => Promise<void>
    addAll: (items: T[]) => Promise<void>
    remove: (item: T) => Promise<void>
    has: (item: T) => boolean
    clear: () => Promise<void>
  }
]
```

---

### Vue Composable: `useSet`

```vue
<script setup lang="ts">
import { useSet } from '@synckit-js/sdk/vue'
import { ref } from 'vue'

const { items, add, remove, has } = useSet<string>('participants')
const newParticipant = ref('')

function addParticipant() {
  if (newParticipant.value.trim()) {
    add(newParticipant.value.trim())
    newParticipant.value = ''
  }
}
</script>

<template>
  <div class="participants">
    <h3>Participants ({{ items.size }})</h3>

    <ul>
      <li v-for="participant in items" :key="participant">
        {{ participant }}
        <button @click="remove(participant)">Remove</button>
      </li>
    </ul>

    <div class="add-participant">
      <input
        v-model="newParticipant"
        @keyup.enter="addParticipant"
        placeholder="Add participant..."
      />
      <button @click="addParticipant">Add</button>
    </div>
  </div>
</template>
```

**API Signature:**
```typescript
function useSet<T>(id: string): {
  items: Ref<Set<T>>
  add: (item: T) => Promise<void>
  addAll: (items: T[]) => Promise<void>
  remove: (item: T) => Promise<void>
  has: (item: T) => boolean
  clear: () => Promise<void>
}
```

---

### Svelte Store: `setStore`

```svelte
<script lang="ts">
  import { setStore } from '@synckit-js/sdk/svelte'

  const selectedItems = setStore<string>('selection')

  function toggleItem(item: string) {
    if ($selectedItems.has(item)) {
      selectedItems.remove(item)
    } else {
      selectedItems.add(item)
    }
  }
</script>

<div class="item-list">
  {#each items as item}
    <button
      class:selected={$selectedItems.has(item)}
      onclick={() => toggleItem(item)}
    >
      {item}
      {#if $selectedItems.has(item)}✓{/if}
    </button>
  {/each}

  <p>Selected: {$selectedItems.size}</p>
</div>

<style>
  .selected {
    background: #4caf50;
    color: white;
  }
</style>
```

**API Signature:**
```typescript
function setStore<T>(id: string): {
  subscribe: (callback: (items: Set<T>) => void) => Unsubscribe
  add: (item: T) => Promise<void>
  addAll: (items: T[]) => Promise<void>
  remove: (item: T) => Promise<void>
  has: (item: T) => boolean
  clear: () => Promise<void>
}
```

---

### Set Methods Reference

```typescript
class SyncSet<T> {
  // Subscribe to set changes
  subscribe(callback: (items: Set<T>) => void): () => void

  // Add single item
  add(item: T): Promise<void>

  // Add multiple items
  addAll(items: T[]): Promise<void>

  // Remove item
  remove(item: T): Promise<void>

  // Check if item exists
  has(item: T): boolean

  // Get all items (synchronous)
  get(): Set<T>

  // Get size
  size(): number

  // Clear all items
  clear(): Promise<void>

  // Get set ID
  readonly id: string
}
```

---

## Complete Examples

### Example 1: Like Counter with Analytics

```typescript
import { useCounter } from '@synckit-js/sdk/react'
import { useEffect } from 'react'

function LikeButtonWithAnalytics({ postId }: { postId: string }) {
  const [likes, { increment }] = useCounter(`likes-${postId}`)

  useEffect(() => {
    // Track likes in analytics
    if (likes > 0) {
      analytics.track('post_likes_updated', {
        postId,
        likes,
        timestamp: Date.now()
      })
    }
  }, [likes, postId])

  return (
    <button
      onClick={() => increment()}
      className={likes > 0 ? 'liked' : ''}
    >
      ❤️ {likes > 0 ? likes : 'Like'}
    </button>
  )
}
```

---

### Example 2: Inventory Counter

```typescript
import { useCounter } from '@synckit-js/sdk/react'

function InventoryManager({ productId }: { productId: string }) {
  const [stock, { increment, decrement }] = useCounter(`inventory-${productId}`)

  const addStock = (quantity: number) => increment(quantity)
  const removeStock = (quantity: number) => decrement(quantity)

  return (
    <div className="inventory">
      <h3>Stock Level: {stock}</h3>

      <div className="controls">
        <button onClick={() => addStock(1)}>+1</button>
        <button onClick={() => addStock(10)}>+10</button>
        <button onClick={() => addStock(100)}>+100</button>
      </div>

      <div className="controls">
        <button onClick={() => removeStock(1)} disabled={stock < 1}>-1</button>
        <button onClick={() => removeStock(10)} disabled={stock < 10}>-10</button>
      </div>

      {stock <= 5 && stock > 0 && (
        <p className="warning">⚠️ Low stock!</p>
      )}

      {stock === 0 && (
        <p className="error">❌ Out of stock</p>
      )}
    </div>
  )
}
```

---

### Example 3: Tag System with Autocomplete

```typescript
import { useSet } from '@synckit-js/sdk/react'
import { useState } from 'react'

function TagEditor({ documentId }: { documentId: string }) {
  const [tags, { add, remove }] = useSet<string>(`tags-${documentId}`)
  const [input, setInput] = useState('')

  // Common tags for autocomplete
  const commonTags = ['bug', 'feature', 'documentation', 'urgent', 'review']

  const suggestions = commonTags.filter(tag =>
    !tags.has(tag) && tag.includes(input.toLowerCase())
  )

  return (
    <div className="tag-editor">
      <div className="tags">
        {Array.from(tags).map(tag => (
          <span key={tag} className="tag">
            {tag}
            <button onClick={() => remove(tag)}>×</button>
          </span>
        ))}
      </div>

      <div className="input-container">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              add(input.trim().toLowerCase())
              setInput('')
            }
          }}
          placeholder="Add tag..."
        />

        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map(tag => (
              <button
                key={tag}
                onClick={() => {
                  add(tag)
                  setInput('')
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

### Example 4: Multi-User Selection

```typescript
import { useSet } from '@synckit-js/sdk/react'

interface Item {
  id: string
  name: string
}

function CollaborativeSelection({ roomId, items }: { roomId: string; items: Item[] }) {
  const [selectedIds, { add, remove, has }] = useSet<string>(`selection-${roomId}`)

  const toggleSelection = (itemId: string) => {
    if (has(itemId)) {
      remove(itemId)
    } else {
      add(itemId)
    }
  }

  return (
    <div className="selection-grid">
      {items.map(item => (
        <div
          key={item.id}
          className={`item ${has(item.id) ? 'selected' : ''}`}
          onClick={() => toggleSelection(item.id)}
        >
          <div className="checkbox">
            {has(item.id) && '✓'}
          </div>
          <div className="name">{item.name}</div>
        </div>
      ))}

      <div className="selection-summary">
        Selected: {selectedIds.size} / {items.length}
      </div>
    </div>
  )
}
```

---

### Example 5: Voting System

```typescript
import { useCounter, useSet } from '@synckit-js/sdk/react'

function VotingPoll({ pollId }: { pollId: string }) {
  const [upvotes, { increment: upvote }] = useCounter(`upvotes-${pollId}`)
  const [downvotes, { increment: downvote }] = useCounter(`downvotes-${pollId}`)
  const [voters, { add: addVoter, has: hasVoted }] = useSet<string>(`voters-${pollId}`)

  const userId = getCurrentUserId()
  const userHasVoted = hasVoted(userId)

  const handleVote = async (type: 'up' | 'down') => {
    if (userHasVoted) return

    if (type === 'up') {
      await upvote()
    } else {
      await downvote()
    }

    await addVoter(userId)
  }

  const total = upvotes + downvotes
  const upvotePercent = total > 0 ? (upvotes / total) * 100 : 0

  return (
    <div className="poll">
      <div className="vote-buttons">
        <button
          onClick={() => handleVote('up')}
          disabled={userHasVoted}
        >
          👍 {upvotes}
        </button>
        <button
          onClick={() => handleVote('down')}
          disabled={userHasVoted}
        >
          👎 {downvotes}
        </button>
      </div>

      <div className="results">
        <div className="bar">
          <div
            className="fill"
            style={{ width: `${upvotePercent}%` }}
          />
        </div>
        <p>
          {upvotePercent.toFixed(1)}% approval ({voters.size} votes)
        </p>
      </div>

      {userHasVoted && (
        <p className="voted-message">✓ You've voted</p>
      )}
    </div>
  )
}
```

---

## TypeScript Types

### Counter Types

```typescript
// Counter instance
export interface SyncCounter {
  subscribe(callback: (value: number) => void): () => void
  increment(delta?: number): Promise<void>
  decrement(delta?: number): Promise<void>
  get(): number
  reset(): Promise<void>
  readonly id: string
}

// React hook return type
export type UseCounterReturn = [
  number,
  {
    increment: (delta?: number) => Promise<void>
    decrement: (delta?: number) => Promise<void>
    reset: () => Promise<void>
  }
]

// Vue composable return type
export interface UseCounterComposable {
  count: Ref<number>
  increment: (delta?: number) => Promise<void>
  decrement: (delta?: number) => Promise<void>
  reset: () => Promise<void>
}

// Svelte store type
export interface CounterStore {
  subscribe(callback: (value: number) => void): () => void
  increment(delta?: number): Promise<void>
  decrement(delta?: number): Promise<void>
  reset(): Promise<void>
}
```

### Set Types

```typescript
// Set instance
export interface SyncSet<T> {
  subscribe(callback: (items: Set<T>) => void): () => void
  add(item: T): Promise<void>
  addAll(items: T[]): Promise<void>
  remove(item: T): Promise<void>
  has(item: T): boolean
  get(): Set<T>
  size(): number
  clear(): Promise<void>
  readonly id: string
}

// React hook return type
export type UseSetReturn<T> = [
  Set<T>,
  {
    add: (item: T) => Promise<void>
    addAll: (items: T[]) => Promise<void>
    remove: (item: T) => Promise<void>
    has: (item: T) => boolean
    clear: () => Promise<void>
  }
]

// Vue composable return type
export interface UseSetComposable<T> {
  items: Ref<Set<T>>
  add: (item: T) => Promise<void>
  addAll: (items: T[]) => Promise<void>
  remove: (item: T) => Promise<void>
  has: (item: T) => boolean
  clear: () => Promise<void>
}

// Svelte store type
export interface SetStore<T> {
  subscribe(callback: (items: Set<T>) => void): () => void
  add(item: T): Promise<void>
  addAll(items: T[]): Promise<void>
  remove(item: T): Promise<void>
  has(item: T): boolean
  clear(): Promise<void>
}
```

---

## Performance & Best Practices

### Counter Best Practices

**1. Use appropriate delta values**

```typescript
// ❌ Multiple small increments (slower)
for (let i = 0; i < 10; i++) {
  await counter.increment()
}

// ✅ Single increment with delta (faster)
await counter.increment(10)
```

**2. Avoid unnecessary resets**

```typescript
// ❌ Reset loses CRDT history
await counter.reset()

// ✅ Calculate delta to reach target value
const current = counter.get()
const target = 0
const delta = target - current
await counter.decrement(Math.abs(delta))
```

**3. Subscribe once, update reactively**

```typescript
// ✅ Subscribe in useEffect/onMount
useEffect(() => {
  const unsubscribe = counter.subscribe((value) => {
    setCount(value)
  })
  return unsubscribe
}, [counter])
```

---

### Set Best Practices

**1. Use addAll for bulk operations**

```typescript
// ❌ Multiple add calls (slower)
for (const tag of tags) {
  await set.add(tag)
}

// ✅ Single addAll call (faster)
await set.addAll(tags)
```

**2. Use has() before remove to avoid errors**

```typescript
// ✅ Check before removing
if (set.has(item)) {
  await set.remove(item)
}

// Or handle gracefully
try {
  await set.remove(item)
} catch (error) {
  // Item didn't exist
}
```

**3. Convert Set to Array for rendering**

```typescript
// ✅ Convert once
const items = Array.from(set.get())
return items.map(item => <Item key={item} />)
```

**4. Use Set for membership checks**

```typescript
// ✅ O(1) lookup
const isSelected = selectedItems.has(itemId)

// ❌ O(n) lookup with array
const isSelected = selectedArray.includes(itemId)
```

---

### Memory Considerations

**Counters:** Minimal memory overhead (~100 bytes per counter). Safe to create thousands.

**Sets:** Memory scales with number of items. Each item has a unique ID overhead (~50 bytes). For large sets (1000+ items), consider pagination or filtering.

**Cleanup:** CRDTs maintain history for conflict resolution. If you need to reclaim memory for unused counters/sets:

```typescript
// Delete counter/set when no longer needed
await sync.deleteDocument(counterId)
await sync.deleteDocument(setId)
```

---

## Summary

**Counter API:**
- ✅ Conflict-free increment/decrement
- ✅ Perfect for likes, votes, inventory
- ✅ Available in React, Vue, Svelte

**Set API:**
- ✅ Conflict-free add/remove
- ✅ Perfect for tags, selections, participants
- ✅ Available in React, Vue, Svelte

**Both CRDTs:**
- Production-ready in v0.2.0
- Work offline with automatic sync
- Type-safe with full TypeScript support

**Next Steps:**
- [SDK API Documentation](./SDK_API.md) - Complete API reference
- [React Integration](../guides/react-integration.md) - React hooks guide
- [Vue Integration](../guides/vue-integration.md) - Vue composables guide
- [Svelte Integration](../guides/svelte-integration.md) - Svelte stores guide
