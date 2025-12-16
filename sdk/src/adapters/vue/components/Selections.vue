<!--
  Selections container component for rendering all users' text selections
  @module adapters/vue/components/Selections
-->
<script setup lang="ts">
import { computed, type PropType, type Ref } from 'vue'
import Selection from './Selection.vue'
import type { SelectionUser } from '../types/selection'
import type { CursorMode } from '../../../cursor/types'

const props = defineProps({
  /** Document ID for awareness protocol */
  documentId: {
    type: String,
    required: true
  },
  /** Container element (required for container mode) */
  containerRef: {
    type: Object as PropType<Ref<HTMLElement | null> | null>,
    default: null
  },
  /** Positioning mode (viewport or container) */
  mode: {
    type: String as PropType<CursorMode>,
    default: 'viewport'
  },
  /** Show local user's selection (default: false) */
  showSelf: {
    type: Boolean,
    default: false
  },
  /** Selection box opacity (default: 0.2) */
  opacity: {
    type: Number,
    default: 0.2
  },
  /** Users with selection data (from awareness) */
  users: {
    type: Array as PropType<SelectionUser[]>,
    default: () => []
  }
})

// Filter users to only those with selections
// Selection component handles deserialization and validation internally
const usersWithSelections = computed(() =>
  props.users.filter(u => u.selection != null)
)
</script>

<template>
  <Selection
    v-for="user in usersWithSelections"
    :key="user.id"
    :user="user"
    :mode="mode"
    :container-ref="containerRef"
    :opacity="opacity"
  />
</template>
