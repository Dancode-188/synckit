/**
 * Collision detection for cursor stacking using spatial hashing
 * Prevents cursor pile-ups by stacking overlapping cursors vertically
 *
 * @module cursor/collision
 */

import type { CollisionConfig, CursorPosition } from './types'

/**
 * Default collision configuration
 */
const DEFAULT_CONFIG: Required<CollisionConfig> = {
  threshold: 50,      // 50px collision threshold
  stackOffset: 20,    // 20px vertical offset per collision
  cellSize: 100       // 100px cells for spatial hashing
}

/**
 * Spatial hash grid for efficient collision detection
 * Divides space into cells, each containing cursor IDs in that region
 */
interface SpatialHashGrid {
  /** Cell size in pixels */
  cellSize: number
  /** Grid map: cell key -> Set of cursor IDs */
  cells: Map<string, Set<string>>
  /** Cursor positions: cursor ID -> position */
  positions: Map<string, CursorPosition>
}

/**
 * Collision detector using spatial hashing for O(1) lookups
 *
 * Spatial hashing divides the space into a grid of cells. Each cell contains
 * a list of cursor IDs whose positions fall within that cell. When checking
 * for collisions, we only need to check cursors in the same cell and adjacent
 * cells, rather than all cursors in the document.
 *
 * Time complexity:
 * - Add cursor: O(1)
 * - Find collisions: O(k) where k = cursors in nearby cells (typically 1-5)
 * - vs naive approach: O(n) where n = total cursors
 *
 * @example
 * ```ts
 * const detector = new CollisionDetector({ threshold: 50, stackOffset: 20 })
 *
 * // Add cursors
 * detector.addCursor('user-1', { x: 100, y: 100 })
 * detector.addCursor('user-2', { x: 110, y: 110 })  // Within 50px threshold
 *
 * // Check collisions
 * const collisions = detector.findCollisions('user-1')
 * console.log(collisions)  // ['user-2']
 *
 * // Get stack offset
 * const offset = detector.getStackOffset('user-1')
 * console.log(offset)  // 20 (one collision = 20px offset)
 * ```
 */
export class CollisionDetector {
  private config: Required<CollisionConfig>
  private grid: SpatialHashGrid

  /**
   * Create a new collision detector
   *
   * @param config - Collision detection configuration
   */
  constructor(config: CollisionConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.grid = {
      cellSize: this.config.cellSize,
      cells: new Map(),
      positions: new Map()
    }
  }

