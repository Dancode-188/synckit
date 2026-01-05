/**
 * SyncKit 48-Day Production Stress Test - Node.js Version
 *
 * Runs as a server-side service on Fly.io (24/7 operation).
 * Tests memory leak fixes, WebSocket stability, and server performance.
 *
 * Target: Run continuously for 48 days generating sustained load
 */

import { SyncKit } from '@synckit-js/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

interface StressTestMetrics {
  startTime: number;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  reconnects: number;
  errors: string[];
  lastMemorySnapshot: {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  } | null;
}

class NodeStressTestClient {
  private synckit: SyncKit | null = null;
  private metrics: StressTestMetrics;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private metricsIntervalId: NodeJS.Timeout | null = null;
  private metricsFilePath: string;

  private readonly SERVER_URL: string;
  private readonly DOCUMENT_ID = 'stress-test-todos';
  private readonly OPERATION_INTERVAL_MS = 1000; // 1 operation per second
  private readonly METRICS_INTERVAL_MS = 60000; // Report metrics every minute
  private readonly MAX_ERRORS_LOGGED = 100;

  constructor(serverUrl: string, metricsDir: string = './metrics') {
    this.SERVER_URL = serverUrl;
    this.metricsFilePath = path.join(metricsDir, 'stress-test-metrics.json');

    // Ensure metrics directory exists
    if (!fs.existsSync(metricsDir)) {
      fs.mkdirSync(metricsDir, { recursive: true });
    }

    this.metrics = {
      startTime: Date.now(),
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      reconnects: 0,
      errors: [],
      lastMemorySnapshot: null,
    };

    // Restore metrics from file if available
    this.loadMetricsFromFile();
  }

  async init(): Promise<void> {
    console.log('🚀 Initializing Node.js stress test client...');
    console.log(`🔗 Server: ${this.SERVER_URL}`);

    try {
      // Initialize SyncKit with memory storage (no persistence needed for stress test)
      this.synckit = new SyncKit({
        clientId: 'stress-test-node-' + Math.random().toString(36).substring(2, 9),
        storage: 'memory', // Use memory storage for Node.js
        serverUrl: this.SERVER_URL,
      });

      await this.synckit.init();
      console.log('✅ SyncKit initialized and connected to server');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('⚠️  Stress test is already running');
      return;
    }

    this.isRunning = true;
    console.log('\n🏁 Starting 48-day stress test...');
    console.log(`📊 Target: ~4,147,200 operations over 48 days`);
    console.log(`⏱️  Rate: 1 operation/second (86,400 ops/day)`);
    console.log('');

    // Start operation loop
    this.intervalId = setInterval(() => {
      this.performOperation().catch(err => {
        console.error('Operation failed:', err);
      });
    }, this.OPERATION_INTERVAL_MS);

    // Start metrics reporting loop
    this.metricsIntervalId = setInterval(() => {
      this.reportMetrics();
      this.saveMetricsToFile();
    }, this.METRICS_INTERVAL_MS);

    // Perform first operation immediately
    await this.performOperation();
  }

  stop(): void {
    console.log('🛑 Stopping stress test...');
    this.isRunning = false;

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.metricsIntervalId !== null) {
      clearInterval(this.metricsIntervalId);
      this.metricsIntervalId = null;
    }

