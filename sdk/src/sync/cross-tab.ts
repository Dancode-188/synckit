/**
 * Cross-Tab Synchronization using BroadcastChannel
 *
 * Enables instant synchronization between browser tabs without server roundtrip.
 * Uses BroadcastChannel API for same-origin tab communication.
 */

import type { CrossTabMessage, MessageHandler } from './message-types';

/**
 * State snapshot for hash computation and recovery
 */
export interface StateSnapshot {
  undoStack: any[];
  redoStack: any[];
  documentState?: any;
}

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

  /**
   * Heartbeat interval in milliseconds
   * @default 2000
   */
  heartbeatInterval?: number;

  /**
   * Timeout for leader heartbeat in milliseconds
   * @default 5000
   */
  heartbeatTimeout?: number;

  /**
   * Callback to get current state for hash computation
   * Used for message loss detection and recovery
   */
  stateProvider?: () => StateSnapshot;

  /**
   * Callback to restore state from leader during recovery
   * Used when follower detects state divergence
   */
  stateRestorer?: (state: StateSnapshot) => void;
}

/**
 * CrossTabSync manages communication between browser tabs using BroadcastChannel
 */
export class CrossTabSync {
  private channel: BroadcastChannel;
  private tabId: string;
  private tabStartTime: number;
  private messageSeq: number = 0;
  private handlers = new Map<string, Set<MessageHandler>>();
  private isEnabled: boolean;
  private channelName: string;

  // Leader election state
  private isLeader: boolean = false;
  private currentLeaderId: string | null = null;
  private lastLeaderHeartbeat: number = 0;
  private heartbeatInterval: number;
  private heartbeatTimeout: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private leaderCheckTimer: ReturnType<typeof setInterval> | null = null;
  private electionTimer: ReturnType<typeof setTimeout> | null = null;

