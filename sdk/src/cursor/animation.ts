/**
 * Spring physics animation for smooth cursor movement
 * Based on research: damping=45, stiffness=400, mass=1
 * @module cursor/animation
 */

import type { CursorPosition, SpringConfig } from './types'

const DEFAULT_SPRING: Required<SpringConfig> = {
  damping: 45,
  stiffness: 400,
  mass: 1,
  restDelta: 0.001,
  initialValue: 0
}

/**
 * Spring animation state for a single axis
 */
interface SpringState {
  position: number
  velocity: number
  target: number
}

/**
 * 2D spring animation state
 */
interface Spring2D {
  x: SpringState
  y: SpringState
}

/**
 * Animate a spring towards its target
 * Returns new position and velocity
 */
function animateSpring(
  current: number,
  velocity: number,
  target: number,
  config: Required<SpringConfig>,
  dt: number
): [number, number] {
  const { stiffness, damping, mass } = config

  // Spring force: F = -k * x
  const springForce = -stiffness * (current - target)

  // Damping force: F = -c * v
  const dampingForce = -damping * velocity

  // Total force
  const force = springForce + dampingForce

  // Acceleration: a = F / m
  const acceleration = force / mass

  // Update velocity: v = v + a * dt
  const newVelocity = velocity + acceleration * dt

  // Update position: x = x + v * dt
  const newPosition = current + newVelocity * dt

  return [newPosition, newVelocity]
}

/**
 * Check if spring is at rest (close enough to target)
 */
function isAtRest(
  position: number,
  velocity: number,
  target: number,
  restDelta: number
): boolean {
  const positionDelta = Math.abs(position - target)
  const velocityDelta = Math.abs(velocity)

  return positionDelta < restDelta && velocityDelta < restDelta
}

/**
 * Create a 2D spring animation
 */
export class SpringAnimation {
  private spring: Spring2D
  private config: Required<SpringConfig>
  private rafId: number | null = null
  private lastTime: number = 0
  private onUpdate: ((position: CursorPosition) => void) | null = null

  constructor(config: Partial<SpringConfig> = {}) {
    this.config = { ...DEFAULT_SPRING, ...config }
    this.spring = {
      x: { position: 0, velocity: 0, target: 0 },
      y: { position: 0, velocity: 0, target: 0 }
    }
  }

  /**
   * Set the target position (where spring should animate to)
   */
  setTarget(target: CursorPosition): void {
    this.spring.x.target = target.x
    this.spring.y.target = target.y

    // Start animation loop if not already running
    if (this.rafId === null) {
      this.lastTime = performance.now()
      this.animate()
    }
  }

  /**
   * Set current position immediately (no animation)
   */
  setPosition(position: CursorPosition): void {
    this.spring.x.position = position.x
    this.spring.x.velocity = 0
    this.spring.y.position = position.y
    this.spring.y.velocity = 0
  }

  /**
   * Get current animated position
   */
  getPosition(): CursorPosition {
    return {
      x: this.spring.x.position,
      y: this.spring.y.position
    }
  }

  /**
   * Set callback for position updates
   */
  subscribe(callback: (position: CursorPosition) => void): () => void {
    this.onUpdate = callback

    return () => {
      this.onUpdate = null
    }
  }

  /**
   * Animation loop
   */
  private animate = (): void => {
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.1) // Max 100ms frame time
    this.lastTime = now

    // Animate X axis
    const [newX, newVx] = animateSpring(
      this.spring.x.position,
      this.spring.x.velocity,
      this.spring.x.target,
      this.config,
      dt
    )

    // Animate Y axis
    const [newY, newVy] = animateSpring(
      this.spring.y.position,
      this.spring.y.velocity,
      this.spring.y.target,
      this.config,
      dt
    )

    // Update state
    this.spring.x.position = newX
    this.spring.x.velocity = newVx
    this.spring.y.position = newY
    this.spring.y.velocity = newVy

    // Notify subscribers
    if (this.onUpdate) {
      this.onUpdate(this.getPosition())
    }

    // Check if spring is at rest
    const xAtRest = isAtRest(
      this.spring.x.position,
      this.spring.x.velocity,
      this.spring.x.target,
      this.config.restDelta
    )

    const yAtRest = isAtRest(
      this.spring.y.position,
      this.spring.y.velocity,
      this.spring.y.target,
      this.config.restDelta
    )

    // Continue animating if not at rest
    if (!xAtRest || !yAtRest) {
      this.rafId = requestAnimationFrame(this.animate)
    } else {
      // Snap to target and stop
      this.spring.x.position = this.spring.x.target
      this.spring.x.velocity = 0
      this.spring.y.position = this.spring.y.target
      this.spring.y.velocity = 0

      if (this.onUpdate) {
        this.onUpdate(this.getPosition())
      }

      this.rafId = null
    }
  }

  /**
   * Stop animation and clean up
   */
  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.onUpdate = null
  }
}