  /**
   * Get cell key for a position
   * Cells are identified by their grid coordinates
   *
   * @param x - X coordinate in pixels
   * @param y - Y coordinate in pixels
   * @returns Cell key string (e.g., "5,3")
   */
  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.grid.cellSize)
    const cellY = Math.floor(y / this.grid.cellSize)
    return `${cellX},${cellY}`
  }

  /**
   * Get all cell keys that a position could collide with
   * Includes current cell and 8 adjacent cells
   *
   * @param x - X coordinate in pixels
   * @param y - Y coordinate in pixels
   * @returns Array of cell keys to check
   */
  private getNearbyCellKeys(x: number, y: number): string[] {
    const cellX = Math.floor(x / this.grid.cellSize)
    const cellY = Math.floor(y / this.grid.cellSize)

    const keys: string[] = []

    // Check 3x3 grid centered on current cell
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        keys.push(`${cellX + dx},${cellY + dy}`)
      }
    }

    return keys
  }

  /**
   * Calculate distance between two positions
   *
   * @param p1 - First position
   * @param p2 - Second position
   * @returns Distance in pixels
   */
  private distance(p1: CursorPosition, p2: CursorPosition): number {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * Add cursor to spatial grid
   * Updates cursor position and spatial hash
   *
   * @param id - Cursor ID
   * @param position - Cursor position in absolute coordinates
   */
  addCursor(id: string, position: CursorPosition): void {
    // Remove from old cell if exists
    this.removeCursor(id)

    // Add to new cell
    const cellKey = this.getCellKey(position.x, position.y)

    if (!this.grid.cells.has(cellKey)) {
      this.grid.cells.set(cellKey, new Set())
    }

    this.grid.cells.get(cellKey)!.add(id)
    this.grid.positions.set(id, position)
  }

  /**
   * Remove cursor from spatial grid
   *
   * @param id - Cursor ID to remove
   */
  removeCursor(id: string): void {
    const position = this.grid.positions.get(id)
    if (!position) return

    const cellKey = this.getCellKey(position.x, position.y)
    const cell = this.grid.cells.get(cellKey)

    if (cell) {
      cell.delete(id)

      // Clean up empty cells
      if (cell.size === 0) {
        this.grid.cells.delete(cellKey)
      }
    }

    this.grid.positions.delete(id)
  }

  /**
   * Find all cursors within collision threshold
   *
   * @param id - Cursor ID to check collisions for
   * @returns Array of cursor IDs that collide with this cursor
   */
  findCollisions(id: string): string[] {
    const position = this.grid.positions.get(id)
    if (!position) return []

    const collisions: string[] = []
    const nearbyCellKeys = this.getNearbyCellKeys(position.x, position.y)

    // Check all nearby cells
    for (const cellKey of nearbyCellKeys) {
      const cell = this.grid.cells.get(cellKey)
      if (!cell) continue

      // Check each cursor in this cell
      for (const otherId of cell) {
        if (otherId === id) continue

        const otherPosition = this.grid.positions.get(otherId)
        if (!otherPosition) continue

        // Check actual distance
        const dist = this.distance(position, otherPosition)

        if (dist < this.config.threshold) {
          collisions.push(otherId)
        }
      }
    }

    return collisions
  }

  /**
   * Get vertical stack offset for a cursor based on collisions
   * Cursors with more collisions get larger offsets
   *
   * @param id - Cursor ID
   * @returns Vertical offset in pixels (0 if no collisions)
   */
  getStackOffset(id: string): number {
    const collisions = this.findCollisions(id)
    return collisions.length * this.config.stackOffset
  }

  /**
   * Get collision count for a cursor
   *
   * @param id - Cursor ID
   * @returns Number of colliding cursors
   */
  getCollisionCount(id: string): number {
    return this.findCollisions(id).length
  }

  /**
   * Check if a specific cursor is colliding with another
   *
   * @param id1 - First cursor ID
   * @param id2 - Second cursor ID
   * @returns True if cursors are colliding
   */
  isColliding(id1: string, id2: string): boolean {
    const pos1 = this.grid.positions.get(id1)
    const pos2 = this.grid.positions.get(id2)

    if (!pos1 || !pos2) return false

    return this.distance(pos1, pos2) < this.config.threshold
  }

  /**
   * Get all cursors in the grid
   *
   * @returns Array of cursor IDs
   */
  getAllCursors(): string[] {
    return Array.from(this.grid.positions.keys())
  }

  /**
   * Get cursor count
   *
   * @returns Total number of cursors
   */
  getCursorCount(): number {
    return this.grid.positions.size
  }

  /**
   * Clear all cursors from the grid
   */
  clear(): void {
    this.grid.cells.clear()
    this.grid.positions.clear()
  }

  /**
   * Get grid statistics (for debugging)
   *
   * @returns Grid statistics
   */
  getStats(): {
    cursorCount: number
    cellCount: number
    avgCursorsPerCell: number
    maxCursorsPerCell: number
  } {
    const cellCount = this.grid.cells.size
    const cursorCount = this.grid.positions.size

    let maxCursorsPerCell = 0
    for (const cell of this.grid.cells.values()) {
      maxCursorsPerCell = Math.max(maxCursorsPerCell, cell.size)
    }

    const avgCursorsPerCell = cellCount > 0 ? cursorCount / cellCount : 0

    return {
      cursorCount,
      cellCount,
      avgCursorsPerCell,
      maxCursorsPerCell
    }
  }
}
