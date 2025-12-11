/**
 * Cross-Tab Synchronization using BroadcastChannel
 *
 * Enables instant synchronization between browser tabs without server roundtrip.
 * Uses BroadcastChannel API for same-origin tab communication.
 */

import type { CrossTabMessage, MessageHandler } from './message-types';

/**
 * Options for CrossTabSync configuration
 */
export interface CrossTabSyncOptions {
  /**
   * Whether to enable cross-tab sync immediately
   * @default true
   */
  enabled?: boolean;

  /**
   * Custom channel name (for testing/debugging)
   * @default `synckit-${documentId}`
   */
  channelName?: string;
}

/**
 * CrossTabSync manages communication between browser tabs using BroadcastChannel
 */
export class CrossTabSync {
  private channel: BroadcastChannel;
  private tabId: string;
  private messageSeq: number = 0;
  private handlers = new Map<string, Set<MessageHandler>>();
  private isEnabled: boolean;
  private channelName: string;

  /**
   * Creates a new CrossTabSync instance
   *
   * @param documentId - Document ID to sync across tabs
   * @param options - Configuration options
   *
   * @example
   * ```typescript
   * const crossTab = new CrossTabSync('doc-123');
   * crossTab.on('update', (message) => {
   *   console.log('Received update from another tab:', message);
   * });
   * ```
   */
  constructor(
    private documentId: string,
    options: CrossTabSyncOptions = {}
  ) {
    this.tabId = this.generateTabId();
    this.channelName = options.channelName || `synckit-${documentId}`;
    this.isEnabled = options.enabled ?? true;

    // Check BroadcastChannel support
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error(
        'BroadcastChannel not supported. Cross-tab sync requires a modern browser. ' +
        'See: https://caniuse.com/broadcastchannel'
      );
    }

    this.channel = new BroadcastChannel(this.channelName);

    if (this.isEnabled) {
      this.setupListeners();
      this.announcePresence();
    }
  }

  /**
   * Broadcast a message to all other tabs
   *
   * @param message - Message to broadcast (without `from` and `seq` fields)
   *
   * @example
   * ```typescript
   * crossTab.broadcast({
   *   type: 'update',
   *   documentId: 'doc-123',
   *   data: { title: 'New Title' }
   * });
   * ```
   */
  broadcast(message: Omit<CrossTabMessage, 'from' | 'seq' | 'timestamp'>): void {
    if (!this.isEnabled) {
      return;
    }

    const fullMessage: CrossTabMessage = {
      ...message,
      from: this.tabId,
      seq: this.messageSeq++,
      timestamp: Date.now(),
    } as CrossTabMessage;

    try {
      this.channel.postMessage(fullMessage);
    } catch (error) {
      console.error('Failed to broadcast message:', error);
      throw error;
    }
  }

  /**
   * Register a message handler for a specific message type
   *
   * @param type - Message type to listen for
   * @param handler - Handler function
   *
   * @example
   * ```typescript
   * crossTab.on('update', (message) => {
   *   if (message.type === 'update') {
   *     console.log('Update received:', message.data);
   *   }
   * });
   * ```
   */
  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  /**
   * Remove a message handler
   *
   * @param type - Message type
   * @param handler - Handler function to remove
   */
  off(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  /**
   * Remove all handlers for a message type
   *
   * @param type - Message type
   */
  removeAllListeners(type: string): void {
    this.handlers.delete(type);
  }

  /**
   * Enable cross-tab sync if it was disabled
   */
  enable(): void {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this.setupListeners();
    this.announcePresence();
  }

  /**
   * Disable cross-tab sync
   */
  disable(): void {
    if (!this.isEnabled) return;

    // Broadcast leaving message before disabling
    this.broadcast({ type: 'tab-leaving' } as Omit<CrossTabMessage, 'from' | 'seq' | 'timestamp'>);

    this.isEnabled = false;

    // Clear handlers
    this.channel.onmessage = null;
    this.channel.onmessageerror = null;
  }

  /**
   * Get the current tab's ID
   */
  getTabId(): string {
    return this.tabId;
  }

  /**
   * Get the document ID
   */
  getDocumentId(): string {
    return this.documentId;
  }

  /**
   * Check if cross-tab sync is enabled
   */
  isActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.disable();
    this.channel.close();
    this.handlers.clear();
  }

  /**
   * Setup BroadcastChannel message listeners
   */
  private setupListeners(): void {
    this.channel.onmessage = (event: MessageEvent<CrossTabMessage>) => {
      this.handleMessage(event.data);
    };

    this.channel.onmessageerror = (event: MessageEvent) => {
      console.error('BroadcastChannel message error:', event);
    };
  }

  /**
   * Handle incoming message from BroadcastChannel
   */
  private handleMessage(message: CrossTabMessage): void {
    // Ignore messages from self
    if (message.from === this.tabId) {
      return;
    }

    // Dispatch to registered handlers
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error(`Error in message handler for type "${message.type}":`, error);
        }
      });
    }

    // Dispatch to wildcard handlers (*)
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in wildcard message handler:', error);
        }
      });
    }
  }

  /**
   * Announce this tab's presence to other tabs
   */
  private announcePresence(): void {
    this.broadcast({
      type: 'tab-joined',
    } as Omit<CrossTabMessage, 'from' | 'seq' | 'timestamp'>);
  }

  /**
   * Generate a unique tab ID
   */
  private generateTabId(): string {
    // Use crypto.randomUUID if available (modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback to timestamp + random
    return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * Helper function to enable cross-tab sync with minimal configuration
 *
 * @param documentId - Document ID to sync
 * @param options - Configuration options
 * @returns CrossTabSync instance
 *
 * @example
 * ```typescript
 * const crossTab = enableCrossTabSync('doc-123');
 *
 * // Listen for updates
 * crossTab.on('update', (message) => {
 *   console.log('Update from another tab:', message);
 * });
 * ```
 */
export function enableCrossTabSync(
  documentId: string,
  options?: CrossTabSyncOptions
): CrossTabSync {
  return new CrossTabSync(documentId, options);
}
