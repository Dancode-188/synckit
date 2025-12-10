/**
 * Inactivity tracking for cursor hiding
 * @module cursor/inactive
 */

import type { InactivityConfig } from './types'

/**
 * Default inactivity configuration
 */
const DEFAULT_CONFIG: Required<InactivityConfig> = {
  timeout: 5000,  // 5 seconds
  fadeOutDuration: 300  // 300ms fade
}

/**
 * Inactivity tracker for cursor hiding
 *
 * Tracks cursor activity and triggers callbacks when cursor becomes
 * inactive (no movement for specified timeout) or active again.
 *
 * @example
 * ```ts
 * const tracker = new InactivityTracker(
 *   { timeout: 5000, fadeOutDuration: 300 },
 *   (inactive) => {
 *     console.log(inactive ? 'Cursor hidden' : 'Cursor shown')
 *   }
 * )
 *
 * // Record activity when cursor moves
 * tracker.recordActivity()
 *
 * // Clean up
 * tracker.dispose()
 * ```
 */
export class InactivityTracker {
  private lastActivityTime: number = Date.now()
  private isInactive: boolean = false
  private timeoutId: NodeJS.Timeout | null = null
  private onInactiveChange: (inactive: boolean) => void
  private config: Required<InactivityConfig>

  /**
   * Create a new inactivity tracker
   *
   * @param config - Inactivity configuration
   * @param onInactiveChange - Callback fired when inactive state changes
   */
  constructor(
    config: InactivityConfig,
    onInactiveChange: (inactive: boolean) => void
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.onInactiveChange = onInactiveChange
  }

  /**
   * Record activity (cursor moved)
   * Resets inactivity timer and shows cursor if hidden
   */
  recordActivity(): void {
    const now = Date.now()
    this.lastActivityTime = now

    // If was inactive, mark as active and notify
    if (this.isInactive) {
      this.isInactive = false
      this.onInactiveChange(false)
    }

    // Clear existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }

    // Set new timeout
    this.timeoutId = setTimeout(() => {
      this.isInactive = true
      this.onInactiveChange(true)
    }, this.config.timeout)
  }

  /**
   * Get time since last activity in milliseconds
   */
  getTimeSinceLastActivity(): number {
    return Date.now() - this.lastActivityTime
  }

  /**
   * Check if currently inactive
   */
  getIsInactive(): boolean {
    return this.isInactive
  }

  /**
   * Manually set inactive state
   * Useful for forcing cursor to show/hide
   *
   * @param inactive - Whether cursor should be inactive
   */
  setInactive(inactive: boolean): void {
    if (this.isInactive === inactive) return

    this.isInactive = inactive
    this.onInactiveChange(inactive)

    // Clear timeout if manually setting
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }

    // If setting to active, restart timeout
    if (!inactive) {
      this.recordActivity()
    }
  }

  /**
   * Reset tracker (mark as active and restart timer)
   */
  reset(): void {
    this.recordActivity()
  }

  /**
   * Dispose tracker and clean up timers
   */
  dispose(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }
}

/**
 * React hook for inactivity tracking
 * Convenience wrapper around InactivityTracker for React components
 *
 * @param config - Inactivity configuration
 * @param onInactiveChange - Callback fired when inactive state changes
 * @returns Inactivity tracker instance
 *
 * @example
 * ```tsx
 * function MyCursor() {
 *   const [isHidden, setIsHidden] = useState(false)
 *
 *   const tracker = useInactivityTracker(
 *     { timeout: 5000 },
 *     setIsHidden
 *   )
 *
 *   // Record activity when cursor moves
 *   useEffect(() => {
 *     tracker.recordActivity()
 *   }, [cursorPosition])
 *
 *   return (
 *     <div style={{ opacity: isHidden ? 0 : 1 }}>
 *       Cursor
 *     </div>
 *   )
 * }
 * ```
 */
export function createInactivityTracker(
  config: InactivityConfig,
  onInactiveChange: (inactive: boolean) => void
): InactivityTracker {
  return new InactivityTracker(config, onInactiveChange)
}
