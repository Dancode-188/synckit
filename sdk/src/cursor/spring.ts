/**
 * Lightweight spring animation system for smooth cursor movement
 * Based on Hooke's law: F = -kx - cv
 *
 * Research-backed config: damping=45, stiffness=400, mass=1
 * Bundle size: ~2KB
 *
 * @module cursor/spring
 */

import type { SpringConfig } from './types'

/**
 * Spring animation for smooth value transitions
 * Uses spring physics to create natural-feeling movement
 */
export class Spring {
  private position: number
  private velocity: number
  private target: number
  private readonly config: Required<SpringConfig>

  constructor(config: SpringConfig = {}) {
    this.config = {
      damping: config.damping ?? 45,
      stiffness: config.stiffness ?? 400,
      mass: config.mass ?? 1,
      restDelta: config.restDelta ?? 0.001,
      initialValue: config.initialValue ?? 0
    }

    this.position = this.config.initialValue
    this.velocity = 0
    this.target = this.config.initialValue
  }

  /**
   * Set new target value for spring to animate towards
   */
  setTarget(target: number): void {
    this.target = target
  }

  /**
   * Get current position
   */
  getPosition(): number {
    return this.position
  }

  /**
   * Get current velocity
   */
  getVelocity(): number {
    return this.velocity
  }

  /**
   * Get target value
   */
  getTarget(): number {
    return this.target
  }

  /**
   * Update spring physics simulation
   * @param deltaTime - Time elapsed since last update (in seconds)
   * @returns Current position after update
   */
  update(deltaTime: number): number {
    const { damping, stiffness, mass } = this.config

    // Hooke's law: F = -kx (spring force)
    const springForce = -stiffness * (this.position - this.target)

    // Damping force: F = -cv (friction)
    const dampingForce = -damping * this.velocity

    // Newton's second law: F = ma, therefore a = F/m
    const acceleration = (springForce + dampingForce) / mass

    // Euler integration
    this.velocity += acceleration * deltaTime
    this.position += this.velocity * deltaTime

    // Snap to target when close enough to prevent infinite oscillation
    if (this.isAtRest()) {
      this.position = this.target
      this.velocity = 0
    }

    return this.position
  }

  /**
   * Check if spring has settled at target
   */
  isAtRest(): boolean {
    const { restDelta } = this.config
    const positionDelta = Math.abs(this.position - this.target)
    const velocityMagnitude = Math.abs(this.velocity)

    return positionDelta < restDelta && velocityMagnitude < restDelta
  }

  /**
   * Reset spring to initial state
   */
  reset(value: number = this.config.initialValue): void {
    this.position = value
    this.velocity = 0
    this.target = value
  }

  /**
   * Immediately snap to target (no animation)
   */
  snap(value: number): void {
    this.position = value
    this.velocity = 0
    this.target = value
  }
}

/**
 * 2D spring for cursor positions
 * Manages X and Y springs independently for smooth diagonal movement
 */
export class Spring2D {
  private readonly springX: Spring
  private readonly springY: Spring

  constructor(config: SpringConfig = {}) {
    this.springX = new Spring(config)
    this.springY = new Spring(config)
  }

  /**
   * Set target position
   */
  setTarget(x: number, y: number): void {
    this.springX.setTarget(x)
    this.springY.setTarget(y)
  }

  /**
   * Get current position
   */
  getPosition(): { x: number; y: number } {
    return {
      x: this.springX.getPosition(),
      y: this.springY.getPosition()
    }
  }

  /**
   * Update both springs
   * @param deltaTime - Time elapsed in seconds
   */
  update(deltaTime: number): { x: number; y: number } {
    return {
      x: this.springX.update(deltaTime),
      y: this.springY.update(deltaTime)
    }
  }

  /**
   * Check if both springs are at rest
   */
  isAtRest(): boolean {
    return this.springX.isAtRest() && this.springY.isAtRest()
  }

  /**
   * Reset both springs
   */
  reset(x: number = 0, y: number = 0): void {
    this.springX.reset(x)
    this.springY.reset(y)
  }

  /**
   * Snap to position immediately
   */
  snap(x: number, y: number): void {
    this.springX.snap(x)
    this.springY.snap(y)
  }
}

/**
 * Animation loop manager for running spring animations at 60fps
 */
export class SpringAnimator {
  private animationFrameId: number | null = null
  private lastTime: number = 0
  private readonly callbacks = new Set<(deltaTime: number) => void>()
  private isRunning = false

  /**
   * Add animation callback
   * @returns Unsubscribe function
   */
  subscribe(callback: (deltaTime: number) => void): () => void {
    this.callbacks.add(callback)

    // Start animation loop if not running
    if (!this.isRunning) {
      this.start()
    }

    return () => {
      this.callbacks.delete(callback)

      // Stop animation loop if no callbacks
      if (this.callbacks.size === 0) {
        this.stop()
      }
    }
  }

  /**
   * Start animation loop
   */
  private start(): void {
    if (this.isRunning) return

    this.isRunning = true
    this.lastTime = performance.now()
    this.tick()
  }

  /**
   * Stop animation loop
   */
  private stop(): void {
    if (!this.isRunning) return

    this.isRunning = false

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  /**
   * Animation frame tick
   */
  private tick = (): void => {
    if (!this.isRunning) return

    const currentTime = performance.now()
    const deltaTime = (currentTime - this.lastTime) / 1000 // Convert to seconds
    this.lastTime = currentTime

    // Call all registered callbacks
    for (const callback of this.callbacks) {
      callback(deltaTime)
    }

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(this.tick)
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop()
    this.callbacks.clear()
  }
}

/**
 * Global spring animator instance
 * Shared across all cursors to minimize requestAnimationFrame calls
 */
let globalAnimator: SpringAnimator | null = null

/**
 * Get or create global spring animator
 */
export function getGlobalAnimator(): SpringAnimator {
  if (!globalAnimator) {
    globalAnimator = new SpringAnimator()
  }
  return globalAnimator
}
