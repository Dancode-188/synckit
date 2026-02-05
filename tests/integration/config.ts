/**
 * Integration Test Configuration
 * 
 * Centralized configuration for all integration tests
 */

export const TEST_CONFIG = {
  // Server configuration
  server: {
    host: 'localhost',
    port: 8090, // Different from default 8080 to avoid conflicts
    wsPath: '/ws',
  },

  // Database configuration (use separate test database)
  database: {
    url: process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/synckit_test',
    poolMin: 1,
    poolMax: 5,
  },

  // Redis configuration (use separate test instance)
  redis: {
    url: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1', // DB 1 for tests
    channelPrefix: 'synckit-test:',
  },

  // JWT configuration (test-only secrets)
  jwt: {
    secret: 'test-secret-key-for-integration-tests-only-32-chars',
    expiresIn: '1h',
    refreshExpiresIn: '2h',
  },

  // WebSocket configuration
  websocket: {
    heartbeatInterval: 5000, // 5s for faster tests
    heartbeatTimeout: 10000, // 10s timeout
    maxConnections: 2000, // High limit for load tests with 1000+ clients
  },

  // Test timeouts (increased for complex scenarios)
  timeouts: {
    connection: 15000, // 15s to establish connection (increased for load tests)
    sync: 10000, // 10s for sync operations (increased for chaos tests)
    convergence: 40000, // 40s for convergence in chaos tests (increased)
    cleanup: 10000, // 10s for cleanup (increased for large client counts)
  },

  // Test data
  testData: {
    defaultDocumentId: 'test-doc-1',
    defaultClientId: 'test-client-1',
    userIds: ['alice', 'bob', 'charlie', 'dave', 'eve'],
  },

  // Feature flags for tests
  features: {
    useStorage: false, // Run tests in-memory by default (faster)
    useRedis: false, // Disable Redis for single-server tests
    verbose: process.env.TEST_VERBOSE === 'true',
  },
};

/**
 * Get test server URL
 */
export function getServerUrl(): string {
  return `http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}`;
}

/**
 * Get WebSocket URL
 */
export function getWebSocketUrl(): string {
  return `ws://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}${TEST_CONFIG.server.wsPath}`;
}

/**
 * Get auth endpoint URL
 */
export function getAuthUrl(endpoint: string = ''): string {
  return `${getServerUrl()}/auth${endpoint}`;
}

/**
 * Get health check URL
 */
export function getHealthUrl(): string {
  return `${getServerUrl()}/health`;
}

/**
 * Sleep utility for tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = TEST_CONFIG.timeouts.sync,
  checkInterval: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(checkInterval);
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Generate unique test ID
 */
let testCounter = 0;
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${++testCounter}`;
}

/**
 * Create test JWT token
 */
export function createTestToken(userId: string, permissions: any = {}): string {
  // This is a simplified version - in real tests, use the actual JWT library
  // For now, we'll just create a payload that the server can verify
  const payload = {
    userId,
    permissions: {
      canRead: permissions.canRead || ['*'],
      canWrite: permissions.canWrite || ['*'],
      isAdmin: permissions.isAdmin || false,
    },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  };
  
  // In real implementation, this would use jsonwebtoken to sign
  // For tests, we'll use a placeholder that the test server recognizes
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export default TEST_CONFIG;
