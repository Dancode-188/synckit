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

### 2. Manual Verification

Simple scripts or cURL commands for quick end-to-end verification against a running server. Useful for:
- Smoke testing after changes
- Debugging protocol issues
- Verifying behavior matches TypeScript reference

**Usage:**
```bash
# Terminal 1: Start .NET server
cd src/SyncKit.Server
JWT_SECRET="test-secret-key-for-development-32-chars" dotnet run

# Terminal 2: Health check
curl -s http://localhost:8080/health
```

### 3. Separate Terminal Testing (Recommended for Development)

When developing and debugging the server, run test commands in a **separate terminal** from your server process. This ensures:

- Your debug session continues uninterrupted
- Server logs remain visible and uncluttered
- You can quickly iterate on test commands

**Quick Health Check:**
```bash
# In a separate terminal while server is running
curl -s -w '\nHTTP Status: %{http_code}\n' http://localhost:8080/health
```

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Basic health check with HTTP status code |

> **💡 VS Code Users:** The repository includes pre-configured tasks in `.vscode/tasks.json` (`Health Check`, `Health Check (Verbose)`) that run in a new terminal panel. Access via `Cmd+Shift+P` → "Tasks: Run Task".

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

### External Server Mode

The test framework supports running against an external server via the `TEST_SERVER_TYPE` environment variable in `tests/integration/config.ts`. Set it to `'csharp'` or `'external'` to connect to a pre-started server instead of spawning the TypeScript server internally.

The test config uses port 8090 by default (overridable via `TEST_SERVER_PORT`) to avoid conflicts with the server's default port of 8080.

## Recommended Approach

### For Feature Development (Current Phase)

1. **Write comprehensive unit tests** for each .NET component
2. **Use manual scripts** for quick protocol-level verification
3. **Ensure behavior matches** the TypeScript reference implementation

### For Full Integration Testing (Future)

Once the .NET server implements all core features (auth, sync, awareness):

1. Start the .NET server on the test port (8090):
   ```bash
   cd server/csharp/src/SyncKit.Server
   SYNCKIT_SERVER_URL=http://localhost:8090 \
   SYNCKIT_AUTH_REQUIRED=false \
   JWT_SECRET='test-secret-key-for-integration-tests-only-32-chars' \
   dotnet run
   ```
2. Run the full integration suite with the C# server type:
   ```bash
   cd tests
   TEST_SERVER_TYPE=csharp bun test integration/
   ```
3. Or use the convenience script:
   ```bash
   ./integration/run-against-csharp.sh
   ```

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
| `.vscode/tasks.json` | VS Code tasks for health checks (non-blocking) |
| `src/SyncKit.Server.Tests/**/*.cs` | .NET unit tests (866 tests) |
| `src/SyncKit.Server.Benchmarks/**/*.cs` | BenchmarkDotNet performance micro-benchmarks |

| `tests/integration/config.ts` | Test configuration (includes `TEST_SERVER_TYPE` flag: `'typescript'`, `'csharp'`, or `'external'`) |
| `tests/integration/setup.ts` | Test lifecycle (supports external server mode) |

## Testing REST Auth Endpoints (Phase 3)

### Unit Tests

The AuthController has comprehensive unit tests covering all endpoints:

```bash
cd src
dotnet test --filter "FullyQualifiedName~AuthControllerTests"
```

**Test Coverage (16 tests):**
- Login endpoint (valid/invalid credentials, permissions)
- Token refresh (valid/invalid/missing tokens)
- User info retrieval (/auth/me)
- Token verification
- Complete authentication flow integration

### Additional Test Categories

Beyond auth, the test suite includes dedicated coverage for:

- **Input Validation** (16 tests) — Document ID regex, field path traversal, null bytes, max length
- **Security Headers** (7 tests) — CSP, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy
- **Rate Limiting & CORS** (7 tests) — Config defaults, env var overrides, allowed origins
- **Cross-Server JWT** (9 tests) — C#↔TypeScript token interop, claim extraction, wrong-secret rejection
- **LWW Conflict Resolution** (11 tests) — 3-tier tiebreaker, tombstones, permutation determinism, multi-client
- **Graceful Degradation** (6 tests) — FallbackStorageAdapter, PostgreSQL failure → in-memory fallback
- **Root Endpoint** (4 tests) — `GET /` JSON shape, features, endpoints

### Performance Benchmarks (BenchmarkDotNet)

A separate project (`SyncKit.Server.Benchmarks`) provides micro-benchmarks:

```bash
cd src/SyncKit.Server.Benchmarks
dotnet run -c Release
```

Benchmark classes:
- `JwtBenchmarks` — Token generation and validation throughput
- `ProtocolBenchmarks` — Binary/JSON serialization round-trips
- `VectorClockBenchmarks` — Increment, merge, comparison at various sizes
- `DocumentBenchmarks` — AddDelta, BuildState, LWW resolution at 1K/10K scale

### Manual Testing

Use cURL commands for quick endpoint verification:

```bash
# Login
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "permissions": {
      "canRead": ["doc-1"],
      "canWrite": ["doc-1"],
      "isAdmin": false
    }
  }'

# Save the accessToken and refreshToken from response, then:

# Get user info
curl -X GET http://localhost:8080/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Verify token
curl -X POST http://localhost:8080/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "<ACCESS_TOKEN>"}'

# Refresh token
curl -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<REFRESH_TOKEN>"}'
```

### Expected Responses

**Login Success:**
```json
{
  "userId": "user-1234567890",
  "email": "test@example.com",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "permissions": {
    "canRead": ["doc-1"],
    "canWrite": ["doc-1"],
    "isAdmin": false
  }
}
```

**Error Response:**
```json
{
  "error": "Email required"
}
```

## Summary

The .NET server uses unit tests as the primary quality gate (866 tests across 40+ test classes) because they:
- Are fast and reliable
- Don't require protocol negotiation complexity
- Can be run independently of the TypeScript ecosystem
- Provide precise control over test scenarios

The existing integration tests remain valuable for end-to-end validation once the .NET server reaches feature parity with the TypeScript reference.
