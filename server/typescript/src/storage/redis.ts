import Redis from 'ioredis';
import type { Message } from '../websocket/protocol';

/**
 * Redis Pub/Sub for Multi-Server Coordination
 * 
 * Enables multiple server instances to coordinate document updates
 * using Redis pub/sub channels.
 */
export class RedisPubSub {
  private publisher: Redis;
  private subscriber: Redis;
  private connected: boolean = false;
  private channelPrefix: string;
  private handlers: Map<string, Set<(message: any) => void>> = new Map();

  constructor(
    redisUrl: string,
    channelPrefix: string = 'synckit:'
  ) {
    this.channelPrefix = channelPrefix;

    // Create separate connections for pub and sub
    this.publisher = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false, // Don't queue commands when disconnected
      retryStrategy: (times) => {
        // Only retry a few times, then give up
        if (times > 3) {
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.subscriber = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false, // Don't queue commands when disconnected
      retryStrategy: (times) => {
        // Only retry a few times, then give up
        if (times > 3) {
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.setupHandlers();
  }

  /**
   * Setup Redis event handlers
   */
  private setupHandlers() {
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('error', (error) => {
      console.error('Redis subscriber error:', error);
    });

    this.publisher.on('error', (error) => {
      console.error('Redis publisher error:', error);
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);
      this.connected = true;
      // console.log('✅ Redis pub/sub connected');
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to Redis: ${error}`);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await Promise.all([
        this.publisher.quit(),
        this.subscriber.quit(),
      ]);
      this.connected = false;
      // console.log('Redis pub/sub disconnected');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.publisher.ping();
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // DOCUMENT CHANNELS
  // ==========================================================================

  /**
   * Publish delta to document channel
   */
  async publishDelta(documentId: string, delta: Message): Promise<void> {
    const channel = this.getDocumentChannel(documentId);
    await this.publish(channel, delta);
  }

  /**
   * Subscribe to document deltas
   */
  async subscribeToDocument(
    documentId: string,
    handler: (delta: Message) => void
  ): Promise<void> {
    const channel = this.getDocumentChannel(documentId);
    await this.subscribe(channel, handler);
  }

  /**
   * Unsubscribe from document
   */
  async unsubscribeFromDocument(documentId: string): Promise<void> {
    const channel = this.getDocumentChannel(documentId);
    await this.unsubscribe(channel);
  }

  // ==========================================================================
  // BROADCAST CHANNELS
  // ==========================================================================

  /**
   * Publish to broadcast channel (all servers)
   */
  async publishBroadcast(event: string, data: any): Promise<void> {
    const channel = this.getBroadcastChannel();
    await this.publish(channel, { event, data });
  }

  /**
   * Subscribe to broadcast channel
   */
  async subscribeToBroadcast(
    handler: (event: string, data: any) => void
  ): Promise<void> {
    const channel = this.getBroadcastChannel();
    await this.subscribe(channel, (message) => {
      handler(message.event, message.data);
    });
  }

  // ==========================================================================
  // PRESENCE CHANNELS (Server coordination)
  // ==========================================================================

  /**
   * Announce server presence
   */
  async announcePresence(serverId: string, metadata: any = {}): Promise<void> {
    const channel = this.getPresenceChannel();
    await this.publish(channel, {
      type: 'server_online',
      serverId,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Announce server shutdown
   */
  async announceShutdown(serverId: string): Promise<void> {
    const channel = this.getPresenceChannel();
    await this.publish(channel, {
      type: 'server_offline',
      serverId,
      timestamp: Date.now(),
    });
  }

  /**
   * Subscribe to server presence events
   */
  async subscribeToPresence(
    handler: (event: 'online' | 'offline', serverId: string, metadata?: any) => void
  ): Promise<void> {
    const channel = this.getPresenceChannel();
    await this.subscribe(channel, (message) => {
      if (message.type === 'server_online') {
        handler('online', message.serverId, message.metadata);
      } else if (message.type === 'server_offline') {
        handler('offline', message.serverId);
      }
    });
  }

  // ==========================================================================
  // CORE PUB/SUB OPERATIONS
  // ==========================================================================

  /**
   * Publish message to channel
   */
  private async publish(channel: string, data: any): Promise<void> {
    try {
      await this.publisher.publish(channel, JSON.stringify(data));
    } catch (error) {
      console.error(`Failed to publish to ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to channel
   */
  private async subscribe(channel: string, handler: (data: any) => void): Promise<void> {
    try {
      // Add handler
      if (!this.handlers.has(channel)) {
        this.handlers.set(channel, new Set());
        // Subscribe to channel if first handler
        await this.subscriber.subscribe(channel);
      }
      this.handlers.get(channel)!.add(handler);
    } catch (error) {
      console.error(`Failed to subscribe to ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from channel
   */
  private async unsubscribe(channel: string): Promise<void> {
    try {
      this.handlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      console.error(`Failed to unsubscribe from ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(channel: string, message: string) {
    try {
      const data = JSON.parse(message);
      const handlers = this.handlers.get(channel);
      
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(data);
          } catch (error) {
            console.error('Error in message handler:', error);
          }
        });
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  // ==========================================================================
  // CHANNEL NAMING
  // ==========================================================================

  private getDocumentChannel(documentId: string): string {
    return `${this.channelPrefix}doc:${documentId}`;
  }

  private getBroadcastChannel(): string {
    return `${this.channelPrefix}broadcast`;
  }

  private getPresenceChannel(): string {
    return `${this.channelPrefix}presence`;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get pub/sub statistics
   */
  getStats() {
    return {
      connected: this.connected,
      subscribedChannels: this.handlers.size,
      totalHandlers: Array.from(this.handlers.values()).reduce(
        (sum, handlers) => sum + handlers.size,
        0
      ),
    };
  }
}