  // State recovery
  private stateProvider?: () => StateSnapshot;
  private stateRestorer?: (state: StateSnapshot) => void;

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
    this.tabStartTime = Date.now();
    this.channelName = options.channelName || `synckit-${documentId}`;
    this.isEnabled = options.enabled ?? true;
    this.heartbeatInterval = options.heartbeatInterval ?? 2000;
    this.heartbeatTimeout = options.heartbeatTimeout ?? 5000;
    this.stateProvider = options.stateProvider;
    this.stateRestorer = options.stateRestorer;

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
      this.setupBeforeUnloadHandler();
      this.announcePresence();
      this.startElection();
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
    this.startElection();
  }

  /**
   * Disable cross-tab sync
   */
  disable(): void {
    if (!this.isEnabled) return;

    // Broadcast leaving message before disabling (ignore errors during cleanup)
    try {
      this.broadcast({ type: 'tab-leaving' } as Omit<CrossTabMessage, 'from' | 'seq' | 'timestamp'>);
    } catch (error) {
      // Ignore errors during cleanup (channel may already be closed)
    }

    this.stopLeaderElection();
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
   * Check if this tab is the current leader
   */
  isCurrentLeader(): boolean {
    return this.isLeader;
  }

  /**
   * Get the current leader's tab ID
   */
  getLeaderId(): string | null {
    return this.currentLeaderId;
  }

  /**
   * Get this tab's start time (for election comparison)
   */
  getTabStartTime(): number {
    return this.tabStartTime;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopLeaderElection();
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
   * Setup beforeunload handler to broadcast tab-leaving message
   */
  private setupBeforeUnloadHandler(): void {
    // Only set up in browser environment
    if (typeof window === 'undefined') {
      return;
    }

    // Send tab-leaving message before the page unloads
    window.addEventListener('beforeunload', () => {
      try {
        this.broadcast({ type: 'tab-leaving', tabId: this.tabId } as any);
      } catch (error) {
        // Ignore errors during cleanup
      }
    });
  }

  /**
   * Handle incoming message from BroadcastChannel
   */
  private handleMessage(message: CrossTabMessage): void {
    // Ignore messages from self
    if (message.from === this.tabId) {
      return;
    }

    // Handle leader election messages
    if (message.type === 'election') {
      this.handleElectionMessage(message);
    } else if (message.type === 'heartbeat') {
      this.handleHeartbeatMessage(message);
    } else if (message.type === 'tab-leaving') {
      this.handleTabLeavingMessage(message);
    } else if (message.type === 'request-full-sync') {
      // Handle full sync request (leader only)
      const requestMessage = message as any;
      if (requestMessage.targetLeaderId === this.tabId) {
        this.sendFullState(requestMessage.requesterId);
      }
    } else if (message.type === 'full-sync-response') {
      // Handle full sync response (follower only)
      const responseMessage = message as any;
      if (responseMessage.requesterId === this.tabId) {
        this.applyFullState(responseMessage.state);
      }
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

  /**
   * Start leader election process
   */
  private startElection(): void {
    // Optimistically set ourselves as potential leader
    this.currentLeaderId = this.tabId;

    // Start checking for leader liveness
    this.leaderCheckTimer = setInterval(() => {
      this.checkLeaderLiveness();
    }, 1000);

    // Create election timer BEFORE broadcasting so responses can cancel it
    this.electionTimer = setTimeout(() => {
      this.electionTimer = null;
      if (this.currentLeaderId === this.tabId && !this.isLeader) {
        this.becomeLeader();
      }
    }, 100);

    // Broadcast election message with tab start time
    // (must be after timer creation so responses can cancel it)
    this.broadcast({
      type: 'election',
      tabId: this.tabId,
      tabStartTime: this.tabStartTime,
    } as any);
  }

  /**
   * Stop leader election timers
   */
  private stopLeaderElection(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.leaderCheckTimer) {
      clearInterval(this.leaderCheckTimer);
      this.leaderCheckTimer = null;
    }

    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }

    this.isLeader = false;
    this.currentLeaderId = null;
  }

  /**
   * Handle election message from another tab
   */
  private handleElectionMessage(message: CrossTabMessage): void {
    if (message.type !== 'election') return;

    const electionMessage = message as any;
    const otherTabStartTime = electionMessage.tabStartTime;
    const otherTabId = electionMessage.tabId;

    // If the other tab is older (started earlier), it should be leader
    if (otherTabStartTime < this.tabStartTime) {
      // The other tab is older, so it should be leader
      if (this.isLeader) {
        // We were leader, but an older tab exists - step down
        this.stepDownAsLeader();
      }

      // Cancel our pending election timer since we found an older tab
      if (this.electionTimer) {
        clearTimeout(this.electionTimer);
        this.electionTimer = null;
      }

      this.currentLeaderId = otherTabId;
      this.lastLeaderHeartbeat = Date.now();
    } else if (otherTabStartTime > this.tabStartTime) {
      // We're older than the other tab
      // If we're already leader or should be, respond with our election message
      if (this.isLeader || this.currentLeaderId === null || this.currentLeaderId === this.tabId) {
        // Respond so the new tab knows about us
        this.broadcast({
          type: 'election',
          tabId: this.tabId,
          tabStartTime: this.tabStartTime,
        } as any);

        // Claim leadership if not already leader
        if (!this.isLeader) {
          this.becomeLeader();
        }
      }
    } else if (otherTabStartTime === this.tabStartTime) {
      // Same start time (very rare), use tab ID as tiebreaker
      if (otherTabId < this.tabId) {
        this.currentLeaderId = otherTabId;
        this.lastLeaderHeartbeat = Date.now();

        if (this.isLeader) {
          this.stepDownAsLeader();
        }
      } else if (!this.isLeader) {
        // Respond with our election message
        this.broadcast({
          type: 'election',
          tabId: this.tabId,
          tabStartTime: this.tabStartTime,
        } as any);
        this.becomeLeader();
      }
    }
  }

  /**
   * Handle heartbeat message from leader
   */
  private handleHeartbeatMessage(message: CrossTabMessage): void {
    if (message.type !== 'heartbeat') return;

    const heartbeatMessage = message as any;
    const senderTabId = heartbeatMessage.tabId;

    // Update last heartbeat time if it's from the current leader
    if (senderTabId === this.currentLeaderId) {
      this.lastLeaderHeartbeat = Date.now();

      // Verify state hash if both leader and follower have state providers
      if (heartbeatMessage.stateHash && this.stateProvider) {
        const myHash = this.computeStateHash();

        if (myHash && myHash !== heartbeatMessage.stateHash) {
          console.warn('[CrossTab] State diverged from leader. My hash:', myHash, 'Leader hash:', heartbeatMessage.stateHash);
          this.requestFullSync(senderTabId);
        }
      }
    }
  }

  /**
   * Handle tab-leaving message
   */
  private handleTabLeavingMessage(message: CrossTabMessage): void {
    if (message.type !== 'tab-leaving') return;

    const leavingMessage = message as any;
    const leavingTabId = leavingMessage.tabId || message.from;

    // If the leaving tab is the current leader, trigger immediate re-election
    if (leavingTabId === this.currentLeaderId) {
      this.currentLeaderId = null;
      this.lastLeaderHeartbeat = 0;

      // Start new election immediately
      this.startElection();
    }
  }

  /**
   * Become the leader
   */
  private becomeLeader(): void {
    if (this.isLeader) return;

    this.isLeader = true;
    this.currentLeaderId = this.tabId;
    this.lastLeaderHeartbeat = Date.now();

    // Start sending heartbeats
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);

    // Notify handlers that this tab became leader
    const handlers = this.handlers.get('leader-elected');
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler({
            type: 'leader-elected',
            from: this.tabId,
            seq: this.messageSeq,
            timestamp: Date.now(),
            tabId: this.tabId,
          } as any);
        } catch (error) {
          console.error('Error in leader-elected handler:', error);
        }
      });
    }
  }

  /**
   * Step down as leader
   */
  private stepDownAsLeader(): void {
    this.isLeader = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat message
   */
  private sendHeartbeat(): void {
    if (!this.isLeader) return;

    const stateHash = this.computeStateHash();

    this.broadcast({
      type: 'heartbeat',
      tabId: this.tabId,
      tabStartTime: this.tabStartTime,
      stateHash,
    } as any);
  }

  /**
   * Check if leader is still alive
   */
  private checkLeaderLiveness(): void {
    // If we're the leader, nothing to check
    if (this.isLeader) return;

    // If we think we should be leader but aren't yet, try to become leader
    if (this.currentLeaderId === this.tabId && !this.isLeader) {
      this.becomeLeader();
      return;
    }

    // If no leader has been elected yet, try to become leader
    if (this.currentLeaderId === null) {
      this.becomeLeader();
      return;
    }

    // Don't check heartbeat if we're the current leader (not yet actually leader)
    if (this.currentLeaderId === this.tabId) {
      return;
    }

    // Check if we've received a heartbeat recently
    const now = Date.now();
    const timeSinceLastHeartbeat = now - this.lastLeaderHeartbeat;

    if (timeSinceLastHeartbeat > this.heartbeatTimeout) {
      // Leader appears to be dead, start new election
      this.currentLeaderId = null;
      this.startElection();
    }
  }

  /**
   * Compute hash of current state for divergence detection
   * Returns null if no state provider is configured
   */
  private computeStateHash(): string | null {
    if (!this.stateProvider) {
      return null;
    }

    try {
      const state = this.stateProvider();

      // Create deterministic representation
      const hashInput = {
        undoStack: state.undoStack.map(op => ({
          type: (op as any).type,
          timestamp: (op as any).timestamp,
        })),
        redoStack: state.redoStack.map(op => ({
          type: (op as any).type,
          timestamp: (op as any).timestamp,
        })),
        documentState: state.documentState,
      };

      const json = JSON.stringify(hashInput);

      // Simple hash function (djb2)
      let hash = 5381;
      for (let i = 0; i < json.length; i++) {
        hash = ((hash << 5) + hash) + json.charCodeAt(i);
      }

      return hash.toString(36).substring(0, 16);
    } catch (error) {
      console.error('Failed to compute state hash:', error);
      return null;
    }
  }

  /**
   * Request full state sync from leader
   */
  private requestFullSync(leaderId: string): void {
    console.warn('[CrossTab] Requesting full sync from leader:', leaderId);

    this.broadcast({
      type: 'request-full-sync',
      requesterId: this.tabId,
      targetLeaderId: leaderId,
    } as any);
  }

  /**
   * Send full state to requesting follower (leader only)
   */
  private sendFullState(requesterId: string): void {
    if (!this.isLeader || !this.stateProvider) {
      return;
    }

    try {
      const state = this.stateProvider();

      console.info('[CrossTab] Sending full state to:', requesterId);

      this.broadcast({
        type: 'full-sync-response',
        requesterId,
        state,
      } as any);
    } catch (error) {
      console.error('Failed to send full state:', error);
    }
  }

  /**
   * Apply full state from leader (follower only)
   */
  private applyFullState(state: StateSnapshot): void {
    if (this.isLeader || !this.stateRestorer) {
      return;
    }

    try {
      console.info('[CrossTab] Applying full state from leader');
      this.stateRestorer(state);
    } catch (error) {
      console.error('Failed to apply full state:', error);
    }
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
