<script lang="ts">
  /**
   * Selections container component for rendering all users' text selections
   * @module adapters/svelte/components/Selections
   */

  import Selection from './Selection.svelte'
  import type { SelectionUser } from '../types/selection'
  import type { CursorMode } from '../../../cursor/types'
  import type { Writable } from 'svelte/store'

  interface Props {
    /** Container store (required for container mode) */
    containerRef?: Writable<HTMLElement | null>
    /** Positioning mode (viewport or container) */
    mode?: CursorMode
    /** Selection box opacity (default: 0.2) */
    opacity?: number
    /** Users with selection data (from awareness) */
    users?: SelectionUser[]
  }

  let {
    containerRef = undefined,
    mode = 'viewport',
    opacity = 0.2,
    users = []
  }: Props = $props()

  // Filter users to only those with selections
  // Selection component handles deserialization and validation internally
  let usersWithSelections = $derived(
    users.filter(u => u.selection != null)
  )
</script>

{#each usersWithSelections as user (user.id)}
  <Selection
    {user}
    {mode}
    {containerRef}
    {opacity}
  />
{/each}
