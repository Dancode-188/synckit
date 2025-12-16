import type { DefineComponent } from 'vue'
import type { SelectionUser } from '../types/selection'
import type { CursorMode } from '../../../cursor/types'

export interface SelectionsProps {
  documentId: string
  containerRef?: any
  mode?: CursorMode
  showSelf?: boolean
  opacity?: number
  users?: SelectionUser[]
}

declare const Selections: DefineComponent<SelectionsProps>
export default Selections
