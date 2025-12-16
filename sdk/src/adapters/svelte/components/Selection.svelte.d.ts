import type { SvelteComponent } from 'svelte'
import type { SelectionUser } from '../types/selection'
import type { CursorMode } from '../../../cursor/types'
import type { Writable } from 'svelte/store'

export interface SelectionProps {
  user: SelectionUser
  mode?: CursorMode
  containerRef?: Writable<HTMLElement | null>
  opacity?: number
}

declare class Selection extends SvelteComponent<SelectionProps> {}
export default Selection
