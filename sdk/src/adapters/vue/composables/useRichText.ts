/**
 * useRichText composable
 * Collaborative rich text editing with formatting
 * @module adapters/vue/composables/useRichText
 */

import { ref, readonly, computed, onMounted, type Ref, type ComputedRef } from 'vue'
import { useSyncKit } from './useSyncKit'
import { toValue } from '../utils/refs'
import { useCleanup } from '../utils/lifecycle'
import type { MaybeRefOrGetter } from '../types'
import type { RichText, FormatRange } from '../../../crdt/richtext'
import type { FormatAttributes } from '../../../crdt/peritext'

export interface UseRichTextOptions {
  /**
   * Auto-initialize the rich text instance
   * @default true
   */
  autoInit?: boolean
}

export interface UseRichTextReturn {
  /**
   * Plain text content (reactive)
   */
  text: Ref<string>

  /**
   * Formatted ranges for rendering (reactive)
   */
  ranges: Ref<FormatRange[]>

  /**
   * Loading state
   */
  loading: Ref<boolean>

  /**
   * Error state
   */
  error: Ref<Error | null>

  /**
   * Text length
   */
  length: ComputedRef<number>

  /**
   * Whether text is empty
   */
  isEmpty: ComputedRef<boolean>

  /**
   * Insert text at position
   */
  insert: (position: number, text: string) => Promise<void>

  /**
   * Delete text range
   */
  deleteText: (start: number, end: number) => Promise<void>

  /**
   * Apply formatting to range
   */
  format: (start: number, end: number, attributes: FormatAttributes) => Promise<void>

  /**
   * Remove formatting from range
   */
  unformat: (start: number, end: number, attributes: FormatAttributes) => Promise<void>

  /**
   * Clear all formatting from range
   */
  clearFormats: (start: number, end: number) => Promise<void>

  /**
   * Get formatting at position
   */
  getFormats: (position: number) => FormatAttributes

  /**
   * Raw RichText instance (for advanced usage)
   */
  richText: Ref<RichText | null>
}

/**
 * Collaborative rich text editing with real-time formatting
 * Combines Fugue text CRDT with Peritext formatting spans
 *
 * @param documentId - Document ID
 * @param fieldName - Field name in the document
 * @param options - Configuration options
 * @returns Reactive rich text state and methods
 *
 * @example Basic usage
 * ```vue
 * <script setup lang="ts">
 * import { useRichText } from '@synckit-js/sdk/vue'
 *
 * const { text, ranges, insert, format } = useRichText('doc-123', 'content')
 *
 * const makeBold = async (start: number, end: number) => {
 *   await format(start, end, { bold: true })
 * }
 * </script>
 *
 * <template>
 *   <div class="editor">
 *     <!-- Render formatted ranges -->
 *     <span
 *       v-for="(range, i) in ranges"
 *       :key="i"
 *       :class="{
 *         bold: range.attributes.bold,
 *         italic: range.attributes.italic
 *       }"
 *       :style="{
 *         color: range.attributes.color,
 *         backgroundColor: range.attributes.background
 *       }"
 *     >
 *       {{ range.text }}
 *     </span>
 *   </div>
 * </template>
 * ```
 *
 * @example With toolbar
 * ```vue
 * <script setup>
 * import { ref } from 'vue'
 * import { useRichText } from '@synckit-js/sdk/vue'
 *
 * const { text, format, getFormats } = useRichText('doc-123', 'content')
 * const selection = ref({ start: 0, end: 0 })
 *
 * const toggleBold = async () => {
 *   const { start, end } = selection.value
 *   if (start === end) return
 *
 *   const currentFormats = getFormats(start)
 *   if (currentFormats.bold) {
 *     await unformat(start, end, { bold: true })
 *   } else {
 *     await format(start, end, { bold: true })
 *   }
 * }
 * </script>
 *
 * <template>
 *   <div>
 *     <button @click="toggleBold">Bold</button>
 *     <div contenteditable @select="updateSelection">
 *       {{ text }}
 *     </div>
 *   </div>
 * </template>
 * ```
 */