    this.saveMetricsToFile();
    console.log('✅ Stress test stopped');
  }

  private async performOperation(): Promise<void> {
    if (!this.synckit) {
      throw new Error('SyncKit not initialized');
    }

    this.metrics.totalOperations++;

    // Weighted random operation selection
    const rand = Math.random();
    let operation: string;

    if (rand < 0.40) operation = 'create';       // 40%
    else if (rand < 0.70) operation = 'update';  // 30%
    else if (rand < 0.85) operation = 'delete';  // 15%
    else operation = 'read';                      // 15%

    try {
      switch (operation) {
        case 'create':
          await this.createTodo();
          break;
        case 'update':
          await this.updateTodo();
          break;
        case 'delete':
          await this.deleteTodo();
          break;
        case 'read':
          await this.readTodos();
          break;
      }

      this.metrics.successfulOperations++;
    } catch (error) {
      this.metrics.failedOperations++;
      this.logError(`${operation} failed: ${error}`);
    }
  }

  private async createTodo(): Promise<void> {
    if (!this.synckit) throw new Error('SyncKit not initialized');

    const doc = this.synckit.document<{ todos: TodoItem[] }>(this.DOCUMENT_ID);
    await doc.init();

    const currentData = doc.get();
    const todos = currentData.todos || [];

    const newTodo: TodoItem = {
      id: `todo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: `Stress test todo #${this.metrics.totalOperations}`,
      completed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await doc.set('todos', [...todos, newTodo]);
  }

  private async updateTodo(): Promise<void> {
    if (!this.synckit) throw new Error('SyncKit not initialized');

    const doc = this.synckit.document<{ todos: TodoItem[] }>(this.DOCUMENT_ID);
    await doc.init();

    const currentData = doc.get();
    const todos = currentData.todos || [];

    if (todos.length === 0) {
      // No todos to update, create one instead
      await this.createTodo();
      return;
    }

    // Toggle random todo
    const randomIndex = Math.floor(Math.random() * todos.length);
    const updatedTodos = todos.map((todo, idx) => {
      if (idx === randomIndex) {
        return {
          ...todo,
          completed: !todo.completed,
          updatedAt: Date.now(),
        };
      }
      return todo;
    });

    await doc.set('todos', updatedTodos);
  }

  private async deleteTodo(): Promise<void> {
    if (!this.synckit) throw new Error('SyncKit not initialized');

    const doc = this.synckit.document<{ todos: TodoItem[] }>(this.DOCUMENT_ID);
    await doc.init();

    const currentData = doc.get();
    const todos = currentData.todos || [];

    if (todos.length === 0) {
      // No todos to delete
      return;
    }

    // Delete random todo
    const randomIndex = Math.floor(Math.random() * todos.length);
    const updatedTodos = todos.filter((_, idx) => idx !== randomIndex);

    await doc.set('todos', updatedTodos);
  }

  private async readTodos(): Promise<void> {
    if (!this.synckit) throw new Error('SyncKit not initialized');

    const doc = this.synckit.document<{ todos: TodoItem[] }>(this.DOCUMENT_ID);
    await doc.init();

    const currentData = doc.get();
    const todos = currentData.todos || [];

    // Just read the data (already fetched by doc.get())
    // Logging suppressed to reduce noise
  }

  private reportMetrics(): void {
    const now = Date.now();
    const uptime = now - this.metrics.startTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

    const successRate = this.metrics.totalOperations > 0
      ? ((this.metrics.successfulOperations / this.metrics.totalOperations) * 100).toFixed(2)
      : '0.00';

    console.log('\n📊 === Stress Test Metrics ===');
    console.log(`⏱️  Uptime: ${days}d ${hours}h ${minutes}m`);
    console.log(`📈 Total Operations: ${this.metrics.totalOperations.toLocaleString()}`);
    console.log(`✅ Successful: ${this.metrics.successfulOperations.toLocaleString()} (${successRate}%)`);
    console.log(`❌ Failed: ${this.metrics.failedOperations.toLocaleString()}`);
    console.log(`🔄 Reconnects: ${this.metrics.reconnects}`);

    // Memory snapshot (Node.js)
    const memUsage = process.memoryUsage();
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);

    console.log(`💾 Memory: ${heapUsedMB} MB / ${heapTotalMB} MB (RSS: ${rssMB} MB)`);

    // Store memory snapshot
    this.metrics.lastMemorySnapshot = {
      timestamp: now,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };

    console.log('========================\n');
  }

  private logError(message: string): void {
    const errorMsg = `[${new Date().toISOString()}] ${message}`;
    this.metrics.errors.push(errorMsg);

    // Keep only last 100 errors
    if (this.metrics.errors.length > this.MAX_ERRORS_LOGGED) {
      this.metrics.errors = this.metrics.errors.slice(-this.MAX_ERRORS_LOGGED);
    }

    console.error('❌', errorMsg);
  }

  private saveMetricsToFile(): void {
    try {
      fs.writeFileSync(
        this.metricsFilePath,
        JSON.stringify(this.metrics, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.warn('Failed to save metrics to file:', error);
    }
  }

  private loadMetricsFromFile(): void {
    try {
      if (fs.existsSync(this.metricsFilePath)) {
        const data = fs.readFileSync(this.metricsFilePath, 'utf-8');
        const loaded = JSON.parse(data);
        this.metrics = { ...this.metrics, ...loaded };
        console.log('✅ Restored metrics from file');
      }
    } catch (error) {
      console.warn('Failed to load metrics from file:', error);
    }
  }

  getMetrics(): StressTestMetrics {
    return { ...this.metrics };
  }

  exportMetrics(): string {
    return JSON.stringify(this.metrics, null, 2);
  }
}

// ====================
// Health Check Server
// ====================

function startHealthCheckServer(client: NodeStressTestClient, port: number = 8080) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const metrics = client.getMetrics();
      const isHealthy = metrics.totalOperations > 0 &&
                        (metrics.failedOperations / Math.max(metrics.totalOperations, 1)) < 0.05;

      res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: isHealthy ? 'healthy' : 'degraded',
        uptime: Date.now() - metrics.startTime,
        totalOperations: metrics.totalOperations,
        successRate: ((metrics.successfulOperations / Math.max(metrics.totalOperations, 1)) * 100).toFixed(2) + '%',
        memory: metrics.lastMemorySnapshot,
      }));
    } else if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(client.exportMetrics());
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    console.log(`🏥 Health check server listening on port ${port}`);
  });

  return server;
}

// ====================
// Main Entry Point
// ====================

const serverUrl = process.env.SERVER_URL || 'ws://localhost:8080';
const metricsDir = process.env.METRICS_DIR || './metrics';
const healthCheckPort = parseInt(process.env.PORT || '8080', 10);

console.log('🚀 SyncKit 48-Day Stress Test (Node.js)');
console.log(`🔗 Server: ${serverUrl}`);
console.log(`📁 Metrics: ${metricsDir}`);
console.log('');

const client = new NodeStressTestClient(serverUrl, metricsDir);
let healthServer: http.Server | null = null;

// Handle graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Received shutdown signal...');
  client.stop();

  if (healthServer) {
    healthServer.close(() => {
      console.log('✅ Health check server stopped');
    });
  }

  setTimeout(() => process.exit(0), 1000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize and start
client.init()
  .then(() => {
    // Start health check server
    healthServer = startHealthCheckServer(client, healthCheckPort);

    // Start stress test
    return client.start();
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

console.log('💡 Press Ctrl+C to stop the stress test');
