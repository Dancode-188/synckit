<script lang="ts">
  /**
   * Selection component for rendering a single user's text selection
   * @module adapters/svelte/components/Selection
   */

  import { get } from 'svelte/store'
  import { deserializeRange } from '../../../cursor/selection'
  import type { SerializedRange, SelectionRange, CursorMode } from '../../../cursor/types'
  import type { Writable } from 'svelte/store'
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

  interface Props {
    /** User whose selection to render */
    user: SelectionUser
    /** Positioning mode (viewport or container) */
    mode?: CursorMode
    /** Container store (required for container mode) */
    containerRef?: Writable<HTMLElement | null>
    /** Selection box opacity (default: 0.2) */
    opacity?: number
  }

  let {
    user,
    mode = 'viewport',
    containerRef = undefined,
    opacity = 0.2
  }: Props = $props()

  // Convert selection to visual format
  // Supports both new semantic format and old visual format for backward compatibility
  let visualSelection = $derived.by(() => {
    if (!user.selection) return null

    // New format (SerializedRange): Deserialize to visual coordinates
    if (isSerializedRange(user.selection)) {
      // Extract container element from writable store for deserializeRange
      const containerValue = containerRef ? get(containerRef) : null
      const container = containerValue ?? undefined
      return deserializeRange(
        user.selection,
        mode,
        container
      )
    }

    // Old format (SelectionRange): Use directly
    // This path provides backward compatibility for existing implementations
    if (isVisualRange(user.selection)) {
      console.warn(
        '[Selection] Received deprecated visual selection format. ' +
        'Please upgrade to semantic selection for cross-layout compatibility.'
      )
      return user.selection
    }

    return null
  })

  // Don't render if conversion failed or no rectangles
  let shouldRender = $derived.by(() => {
    if (!visualSelection || visualSelection.rects.length === 0) {
      return false
    }

    // Validate container mode requirements (check if containerRef has a value if it's a store)
    if (mode === 'container') {
      const hasContainer = containerRef ?
        (typeof (containerRef as any).subscribe === 'function' ? true : !!containerRef) :
        false
      if (!hasContainer) {
        console.warn('[Selection] Container mode requires containerRef')
        return false
      }
    }

    return true
  })

  let color = $derived(user.color || '#3b82f6')
</script>

{#if shouldRender && visualSelection}
  {#each visualSelection.rects as rect}
    <div
      data-selection-id={user.id}
      data-user-name={user.name}
      style:position={mode === 'container' ? 'absolute' : 'fixed'}
      style:left="0"
      style:top="0"
      style:transform="translate({rect.x}px, {rect.y}px)"
      style:width="{rect.width}px"
      style:height="{rect.height}px"
      style:background-color={color}
      style:opacity={opacity}
      style:pointer-events="none"
      style:z-index="9998"
      style:transition="opacity 0.2s ease"
      style:border-radius="2px"
    ></div>
  {/each}
{/if}
