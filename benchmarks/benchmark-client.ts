/**
 * Benchmark WebSocket Client
 * A lightweight client for benchmarking all server implementations
 */

import WebSocket from 'ws';
import { ServerConfig, sleep } from './types';

// Binary protocol message types (matching server implementations)
const MessageType = {
  PING: 0x01,
  PONG: 0x02,
  AUTH: 0x10,
  AUTH_SUCCESS: 0x11,
  AUTH_ERROR: 0x12,
  SUBSCRIBE: 0x20,
  UNSUBSCRIBE: 0x21,
  SYNC_RESPONSE: 0x22,
  DELTA: 0x30,
  DELTA_BATCH: 0x31,
  ACK: 0x32,
  ERROR: 0xFF,
} as const;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  startTime: number;
}

export class BenchmarkClient {
  private ws: WebSocket | null = null;
  private config: ServerConfig;
  private messageId = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private connected = false;
  private authenticated = false;
  private latencies: number[] = [];
  private errors = 0;
  private operations = 0;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async connect(timeout = 10000): Promise<void> {
    const url = `ws://${this.config.host}:${this.config.port}${this.config.wsPath}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout to ${this.config.name}`));
      }, timeout);

      try {
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.on('open', () => {
          clearTimeout(timer);
          this.connected = true;
          resolve();
        });

        this.ws.on('message', (data: ArrayBuffer) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (err) => {
          clearTimeout(timer);
          this.errors++;
          reject(err);
        });

        this.ws.on('close', () => {
          this.connected = false;
          this.authenticated = false;
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async authenticate(userId = 'benchmark-user', clientId?: string): Promise<void> {
    const id = this.nextMessageId();
    const payload = {
      type: 'auth',
      id,
      timestamp: Date.now(),
      userId,
      clientId: clientId || `benchmark-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };

    await this.sendAndWait(MessageType.AUTH, payload, id);
    this.authenticated = true;
  }

  async subscribe(docId: string): Promise<unknown> {
    const id = this.nextMessageId();
    const payload = {
      type: 'subscribe',
      id,
      timestamp: Date.now(),
      docId,
    };

    return this.sendAndWait(MessageType.SUBSCRIBE, payload, id);
  }

  async sendDelta(docId: string, changes: Record<string, unknown>): Promise<void> {
    const id = this.nextMessageId();
    const payload = {
      type: 'delta',
      id,
      timestamp: Date.now(),
      docId,
      changes,
    };

    await this.sendAndWait(MessageType.DELTA, payload, id);
    this.operations++;
  }

  async ping(): Promise<number> {
    const id = this.nextMessageId();
    const payload = {
      type: 'ping',
      id,
      timestamp: Date.now(),
    };

    const startTime = Date.now();
    await this.sendAndWait(MessageType.PING, payload, id);
    return Date.now() - startTime;
  }

  private nextMessageId(): string {
    return `bench-${++this.messageId}-${Date.now()}`;
  }

  private async sendAndWait(type: number, payload: unknown, id: string, timeout = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.errors++;
        reject(new Error(`Request timeout: ${id}`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        startTime: Date.now(),
      });

      try {
        this.send(type, payload);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        this.errors++;
        reject(err);
      }
    });
  }

  private send(type: number, payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    const timestamp = BigInt(Date.now());

    // Binary protocol: 1 byte type + 8 bytes timestamp + 4 bytes length + payload
    const buffer = Buffer.alloc(1 + 8 + 4 + payloadBytes.length);
    buffer.writeUInt8(type, 0);
    buffer.writeBigInt64BE(timestamp, 1);
    buffer.writeUInt32BE(payloadBytes.length, 9);
    payloadBytes.copy(buffer, 13);

    this.ws.send(buffer);
  }

  private handleMessage(data: ArrayBuffer): void {
    try {
      const buffer = Buffer.from(data);
      if (buffer.length < 13) return;

      const payloadLength = buffer.readUInt32BE(9);
      const payloadBytes = buffer.slice(13, 13 + payloadLength);
      const payload = JSON.parse(payloadBytes.toString('utf8'));

      const id = payload.id;
      const pending = this.pendingRequests.get(id);

      if (pending) {
        const latency = Date.now() - pending.startTime;
        this.latencies.push(latency);
        this.pendingRequests.delete(id);
        pending.resolve(payload);
      }
    } catch (err) {
      this.errors++;
    }
  }

  getLatencies(): number[] {
    return [...this.latencies];
  }

  getErrors(): number {
    return this.errors;
  }

  getOperations(): number {
    return this.operations;
  }

  resetMetrics(): void {
    this.latencies = [];
    this.errors = 0;
    this.operations = 0;
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.authenticated = false;
      await sleep(100);
    }
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }
}
