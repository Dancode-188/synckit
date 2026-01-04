/**
 * SyncKit 48-Day Production Stress Test
 *
 * Tests OPFS storage + WebSocket sync under sustained load.
 * Memory leak detection via periodic heap snapshots.
 *
 * Target: Run continuously for 48 days (Jan 4 - Feb 21, 2026)
 */

import { SyncKit, OPFSStorage } from '@synckit-js/sdk';

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
  memoryUsage: {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  }[];
}

class StressTestClient {
  private synckit: SyncKit | null = null;
  private storage: OPFSStorage | null = null;
  private metrics: StressTestMetrics;
  private isRunning = false;
  private intervalId: number | null = null;
  private metricsIntervalId: number | null = null;

  private readonly SERVER_URL: string;
  private readonly DOCUMENT_ID = 'stress-test-todos';
  private readonly OPERATION_INTERVAL_MS = 1000; // 1 operation per second
  private readonly METRICS_INTERVAL_MS = 60000; // Report metrics every minute
  private readonly MAX_ERRORS_LOGGED = 100;

  constructor(serverUrl: string) {
    this.SERVER_URL = serverUrl;
    this.metrics = {
      startTime: Date.now(),
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      reconnects: 0,
      errors: [],
      memoryUsage: [],
    };

    // Restore metrics from localStorage if available
    this.loadMetricsFromStorage();
  }

  async init(): Promise<void> {
    console.log('🚀 Initializing stress test client...');

    try {
      // Initialize OPFS storage
      this.storage = new OPFSStorage('synckit-stress-test');
      await this.storage.init();
      console.log('✅ OPFS storage initialized');

      // Initialize SyncKit
      this.synckit = new SyncKit({
        clientId: 'stress-test-client-' + Math.random().toString(36).substring(2, 9),
        storage: this.storage,
        serverUrl: this.SERVER_URL,
      });

      await this.synckit.init();
      console.log('✅ SyncKit initialized and connected');
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
    this.intervalId = window.setInterval(() => {
      this.performOperation().catch(err => {
        console.error('Operation failed:', err);
      });
    }, this.OPERATION_INTERVAL_MS);

    // Start metrics reporting loop
    this.metricsIntervalId = window.setInterval(() => {
      this.reportMetrics();
      this.saveMetricsToStorage();
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

    this.saveMetricsToStorage();
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
    console.log(`📖 Read ${todos.length} todos`);
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

    // Memory snapshot (if available)
    if (performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      const heapUsedMB = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
      const heapTotalMB = (memory.totalJSHeapSize / 1024 / 1024).toFixed(2);

      console.log(`💾 Memory: ${heapUsedMB} MB / ${heapTotalMB} MB`);

      // Store memory snapshot
      this.metrics.memoryUsage.push({
        timestamp: now,
        heapUsed: memory.usedJSHeapSize,
        heapTotal: memory.totalJSHeapSize,
        external: memory.jsHeapSizeLimit || 0,
      });

      // Keep only last 1440 snapshots (24 hours at 1 per minute)
      if (this.metrics.memoryUsage.length > 1440) {
        this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-1440);
      }
    }

    console.log('========================\n');
  }

  private logError(message: string): void {
    this.metrics.errors.push(`[${new Date().toISOString()}] ${message}`);

    // Keep only last 100 errors
    if (this.metrics.errors.length > this.MAX_ERRORS_LOGGED) {
      this.metrics.errors = this.metrics.errors.slice(-this.MAX_ERRORS_LOGGED);
    }

    console.error('❌', message);
  }

  private saveMetricsToStorage(): void {
    try {
      localStorage.setItem('stress-test-metrics', JSON.stringify(this.metrics));
    } catch (error) {
      console.warn('Failed to save metrics to localStorage:', error);
    }
  }

  private loadMetricsFromStorage(): void {
    try {
      const stored = localStorage.getItem('stress-test-metrics');
      if (stored) {
        const loaded = JSON.parse(stored);
        this.metrics = { ...this.metrics, ...loaded };
        console.log('✅ Restored metrics from localStorage');
      }
    } catch (error) {
      console.warn('Failed to load metrics from localStorage:', error);
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
// Main Entry Point
// ====================

const serverUrl = import.meta.env.VITE_SERVER_URL || 'ws://localhost:8080';

console.log('🚀 SyncKit 48-Day Stress Test');
console.log(`🔗 Server: ${serverUrl}`);
console.log('');

const client = new StressTestClient(serverUrl);

// Initialize and start
client.init()
  .then(() => client.start())
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

// Handle cleanup on page unload
window.addEventListener('beforeunload', () => {
  client.stop();
});

// Expose client globally for debugging
(window as any).stressTestClient = client;

console.log('💡 Tip: Access client via window.stressTestClient');
console.log('💡 Export metrics: window.stressTestClient.exportMetrics()');
