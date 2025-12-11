/**
 * usePresence composable
 * Manage user presence and awareness state
 * @module adapters/vue/composables/usePresence
 */

import { ref, readonly, computed, onMounted, type Ref, type ComputedRef } from 'vue'
import { useSyncKit } from './useSyncKit'
import { toValue } from '../utils/refs'
import { useCleanup } from '../utils/lifecycle'
import type { MaybeRefOrGetter } from '../types'
import type { AwarenessState } from '../../../awareness'

export interface UsePresenceOptions {
  /**
   * Initial state to set when presence is initialized
   */
  initialState?: Record<string, unknown>

  /**
   * Auto-initialize awareness
   * @default true
   */
  autoInit?: boolean
}

export interface UsePresenceReturn {
  /**
   * Current user's awareness state
   */
  self: Ref<AwarenessState | undefined>

  /**
   * Other users' awareness states
   */
  others: Ref<AwarenessState[]>

  /**
   * All users (self + others)
   */
  all: ComputedRef<AwarenessState[]>

  /**
   * Number of other users online
   */
  otherCount: ComputedRef<number>

  /**
   * Total number of users (including self)
   */
  totalCount: ComputedRef<number>

  /**
   * Update local presence state
   */
  updatePresence: (state: Record<string, unknown>) => Promise<void>

  /**
   * Set a single field in presence state
   */
  setField: (key: string, value: unknown) => Promise<void>

  /**
   * Clear local presence (signal leaving)
   */
  leave: () => void
}

/**
 * Track user presence and awareness state
 * Manages ephemeral state like cursor positions, user info, etc.
 *
 * @param documentId - Document ID to track presence for
 * @param options - Configuration options
 * @returns Reactive presence state and update methods
 *
 * @example Basic usage
 * ```vue
 * <script setup lang="ts">
 * import { usePresence } from '@synckit-js/sdk/vue'
 *
 * const { self, others, updatePresence } = usePresence('doc-123', {
 *   initialState: {
 *     user: { name: 'Alice', color: '#FF6B6B' }
 *   }
 * })
 *
 * // Update cursor position
 * const handleMouseMove = (e: MouseEvent) => {
 *   updatePresence({
 *     ...self.value?.state,
 *     cursor: { x: e.clientX, y: e.clientY }
 *   })
 * }
 * </script>
 *
 * <template>
 *   <div @mousemove="handleMouseMove">
 *     <div class="presence-indicator">
 *       {{ others.length }} user(s) online
 *     </div>
 *
 *     <!-- Render other users' cursors -->
 *     <div
 *       v-for="user in others"
 *       :key="user.client_id"
 *       class="cursor"
 *       :style="{
 *         left: user.state.cursor?.x + 'px',
 *         top: user.state.cursor?.y + 'px'
 *       }"
 *     />
 *   </div>
 * </template>
 * ```
 *
 * @example With reactive document ID
 * ```vue
 * <script setup>
 * import { ref } from 'vue'
 * import { usePresence } from '@synckit-js/sdk/vue'
 * import { useRoute } from 'vue-router'
 *
 * const route = useRoute()
 *
 * // Presence updates automatically when route changes
 * const { self, others } = usePresence(() => route.params.docId)
 * </script>
 * ```
 */
export function usePresence(
  documentId: MaybeRefOrGetter<string>,
  options: UsePresenceOptions = {}
): UsePresenceReturn {
  const { initialState, autoInit = true } = options

  const synckit = useSyncKit()

  // Reactive state
  const self = ref<AwarenessState>()
  const others = ref<AwarenessState[]>([])
  const initialized = ref(false)

  // Computed values
  const all = computed(() => {
    const result: AwarenessState[] = []
    if (self.value) {
      result.push(self.value)
    }
    result.push(...others.value)
    return result
  })

  const otherCount = computed(() => others.value.length)
  const totalCount = computed(() => all.value.length)

  // Initialize awareness
  const initAwareness = async () => {
    try {
      const docId = toValue(documentId)
      const awareness = synckit.getAwareness(docId)

      // Wait for awareness to initialize
      await awareness.init()

      // Set initial state if provided
      if (initialState && autoInit) {
        await awareness.setLocalState(initialState)
      }

      // Subscribe to awareness changes
      const unsubscribe = awareness.subscribe(() => {
        // Update states whenever there's a change
        const states = awareness.getStates()
        const localClientId = awareness.getClientId()

        self.value = states.get(localClientId)
        others.value = Array.from(states.values()).filter(
          (state) => state.client_id !== localClientId
        )
      })

      // Get initial states
      const states = awareness.getStates()
      const localClientId = awareness.getClientId()
      self.value = states.get(localClientId)
      others.value = Array.from(states.values()).filter(
        (state) => state.client_id !== localClientId
      )

      initialized.value = true

      // Auto-cleanup
      useCleanup(() => {
        unsubscribe()
      })
    } catch (error) {
      console.error('[SyncKit] usePresence: Failed to initialize awareness', error)
    }
  }

  // Initialize on mount
  onMounted(() => {
    initAwareness()
  })

  // Update local presence state
  const updatePresence = async (state: Record<string, unknown>): Promise<void> => {
    if (!initialized.value) {
      console.warn('[SyncKit] usePresence: Not initialized yet')
      return
    }

    try {
      const docId = toValue(documentId)
      const awareness = synckit.getAwareness(docId)
      await awareness.setLocalState(state)
    } catch (error) {
      console.error('[SyncKit] usePresence: Failed to update presence', error)
      throw error
    }
  }

  // Set a single field
  const setField = async (key: string, value: unknown): Promise<void> => {
    if (!self.value) {
      await updatePresence({ [key]: value })
      return
    }

    await updatePresence({
      ...self.value.state,
      [key]: value,
    })
  }

  // Signal leaving (clear presence)
  const leave = (): void => {
    if (!initialized.value) return

    try {
      const docId = toValue(documentId)
      const awareness = synckit.getAwareness(docId)
      const leaveUpdate = awareness.createLeaveUpdate()
      awareness.applyUpdate(leaveUpdate)
    } catch (error) {
      console.error('[SyncKit] usePresence: Failed to leave', error)
    }
  }

  return {
    self: readonly(self) as Ref<AwarenessState | undefined>,
    others: readonly(others) as Ref<AwarenessState[]>,
    all,
    otherCount,
    totalCount,
    updatePresence,
    setField,
    leave,
  }
}
