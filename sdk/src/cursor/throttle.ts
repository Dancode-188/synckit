/**
 * Adaptive throttle utility that adjusts update frequency based on room size
 *
 * Research-backed thresholds:
 * - <5 users: 30ms (33fps) - silky smooth
 * - 5-20 users: 50ms (20fps) - balanced
 * - 20-50 users: 100ms (10fps) - still smooth
 * - 50+ users: 200ms (5fps) - functional
 *
 * @module cursor/throttle
 */

import type { ThrottleConfig } from './types'

/**
 * Default throttle configuration
 */
const DEFAULT_CONFIG: Required<ThrottleConfig> = {
  minDelay: 16, // 60fps max
  maxDelay: 200, // 5fps min
  userThresholds: {
    5: 30,    // <5 users: 33fps
    20: 50,   // 5-20 users: 20fps
    50: 100,  // 20-50 users: 10fps
    Infinity: 200 // 50+ users: 5fps
  }
}

/**
 * Adaptive throttle that adjusts delay based on user count
 */
export class AdaptiveThrottle {
  private lastCall = 0
  private userCount = 0
  private readonly config: Required<ThrottleConfig>
  private pendingTimeout: NodeJS.Timeout | number | null = null
  private pendingArgs: any[] | null = null

  constructor(config: ThrottleConfig = {}) {
    this.config = {
      minDelay: config.minDelay ?? DEFAULT_CONFIG.minDelay,
      maxDelay: config.maxDelay ?? DEFAULT_CONFIG.maxDelay,
      userThresholds: config.userThresholds ?? DEFAULT_CONFIG.userThresholds
    }
  }

  /**
   * Update user count (automatically adjusts throttle delay)
   */
  setUserCount(count: number): void {
    this.userCount = Math.max(0, count)
  }

  /**
   * Get current user count
   */
  getUserCount(): number {
    return this.userCount
  }

  /**
   * Get current throttle delay based on user count
   */
  getDelay(): number {
    const thresholds = Object.entries(this.config.userThresholds)
      .map(([threshold, delay]) => [Number(threshold), delay] as const)
      .sort(([a], [b]) => a - b) // Sort by threshold ascending

    for (const [threshold, delay] of thresholds) {
      if (this.userCount < threshold) {
        return Math.max(this.config.minDelay, Math.min(delay, this.config.maxDelay))
      }
    }

    return this.config.maxDelay
  }

  /**
   * Throttle a function call
   * Leading edge: executes immediately if enough time has passed
   * Trailing edge: schedules execution after delay
   */
  throttle<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: Parameters<T>) => {
      const now = Date.now()
      const delay = this.getDelay()
      const timeSinceLastCall = now - this.lastCall

      // Leading edge: execute immediately if enough time has passed
      if (timeSinceLastCall >= delay) {
        this.lastCall = now
        this.clearPending()
        return fn(...args)
      }

      // Trailing edge: schedule execution
      this.pendingArgs = args
      if (!this.pendingTimeout) {
        const timeUntilNextCall = delay - timeSinceLastCall
        this.pendingTimeout = setTimeout(() => {
          this.lastCall = Date.now()
          const argsToUse = this.pendingArgs
          this.clearPending()
          if (argsToUse) {
            fn(...argsToUse)
          }
        }, timeUntilNextCall)
      }
    }) as T
  }

  /**
   * Clear pending execution
   */
  private clearPending(): void {
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout as any)
      this.pendingTimeout = null
    }
    this.pendingArgs = null
  }

  /**
   * Reset throttle state
   */
  reset(): void {
    this.lastCall = 0
    this.clearPending()
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.clearPending()
  }
}

/**
 * Simple throttle without adaptive behavior
 * Useful for fixed-delay scenarios
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  let lastCall = 0
  let pendingTimeout: NodeJS.Timeout | number | null = null
  let pendingArgs: Parameters<T> | null = null

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now()
    const timeSinceLastCall = now - lastCall

    // Leading edge
    if (timeSinceLastCall >= delay) {
      lastCall = now
      if (pendingTimeout) {
        clearTimeout(pendingTimeout as any)
        pendingTimeout = null
      }
      return fn(...args)
    }

    // Trailing edge
    pendingArgs = args
    if (!pendingTimeout) {
      const timeUntilNextCall = delay - timeSinceLastCall
      pendingTimeout = setTimeout(() => {
        lastCall = Date.now()
        const argsToUse = pendingArgs
        pendingTimeout = null
        pendingArgs = null
        if (argsToUse) {
          fn(...argsToUse)
        }
      }, timeUntilNextCall)
    }
  }

  return throttled as T
}

/**
 * Debounce a function (only execute after silence period)
 * Useful for events that should only trigger after user stops acting
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  let timeout: NodeJS.Timeout | number | null = null

  const debounced = (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout as any)
    }

    timeout = setTimeout(() => {
      timeout = null
      fn(...args)
    }, delay)
  }

  return debounced as T
}
