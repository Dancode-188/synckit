# .NET Server Testing Strategy

## Overview

This document explains the testing approach for the .NET SyncKit server implementation and the rationale behind our choices.

## Testing Layers

### 1. Unit Tests (Primary)

**Location:** `src/SyncKit.Server.Tests/`

Unit tests are the primary testing mechanism for the .NET server. They provide:
- Fast feedback during development
- Isolation of components for targeted testing
- No external dependencies (mocked WebSocket, protocol handlers, etc.)

**Example:** `ConnectionHeartbeatTests.cs` contains tests covering the heartbeat mechanism.

### 2. Manual Verification Scripts

**Location:** `test-heartbeat.js` (and similar)

Simple Node.js scripts for quick end-to-end verification against a running server. Useful for:
- Smoke testing after changes
- Debugging protocol issues
- Verifying behavior matches TypeScript reference

**Usage:**
```bash
# Terminal 1: Start .NET server
cd src/SyncKit.Server
JWT_SECRET="test-secret-key-for-development-32-chars" dotnet run

# Terminal 2: Run test
node test-heartbeat.js
```

## Why Not Use the TypeScript Integration Tests?

The existing integration test suite in `tests/integration/` is designed to test the TypeScript server. We investigated using it for the .NET server but found challenges:

### Protocol Detection Timing

The TypeScript server uses **auto-detection** to determine JSON vs Binary protocol based on the first message received. However:

1. The server starts sending heartbeat pings immediately after connection
2. These pings are sent in binary format (the server's default)
3. By the time a test client sends a JSON message, the protocol is already locked to binary
4. Test responses are then sent in binary, which raw JSON test clients can't parse

### Current Test Framework Architecture

The TypeScript test framework (`tests/integration/helpers/test-server.ts`) directly imports and instantiates the TypeScript server:

```typescript
import { SyncWebSocketServer } from '../../../server/typescript/src/websocket/server';
// ...
this.wsServer = new SyncWebSocketServer(this.server, { ... });
```

This tight coupling means tests manage the server lifecycle internally rather than connecting to an external server.

### Future: External Server Mode

When the .NET server reaches feature parity, an external server mode could be added to the test framework. This would involve:

1. Adding a `USE_EXTERNAL_SERVER` flag to `tests/integration/config.ts`
2. Skipping server lifecycle management in `setup.ts` when the flag is set
3. Using the existing `TestClient` with proper protocol adapters (not raw WebSocket)

This was intentionally deferred - no point testing against an incomplete server.

## Recommended Approach

### For Feature Development (Current Phase)

1. **Write comprehensive unit tests** for each .NET component
2. **Use manual scripts** for quick protocol-level verification
3. **Ensure behavior matches** the TypeScript reference implementation

### For Full Integration Testing (Future)

Once the .NET server implements all core features (auth, sync, awareness):

1. Start the .NET server on the test port (8090)
2. Run the full integration suite with external server mode:
   ```bash
   USE_EXTERNAL_SERVER=true bun test integration/
   ```
3. The existing `TestClient` with proper protocol adapters should work

### For CI/CD

Consider a matrix test strategy:
```yaml
strategy:
  matrix:
    server: [typescript, dotnet]
```

Each server type starts, then the same integration tests run against it.

## Files Reference

| File | Purpose |
|------|---------|
| `src/SyncKit.Server.Tests/**/*.cs` | .NET unit tests |
| `test-heartbeat.js` | Manual heartbeat verification |
| `tests/integration/config.ts` | Test configuration (includes `useExternalServer` flag) |
| `tests/integration/setup.ts` | Test lifecycle (supports external server mode) |

## Summary

The .NET server uses unit tests as the primary quality gate because they:
- Are fast and reliable
- Don't require protocol negotiation complexity
- Can be run independently of the TypeScript ecosystem
- Provide precise control over test scenarios

The existing integration tests remain valuable for end-to-end validation once the .NET server reaches feature parity with the TypeScript reference.
