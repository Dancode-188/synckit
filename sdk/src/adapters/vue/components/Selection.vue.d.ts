import type { DefineComponent } from 'vue'
import type { SelectionUser } from '../types/selection'
import type { CursorMode } from '../../../cursor/types'

export interface SelectionProps {
  user: SelectionUser
  mode?: CursorMode
  containerRef?: any
  opacity?: number
}

declare const Selection: DefineComponent<SelectionProps>
export default Selection
