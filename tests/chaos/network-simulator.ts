/**
 * Network Simulator for Chaos Engineering
 * 
 * Provides utilities to simulate adverse network conditions:
 * - Packet loss
 * - Latency injection
 * - Message reordering
 * - Message duplication
 * - Message corruption
 * - Random disconnections
 */

import { TestClient } from '../integration/helpers/test-client';
import { sleep } from '../integration/config';

/**
 * Network simulation configuration
 */
export interface NetworkSimConfig {
  // Packet loss (0-1, where 0.05 = 5%)
  packetLoss?: number;
  
  // Latency injection (milliseconds)
  latency?: {
    min: number;
    max: number;
  };
  
  // Message reordering probability (0-1)
  reorderProbability?: number;
  
  // Message duplication probability (0-1)
  duplicationProbability?: number;
  
  // Message corruption probability (0-1)
  corruptionProbability?: number;
  
  // Random disconnection
  disconnection?: {
    probability: number; // Probability per operation
    minDuration: number; // Minimum disconnect duration (ms)
    maxDuration: number; // Maximum disconnect duration (ms)
  };
}

/**
 * Message queue entry for reordering
 */
interface QueuedMessage {
  method: string;
  args: any[];
  timestamp: number;
  delay: number;
}

/**
 * Chaos Network Simulator
 * 
 * Wraps a TestClient to inject network chaos
 */
export class ChaosNetworkSimulator {
  private client: TestClient;
  private config: NetworkSimConfig;
  private messageQueue: QueuedMessage[] = [];
  private isProcessingQueue: boolean = false;
  private messagesDropped: number = 0;
  private messagesDuplicated: number = 0;
  private messagesCorrupted: number = 0;
  private messagesReordered: number = 0;
  private disconnections: number = 0;

  constructor(client: TestClient, config: NetworkSimConfig = {}) {
    this.client = client;
    this.config = config;
  }

  /**
   * Wrap setField operation with chaos
   */
  async setField(docId: string, field: string, value: any): Promise<void> {
    // Check for random disconnection
    await this.maybeDisconnect();
    
    // Check for packet loss
    if (this.shouldDropPacket()) {
      this.messagesDropped++;
      return; // Drop the message
    }
    
    // Check for duplication
    if (this.shouldDuplicate()) {
      this.messagesDuplicated++;
      // Send twice
      await this.sendWithChaos('setField', [docId, field, value]);
      await this.sendWithChaos('setField', [docId, field, value]);
      return;
    }
    
    // Check for corruption
    // In real networks, corrupted packets are detected by checksums and DROPPED, not delivered with wrong data
    // So we treat corruption as packet loss to simulate realistic behavior
    if (this.shouldCorrupt()) {
      this.messagesCorrupted++;
      // Drop the corrupted message (realistic network behavior)
      return;
    }
    
    // Normal send with possible reordering/latency
    await this.sendWithChaos('setField', [docId, field, value]);
  }

  /**
   * Wrap getField operation with chaos
   */
  async getField(docId: string, field: string): Promise<any> {
    await this.maybeDisconnect();
    return await this.client.getField(docId, field);
  }

  /**
   * Wrap deleteField operation with chaos
   */
  async deleteField(docId: string, field: string): Promise<void> {
    await this.maybeDisconnect();
    
    if (this.shouldDropPacket()) {
      this.messagesDropped++;
      return;
    }
    
    await this.sendWithChaos('deleteField', [docId, field]);
  }

  /**
   * Wrap getDocumentState operation
   */
  async getDocumentState(docId: string): Promise<any> {
    await this.maybeDisconnect();
    return await this.client.getDocumentState(docId);
  }

  /**
   * Wait for field with chaos tolerance
   */
  async waitForField(
    docId: string,
    field: string,
    expectedValue: any,
    timeout: number = 10000
  ): Promise<void> {
    // Extended timeout to account for chaos
    const chaosTimeout = timeout * 2;
    return await this.client.waitForField(docId, field, expectedValue, chaosTimeout);
  }

  /**
   * Connect with chaos
   */
  async connect(token?: string): Promise<void> {
    // Add connection latency
    if (this.config.latency) {
      const delay = this.getRandomLatency();
      await sleep(delay);
    }
    
    return await this.client.connect(token);
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    return await this.client.disconnect();
  }

  /**
   * Get client ID
   */
  get id(): string {
    return this.client.id;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.client.isConnected;
  }

