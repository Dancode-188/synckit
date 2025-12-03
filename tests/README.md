# SyncKit Tests

Comprehensive test suite for SyncKit sync engine.

## Setup

Install dependencies:

```bash
cd tests
bun install
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific test suites
bun test:integration    # Integration tests
bun test:load          # Load & stress tests
bun test:chaos         # Chaos engineering tests
bun test:storage       # Storage & persistence tests
bun test:sync          # Sync protocol tests
bun test:offline       # Offline/online tests

# Watch mode
bun test:watch
```

## Test Structure

```
tests/
├── binary/              # Binary protocol tests (7 tests)
├── integration/          # Integration tests
│   ├── helpers/         # Test utilities
│   ├── sync/            # Sync protocol tests (86 tests)
│   ├── storage/         # Storage & persistence (55 tests)
│   └── offline/         # Offline scenarios (103 tests)
├── load/                # Load & stress tests (73 tests)
├── chaos/               # Chaos engineering (86 tests)
```

## Test Coverage

- **Binary Protocol Tests:** 7 tests (production WebSocket binary protocol)
- **Integration Tests:** 244 tests (sync, storage, offline)
- **Load Tests:** 73 tests (concurrent clients, sustained load, burst traffic)
- **Chaos Tests:** 86 tests (network failures, packet loss, latency, convergence)
- **Total:** 410 comprehensive tests ✅ (100% pass rate)

## Prerequisites

Tests require:
- Running PostgreSQL (optional - tests work with in-memory mode)
- Running Redis (optional - tests work without Redis)
- Bun runtime

## Environment Variables

Tests use default configuration but can be customized:

```bash
TEST_PORT=3001              # Test server port
TEST_HOST=localhost         # Test server host
TEST_TIMEOUT=30000          # Test timeout (ms)
TEST_VERBOSE=false          # Verbose logging
```

## Writing New Tests

See `integration/helpers/` for test utilities:
- `test-server.ts` - Server lifecycle management
- `test-client.ts` - Test client wrapper
- `assertions.ts` - Custom assertions
- `config.ts` - Test configuration

Example test:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from './helpers/test-server';
import { TestClient } from './helpers/test-client';

describe('My Test Suite', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  it('should sync data', async () => {
    const client = new TestClient();
    await client.init();
    await client.connect();
    
    await client.setField('doc1', 'key', 'value');
    const state = await client.getDocumentState('doc1');
    
    expect(state.key).toBe('value');
    
    await client.cleanup();
  });
});
```

## Troubleshooting

**Issue:** `Cannot find package 'hono'`
- **Solution:** Run `bun install` in the `tests/` directory

**Issue:** Tests timing out
- **Solution:** Increase `TEST_TIMEOUT` or check if server is running

**Issue:** Port already in use
- **Solution:** Change `TEST_PORT` or kill process on port 3001