export function useRichText(
  documentId: MaybeRefOrGetter<string>,
  fieldName: MaybeRefOrGetter<string>,
  options: UseRichTextOptions = {}
): UseRichTextReturn {
  const { autoInit = true } = options

  const synckit = useSyncKit()

  // Reactive state
  const richText = ref<RichText | null>(null)
  const text = ref('')
  const ranges = ref<FormatRange[]>([])
  const loading = ref(true)
  const error = ref<Error | null>(null)
  const initialized = ref(false)

  // Computed properties
  const length = computed(() => text.value.length)
  const isEmpty = computed(() => text.value.length === 0)

  // Initialize rich text
  const initRichText = async () => {
    try {
      loading.value = true
      error.value = null

      const docId = toValue(documentId)
      const field = toValue(fieldName)

      // Get document
      const doc = synckit.document(docId)
      await doc.init()

      // Get RichText field
      // Note: In a real implementation, we'd have a method to get typed fields
      // For now, we assume the field is already a RichText instance
      const rt = (doc as any).getField?.(field) || (doc as any)[field]

      if (!rt) {
        throw new Error(`Field "${field}" not found in document "${docId}"`)
      }

      richText.value = rt as RichText

      // Initialize if needed
      if (autoInit && typeof rt.init === 'function') {
        await rt.init()
      }

      // Subscribe to text changes
      const unsubscribeText = rt.subscribe?.((newText: string) => {
        text.value = newText
      })

      // Subscribe to format changes
      const unsubscribeFormats = rt.subscribeFormats?.((newRanges: FormatRange[]) => {
        ranges.value = newRanges
      })

      // Get initial state
      text.value = rt.get?.() || rt.toString?.() || ''
      ranges.value = rt.getRanges?.() || []

      initialized.value = true
      loading.value = false

      // Auto-cleanup
      useCleanup(() => {
        if (unsubscribeText) unsubscribeText()
        if (unsubscribeFormats) unsubscribeFormats()
      })
    } catch (err) {
      error.value = err as Error
      loading.value = false
      console.error('[SyncKit] useRichText: Failed to initialize', err)
    }
  }

  // Initialize on mount
  onMounted(() => {
    initRichText()
  })

  // Text operations
  const insert = async (position: number, insertText: string): Promise<void> => {
    if (!richText.value) {
      throw new Error('[SyncKit] useRichText: Not initialized')
    }

    try {
      await richText.value.insert(position, insertText)
    } catch (err) {
      error.value = err as Error
      throw err
    }
  }

  const deleteText = async (start: number, end: number): Promise<void> => {
    if (!richText.value) {
      throw new Error('[SyncKit] useRichText: Not initialized')
    }

    try {
      await richText.value.delete(start, end)
    } catch (err) {
      error.value = err as Error
      throw err
    }
  }

  // Formatting operations
  const format = async (
    start: number,
    end: number,
    attributes: FormatAttributes
  ): Promise<void> => {
    if (!richText.value) {
      throw new Error('[SyncKit] useRichText: Not initialized')
    }

    try {
      await richText.value.format(start, end, attributes)
    } catch (err) {
      error.value = err as Error
      throw err
    }
  }

  const unformat = async (
    start: number,
    end: number,
    attributes: FormatAttributes
  ): Promise<void> => {
    if (!richText.value) {
      throw new Error('[SyncKit] useRichText: Not initialized')
    }

    try {
      await richText.value.unformat(start, end, attributes)
    } catch (err) {
      error.value = err as Error
      throw err
    }
  }

  const clearFormats = async (start: number, end: number): Promise<void> => {
    if (!richText.value) {
      throw new Error('[SyncKit] useRichText: Not initialized')
    }

    try {
      await richText.value.clearFormats(start, end)
    } catch (err) {
      error.value = err as Error
      throw err
    }
  }

  const getFormats = (position: number): FormatAttributes => {
    if (!richText.value) {
      return {}
    }

    return richText.value.getFormats(position)
  }

  return {
    text: readonly(text),
    ranges: readonly(ranges) as Ref<FormatRange[]>,
    loading: readonly(loading),
    error: readonly(error),
    length,
    isEmpty,
    insert,
    deleteText,
    format,
    unformat,
    clearFormats,
    getFormats,
    richText: richText as Ref<RichText | null>,
  }
}