  /**
   * Get chaos statistics
   */
  getStats() {
    return {
      messagesDropped: this.messagesDropped,
      messagesDuplicated: this.messagesDuplicated,
      messagesCorrupted: this.messagesCorrupted,
      messagesReordered: this.messagesReordered,
      disconnections: this.disconnections,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.messagesDropped = 0;
    this.messagesDuplicated = 0;
    this.messagesCorrupted = 0;
    this.messagesReordered = 0;
    this.disconnections = 0;
  }

  /**
   * Send operation with chaos injection
   */
  private async sendWithChaos(method: string, args: any[]): Promise<void> {
    const latency = this.getRandomLatency();
    
    // Check for reordering
    if (this.shouldReorder()) {
      this.messagesReordered++;
      // Queue for later delivery
      this.messageQueue.push({
        method,
        args,
        timestamp: Date.now(),
        delay: latency + Math.random() * 500, // Additional random delay
      });
      this.processQueue();
      return;
    }
    
    // Apply latency
    if (latency > 0) {
      await sleep(latency);
    }
    
    // Execute the operation
    await (this.client as any)[method](...args);
  }

  /**
   * Process queued messages
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      await sleep(message.delay);
      
      try {
        await (this.client as any)[message.method](...message.args);
      } catch (error) {
        // Ignore errors from chaos
      }
    }
    
    this.isProcessingQueue = false;
  }

  /**
   * Determine if packet should be dropped
   */
  private shouldDropPacket(): boolean {
    if (!this.config.packetLoss) return false;
    return Math.random() < this.config.packetLoss;
  }

  /**
   * Determine if message should be duplicated
   */
  private shouldDuplicate(): boolean {
    if (!this.config.duplicationProbability) return false;
    return Math.random() < this.config.duplicationProbability;
  }

  /**
   * Determine if message should be corrupted
   */
  private shouldCorrupt(): boolean {
    if (!this.config.corruptionProbability) return false;
    return Math.random() < this.config.corruptionProbability;
  }

  /**
   * Determine if message should be reordered
   */
  private shouldReorder(): boolean {
    if (!this.config.reorderProbability) return false;
    return Math.random() < this.config.reorderProbability;
  }

  /**
   * Get random latency based on config
   */
  private getRandomLatency(): number {
    if (!this.config.latency) return 0;
    const { min, max } = this.config.latency;
    return min + Math.random() * (max - min);
  }

  /**
   * Corrupt a value
   */
  private corruptValue(value: any): any {
    if (typeof value === 'string') {
      // Corrupt string by changing random character
      const chars = value.split('');
      const idx = Math.floor(Math.random() * chars.length);
      chars[idx] = String.fromCharCode(Math.floor(Math.random() * 128));
      return chars.join('');
    } else if (typeof value === 'number') {
      // Corrupt number by adding random offset
      return value + (Math.random() - 0.5) * 100;
    } else if (typeof value === 'boolean') {
      // Flip boolean
      return !value;
    }
    return value;
  }

  /**
   * Maybe trigger random disconnection
   */
  private async maybeDisconnect(): Promise<void> {
    if (!this.config.disconnection) return;

    const { probability, minDuration, maxDuration } = this.config.disconnection;

    if (Math.random() < probability && this.client.isConnected) {
      this.disconnections++;

      const duration = minDuration + Math.random() * (maxDuration - minDuration);

      // Disconnect
      await this.client.disconnect();

      // Wait for the disconnection duration
      await sleep(duration);

      // Reconnect and wait for it to complete
      try {
        await this.client.connect();
      } catch (error) {
        // Ignore reconnection errors but log them
        console.error('[ChaosNetworkSimulator] Reconnection failed:', error);
      }
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    await this.client.cleanup();
  }
}

/**
 * Create multiple chaos simulators
 */
export async function createChaosClients(
  count: number,
  config: NetworkSimConfig
): Promise<ChaosNetworkSimulator[]> {
  const { TestClient } = await import('../integration/helpers/test-client');
  const { BinaryAdapter } = await import('../integration/helpers/binary-adapter');
  const clients: ChaosNetworkSimulator[] = [];

  for (let i = 0; i < count; i++) {
    const client = new TestClient({ adapter: new BinaryAdapter() });
    await client.init();
    const chaosClient = new ChaosNetworkSimulator(client, config);
    clients.push(chaosClient);
  }

  return clients;
}

/**
 * Cleanup chaos clients
 */
export async function cleanupChaosClients(
  clients: ChaosNetworkSimulator[]
): Promise<void> {
  await Promise.all(clients.map(client => client.cleanup()));
}

/**
 * Preset chaos configurations
 */
export const ChaosPresets = {
  /**
   * Light packet loss (5%)
   */
  lightPacketLoss: {
    packetLoss: 0.05,
  },
  
  /**
   * Moderate packet loss (10%)
   */
  moderatePacketLoss: {
    packetLoss: 0.10,
  },
  
  /**
   * Heavy packet loss (25%)
   */
  heavyPacketLoss: {
    packetLoss: 0.25,
  },
  
  /**
   * Low latency (50ms average)
   */
  lowLatency: {
    latency: { min: 25, max: 75 },
  },
  
  /**
   * High latency (500ms average)
   */
  highLatency: {
    latency: { min: 250, max: 750 },
  },
  
  /**
   * Extreme latency (2s average)
   */
  extremeLatency: {
    latency: { min: 1000, max: 3000 },
  },
  
  /**
   * Message reordering (20% chance)
   */
  reordering: {
    reorderProbability: 0.20,
    latency: { min: 50, max: 200 },
  },
  
  /**
   * Message duplication (10% chance)
   */
  duplication: {
    duplicationProbability: 0.10,
  },
  
  /**
   * Message corruption (5% chance)
   */
  corruption: {
    corruptionProbability: 0.05,
  },
  
  /**
   * Random disconnections
   */
  disconnections: {
    disconnection: {
      probability: 0.10, // 10% per operation (was 0.05)
      minDuration: 100,
      maxDuration: 500,
    },
  },
  
  /**
   * Complete chaos (all conditions)
   */
  completeChaos: {
    packetLoss: 0.10,
    latency: { min: 50, max: 300 },
    reorderProbability: 0.15,
    duplicationProbability: 0.05,
    corruptionProbability: 0.03,
    disconnection: {
      probability: 0.08, // 8% per operation (was 0.03)
      minDuration: 100,
      maxDuration: 400,
    },
  },
};
