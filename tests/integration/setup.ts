/**
 * Integration Test Setup
 * 
 * Global test lifecycle management for integration tests
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { setupTestServer, teardownTestServer, restartTestServer, TestServer } from './helpers/test-server';
import { TestClient, cleanupTestClients } from './helpers/test-client';
import { BinaryAdapter } from './helpers/binary-adapter';
import { clearMemoryStorage } from './helpers/memory-storage';
import { TEST_CONFIG } from './config';

// Re-export TEST_CONFIG for test files
export { TEST_CONFIG } from './config';

/**
 * Global test state
 */
interface TestState {
  server: TestServer | null;
  clients: TestClient[];
}

const globalState: TestState = {
  server: null,
  clients: [],
};

/**
 * Setup test environment (call in beforeAll)
 */
export async function setupTests(): Promise<TestServer> {
  if (TEST_CONFIG.features.verbose) {
    console.log('\n[Setup] Starting test environment...');
  }

  // Start test server
  const server = await setupTestServer();
  globalState.server = server;

  if (TEST_CONFIG.features.verbose) {
    console.log('[Setup] Test environment ready\n');
  }

  return server;
}

/**
 * Teardown test environment (call in afterAll)
 */
export async function teardownTests(): Promise<void> {
  if (TEST_CONFIG.features.verbose) {
    console.log('\n[Teardown] Cleaning up test environment...');
  }

  // Cleanup any remaining clients
  if (globalState.clients.length > 0) {
    await cleanupTestClients(globalState.clients);
    globalState.clients = [];
  }

  // Stop test server
  await teardownTestServer();
  globalState.server = null;

  if (TEST_CONFIG.features.verbose) {
    console.log('[Teardown] Test environment cleaned up\n');
  }
}

/**
 * Setup before each test (call in beforeEach)
 */
export async function setupEachTest(): Promise<void> {
  // Clear any clients from previous test
  if (globalState.clients.length > 0) {
    await cleanupTestClients(globalState.clients);
    globalState.clients = [];
  }

  if (TEST_CONFIG.features.verbose) {
    console.log('[BeforeEach] Test initialized');
  }
}

/**
 * Cleanup after each test (call in afterEach)
 */
export async function cleanupEachTest(): Promise<void> {
  // Cleanup test clients
  if (globalState.clients.length > 0) {
    await cleanupTestClients(globalState.clients);
    globalState.clients = [];
  }

  // Clear memory storage to prevent state pollution between tests
  clearMemoryStorage();

  // Clear coordinator's in-memory cache to prevent state pollution
  if (globalState.server) {
    globalState.server.clearCoordinatorCache();
  }

  if (TEST_CONFIG.features.verbose) {
    console.log('[AfterEach] Test cleaned up (including storage and coordinator cache)\n');
  }
}

/**
 * Register a test client for automatic cleanup
 */
export function registerClient(client: TestClient): TestClient {
  globalState.clients.push(client);
  return client;
}

/**
 * Create and register test client (auto-connects by default)
 */
export async function createClient(config?: any): Promise<TestClient> {
  // Use BinaryAdapter by default (production protocol)
  // Tests can override by passing adapter in config
  const clientConfig = {
    adapter: new BinaryAdapter(),
    ...config,
  };

  const client = new TestClient(clientConfig);
  await client.init();

  // Auto-connect unless explicitly disabled
  if (config?.autoConnect !== false) {
    await client.connect(config?.token);
  }

  return registerClient(client);
}

/**
 * Create and register multiple test clients
 */
export async function createClients(count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  
  for (let i = 0; i < count; i++) {
    const client = await createClient({
      userId: TEST_CONFIG.testData.userIds[i % TEST_CONFIG.testData.userIds.length],
    });
    clients.push(client);
  }
  
  return clients;
}

/**
 * Get test server instance
 */
export function getServer(): TestServer {
  if (!globalState.server) {
    throw new Error('Test server not initialized. Call setupTests() in beforeAll');
  }
  return globalState.server;
}

/**
 * Helper to setup standard test suite
 * 
 * Usage:
 * ```typescript
 * import { describe, it } from 'bun:test';
 * import { setupTestSuite } from './setup';
 * 
 * describe('My Test Suite', () => {
 *   setupTestSuite();
 *   
 *   it('should work', async () => {
 *     // test code
 *   });
 * });
 * ```
 */
export function setupTestSuite() {
  beforeAll(async () => {
    await setupTests();
  });

  afterAll(async () => {
    await teardownTests();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  afterEach(async () => {
    await cleanupEachTest();
  });
}

/**
 * Helper to run test with isolated clients
 * 
 * Automatically creates clients and cleans them up after test
 */
export async function withClients<T>(
  count: number,
  testFn: (clients: TestClient[]) => Promise<T>
): Promise<T> {
  const clients = await createClients(count);
  
  try {
    return await testFn(clients);
  } finally {
    await cleanupTestClients(clients);
    // Remove from global state
    globalState.clients = globalState.clients.filter(c => !clients.includes(c));
  }
}

/**
 * Helper to run test with connected clients
 */
export async function withConnectedClients<T>(
  count: number,
  testFn: (clients: TestClient[]) => Promise<T>
): Promise<T> {
  return withClients(count, async (clients) => {
    // Connect all clients
    await Promise.all(clients.map(client => client.connect()));
    
    return await testFn(clients);
  });
}

// Re-export helpers
export { restartTestServer } from './helpers/test-server';
export { sleep, waitFor } from './config';
export * from './helpers/assertions';

export default {
  setupTests,
  teardownTests,
  setupEachTest,
  cleanupEachTest,
  setupTestSuite,
  createClient,
  createClients,
  registerClient,
  getServer,
  withClients,
  withConnectedClients,
};
