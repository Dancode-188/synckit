/**
 * Automatic snapshot scheduling and management
 * @module snapshot-scheduler
 */

import type { AutoSnapshotConfig, SnapshotMetadata, StorageAdapter } from './types'
import type { SyncDocument } from './document'

const DEFAULT_CONFIG: Required<AutoSnapshotConfig> = {
  enabled: true,
  sizeThresholdBytes: 10 * 1024 * 1024, // 10 MB
  timeIntervalMs: 60 * 60 * 1000, // 1 hour
  operationCount: 1000,
  maxSnapshots: 5,
  compress: false,
  keyPrefix: 'snapshot',
}

export class SnapshotScheduler {
  private config: Required<AutoSnapshotConfig>
  private document: SyncDocument<any>
  private storage: StorageAdapter
  private operationsSinceLastSnapshot = 0
  private lastSnapshotTime = 0
  private timeIntervalId: NodeJS.Timeout | null = null
  private isRunning = false
  private snapshotInProgress = false

  constructor(
    document: SyncDocument<any>,
    storage: StorageAdapter,
    config: AutoSnapshotConfig = {}
  ) {
    this.document = document
    this.storage = storage
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.lastSnapshotTime = Date.now()
  }

  /**
   * Start the automatic snapshot scheduler
   */
  start(): void {
    if (!this.config.enabled || this.isRunning) {
      return
    }

    this.isRunning = true

    // Set up time-based trigger
    if (this.config.timeIntervalMs > 0) {
      this.timeIntervalId = setInterval(() => {
        this.checkAndCreateSnapshot('time')
      }, this.config.timeIntervalMs)
    }
  }

  /**
   * Stop the automatic snapshot scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false

    if (this.timeIntervalId) {
      clearInterval(this.timeIntervalId)
      this.timeIntervalId = null
    }
  }

  /**
   * Record an operation (for operation-count-based triggers)
   */
  recordOperation(): void {
    if (!this.config.enabled || !this.isRunning) {
      return
    }

    this.operationsSinceLastSnapshot++

    // Check if we should trigger a snapshot based on operation count
    if (this.config.operationCount > 0 &&
        this.operationsSinceLastSnapshot >= this.config.operationCount) {
      this.checkAndCreateSnapshot('operations')
    }
  }

  /**
   * Check document size and create snapshot if threshold exceeded
   */
  checkSize(): void {
    if (!this.config.enabled || !this.isRunning) {
      return
    }

    const currentSize = this.document.getDocumentSize()

    if (this.config.sizeThresholdBytes > 0 &&
        currentSize >= this.config.sizeThresholdBytes) {
      this.checkAndCreateSnapshot('size')
    }
  }

  /**
   * Manually trigger a snapshot
   */
  async triggerSnapshot(): Promise<SnapshotMetadata | null> {
    return this.createSnapshot('manual')
  }

  /**
   * Check if we should create a snapshot and do so if needed
   */
  private async checkAndCreateSnapshot(trigger: 'time' | 'size' | 'operations'): Promise<void> {
    // Don't create overlapping snapshots
    if (this.snapshotInProgress) {
      return
    }

    // Create snapshot asynchronously (non-blocking)
    this.createSnapshot(trigger).catch((error) => {
      console.error(`[SnapshotScheduler] Failed to create snapshot (trigger: ${trigger}):`, error)
    })
  }

  /**
   * Create a snapshot and manage cleanup
   */
  private async createSnapshot(_trigger: string): Promise<SnapshotMetadata | null> {
    if (this.snapshotInProgress) {
      return null
    }

    try {
      this.snapshotInProgress = true

      // Generate snapshot key with timestamp
      const timestamp = Date.now()
      const key = `${this.config.keyPrefix}:${this.document.getId()}:${timestamp}`

      // Create the snapshot
      const metadata = await this.document.snapshot({
        compress: this.config.compress,
        key,
      })

      // Update state
      this.operationsSinceLastSnapshot = 0
      this.lastSnapshotTime = timestamp

      // Clean up old snapshots if needed
      await this.cleanupOldSnapshots()

      return metadata
    } catch (error) {
      console.error('[SnapshotScheduler] Failed to create snapshot:', error)
      return null
    } finally {
      this.snapshotInProgress = false
    }
  }

  /**
   * Clean up old snapshots, keeping only the most recent maxSnapshots
   */
  private async cleanupOldSnapshots(): Promise<void> {
    try {
      // Get all snapshot keys for this document
      const allKeys = await this.storage.list()
      const snapshotKeys = allKeys.filter((key) =>
        key.startsWith(`${this.config.keyPrefix}:${this.document.getId()}:`)
      )

      // If we're under the limit, nothing to do
      if (snapshotKeys.length <= this.config.maxSnapshots) {
        return
      }

      // Sort by timestamp (newest first)
      const sortedKeys = snapshotKeys.sort((a, b) => {
        const timestampA = parseInt(a.split(':')[2] || '0', 10)
        const timestampB = parseInt(b.split(':')[2] || '0', 10)
        return timestampB - timestampA
      })

      // Delete oldest snapshots
      const keysToDelete = sortedKeys.slice(this.config.maxSnapshots)
      await Promise.all(keysToDelete.map((key) => this.storage.delete(key)))
    } catch (error) {
      console.error('[SnapshotScheduler] Failed to cleanup old snapshots:', error)
    }
  }

  /**
   * Get list of all snapshots for this document
   */
  async listSnapshots(): Promise<string[]> {
    const allKeys = await this.storage.list()
    return allKeys
      .filter((key) => key.startsWith(`${this.config.keyPrefix}:${this.document.getId()}:`))
      .sort((a, b) => {
        const timestampA = parseInt(a.split(':')[2] || '0', 10)
        const timestampB = parseInt(b.split(':')[2] || '0', 10)
        return timestampB - timestampA // Newest first
      })
  }

  /**
   * Get the most recent snapshot key
   */
  async getLatestSnapshotKey(): Promise<string | null> {
    const snapshots = await this.listSnapshots()
    return snapshots.length > 0 ? snapshots[0]! : null
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutoSnapshotConfig>): void {
    const wasRunning = this.isRunning

    if (wasRunning) {
      this.stop()
    }

    this.config = { ...this.config, ...config }

    if (wasRunning && this.config.enabled) {
      this.start()
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoSnapshotConfig {
    return { ...this.config }
  }

  /**
   * Get statistics
   */
  getStats(): {
    operationsSinceLastSnapshot: number
    lastSnapshotTime: number
    timeSinceLastSnapshot: number
    isRunning: boolean
    snapshotInProgress: boolean
  } {
    return {
      operationsSinceLastSnapshot: this.operationsSinceLastSnapshot,
      lastSnapshotTime: this.lastSnapshotTime,
      timeSinceLastSnapshot: Date.now() - this.lastSnapshotTime,
      isRunning: this.isRunning,
      snapshotInProgress: this.snapshotInProgress,
    }
  }
}
