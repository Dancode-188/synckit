/**
 * Benchmark Suite Types
 * Common types and utilities for all benchmarks
 */

export interface BenchmarkResult {
  name: string;
  server: 'typescript' | 'python' | 'go';
  metrics: {
    throughput: number;      // ops/sec
    latencyP50: number;      // ms
    latencyP95: number;      // ms
    latencyP99: number;      // ms
    errorRate: number;       // percentage
    memoryUsed?: number;     // bytes
    memoryGrowth?: number;   // bytes
  };
  duration: number;          // ms
  operations: number;
  timestamp: string;
}

export interface ServerConfig {
  name: 'typescript' | 'python' | 'go';
  host: string;
  port: number;
  wsPath: string;
}

export interface BenchmarkConfig {
  servers: ServerConfig[];
  warmupDuration: number;    // ms
  testDuration: number;      // ms
  concurrentClients: number;
  documentSize: 'small' | 'medium' | 'large';
  verbose: boolean;
}

export const DEFAULT_SERVERS: ServerConfig[] = [
  { name: 'typescript', host: 'localhost', port: 8080, wsPath: '/ws' },
  { name: 'python', host: 'localhost', port: 8081, wsPath: '/ws' },
  { name: 'go', host: 'localhost', port: 8082, wsPath: '/ws' },
];

export const DEFAULT_CONFIG: BenchmarkConfig = {
  servers: DEFAULT_SERVERS,
  warmupDuration: 5000,      // 5s warmup
  testDuration: 60000,       // 60s test
  concurrentClients: 50,
  documentSize: 'medium',
  verbose: false,
};

/**
 * Calculate percentile from sorted array
 */
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Format duration to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate document data of specified size
 */
export function generateDocument(size: 'small' | 'medium' | 'large'): Record<string, unknown> {
  const sizeMap = { small: 10, medium: 100, large: 1000 };
  const count = sizeMap[size];

  const items = Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    text: `Item ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
    value: Math.random() * 1000,
    active: Math.random() > 0.5,
    timestamp: Date.now(),
  }));

  return { items, metadata: { size, count, createdAt: Date.now() } };
}
