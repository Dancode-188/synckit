<!--
  Selection component for rendering a single user's text selection
  @module adapters/vue/components/Selection
-->
<script setup lang="ts">
import { computed, type PropType, type Ref } from 'vue'
import { deserializeRange } from '../../../cursor/selection'
import type { SerializedRange, SelectionRange, CursorMode } from '../../../cursor/types'
import type { SelectionUser } from '../types/selection'

/**
 * Type guard to check if selection is in new serialized format
 */
function isSerializedRange(selection: any): selection is SerializedRange {
  return selection &&
         typeof selection.startXPath === 'string' &&
         typeof selection.startOffset === 'number' &&
         typeof selection.endXPath === 'string' &&
         typeof selection.endOffset === 'number'
}

/**
 * Type guard to check if selection is in old visual format
 */
function isVisualRange(selection: any): selection is SelectionRange {
  return selection && Array.isArray(selection.rects)
}

const props = defineProps({
  /** User whose selection to render */
  user: {
    type: Object as PropType<SelectionUser>,
    required: true
  },
  /** Positioning mode (viewport or container) */
  mode: {
    type: String as PropType<CursorMode>,
    default: 'viewport'
  },
  /** Container ref (required for container mode) */
  containerRef: {
    type: Object as PropType<Ref<HTMLElement | null> | null>,
    default: null
  },
  /** Selection box opacity (default: 0.2) */
  opacity: {
    type: Number,
    default: 0.2
  }
})

// Convert selection to visual format
// Supports both new semantic format and old visual format for backward compatibility
const visualSelection = computed(() => {
  if (!props.user.selection) return null

  // New format (SerializedRange): Deserialize to visual coordinates
  if (isSerializedRange(props.user.selection)) {
    return deserializeRange(
      props.user.selection,
      props.mode,
      props.containerRef?.value || undefined
    )
  }

  // Old format (SelectionRange): Use directly
  // This path provides backward compatibility for existing implementations
  if (isVisualRange(props.user.selection)) {
    console.warn(
      '[Selection] Received deprecated visual selection format. ' +
      'Please upgrade to semantic selection for cross-layout compatibility.'
    )
    return props.user.selection
  }

  return null
})

// Don't render if conversion failed or no rectangles
const shouldRender = computed(() => {
  if (!visualSelection.value || visualSelection.value.rects.length === 0) {
    return false
  }

  // Validate container mode requirements
  if (props.mode === 'container' && !props.containerRef?.value) {
    console.warn('[Selection] Container mode requires containerRef')
    return false
  }

  return true
})

const color = computed(() => props.user.color || '#3b82f6')
</script>

<template>
  <template v-if="shouldRender && visualSelection">
    <div
      v-for="(rect, index) in visualSelection.rects"
      :key="`${user.id}-rect-${index}`"
      :data-selection-id="user.id"
      :data-user-name="user.name"
      :style="{
        position: mode === 'container' ? 'absolute' : 'fixed',
        left: 0,
        top: 0,
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        backgroundColor: color,
        opacity,
        pointerEvents: 'none',
        zIndex: 9998,
        transition: 'opacity 0.2s ease',
        borderRadius: '2px'
      }"
    />
  </template>
</template>
