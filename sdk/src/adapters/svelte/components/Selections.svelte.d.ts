import type { SvelteComponent } from 'svelte'
import type { SelectionUser } from '../types/selection'
import type { CursorMode } from '../../../cursor/types'
import type { Writable } from 'svelte/store'

export interface SelectionsProps {
  containerRef?: Writable<HTMLElement | null>
  mode?: CursorMode
  opacity?: number
  users?: SelectionUser[]
}

declare class Selections extends SvelteComponent<SelectionsProps> {}
export default Selections
