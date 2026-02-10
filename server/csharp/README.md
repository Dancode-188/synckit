# SyncKit C# Server (ASP.NET Core)

Production-ready ASP.NET Core (.NET 10) implementation of the SyncKit sync server, providing full protocol parity with the TypeScript reference server.

## Why C# / .NET?

The TypeScript server works great, but not everyone wants to run Node.js or Bun in production. If your team already runs .NET services, the C# server is a drop-in replacement that implements the exact same binary protocol. It brings the strengths of the .NET ecosystem—strong typing, mature tooling, and battle-tested hosting infrastructure—to SyncKit.

**When to choose the C# server:**
- Your team already uses .NET / ASP.NET Core in production
- You want first-class integration with Azure, IIS, or Windows Server
- You prefer static typing and compile-time safety
- You need .NET Aspire orchestration for local development (see `orchestration/aspire/`)

## Features

- **Binary WebSocket Protocol** - Efficient binary protocol with JSON backward compatibility
- **SDK Compatibility Layer** - Auto-detection and payload normalization for SDK clients
- **JWT Authentication** - Secure token-based authentication with refresh tokens
- **RBAC** - Document-level permissions (read/write/admin)
- **PostgreSQL Storage** - Persistent document storage
- **Redis Pub/Sub** - Multi-server coordination
- **Vector Clocks** - Causality tracking and conflict resolution
- **LWW Merge** - Last-Write-Wins conflict resolution
- **Delta Sync** - Efficient incremental updates with ACK reliability
- **Input Validation** - Document ID and field path sanitization against injection/traversal
- **Security Headers** - CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **CORS Configuration** - Configurable allowed origins (default: `*`)
- **Rate Limiting** - Configurable per-minute request limits
- **Graceful Degradation** - Automatic fallback to in-memory storage when PostgreSQL/Redis unavailable
- **Health Checks** - Built-in monitoring endpoints (`GET /health`, `GET /`)
- **Graceful Shutdown** - Zero data loss on restart
- **BenchmarkDotNet Suite** - Performance micro-benchmarks for JWT, protocol, vector clocks, documents

## Quick Start

```bash
# From repository root
cd server/csharp/src/SyncKit.Server
JWT_SECRET="test-secret-key-for-development-32-chars" dotnet run

# Server starts on http://localhost:8080
# WebSocket endpoint: ws://localhost:8080/ws
# Health check: http://localhost:8080/health
```

## Local development with demo app 🔁

Follow these steps to run the .NET server and the demo app together for fast, integrated local development (no Aspire required):

1) Start the server (development JWT required)

```bash
# from repo root
JWT_SECRET="test-secret-key-for-development-32-chars" \
  dotnet run --project server/csharp/src/SyncKit.Server/SyncKit.Server.csproj

# or from the server folder
cd server/csharp/src/SyncKit.Server
JWT_SECRET="test-secret-key-for-development-32-chars" dotnet run
```

- Server endpoints:
  - HTTP: http://localhost:8080/
  - Health: http://localhost:8080/health
  - WebSocket: ws://localhost:8080/ws

2) Point the demo at your local server and run it

- Quick (manual) approach: edit `demo/src/lib/synckit.ts` and change the `serverUrl` to the local WebSocket endpoint:

```ts
// demo/src/lib/synckit.ts
// before
serverUrl: 'wss://synckit-localwrite.fly.dev/ws',

// change to
serverUrl: 'ws://localhost:8080/ws',
```

- Recommended (env-driven) option: make the demo configurable via Vite and run with an env var. Replace the `serverUrl` in `demo/src/lib/synckit.ts` with:

```ts
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'wss://synckit-localwrite.fly.dev/ws';
// pass SERVER_URL into new SyncKit({ serverUrl: SERVER_URL, ... })
```

Then start the demo:

```bash
cd demo
npm install
# run with local server URL
VITE_SERVER_URL=ws://localhost:8080 npm run dev
```

Open the demo in your browser (Vite default: http://localhost:5173). The demo will connect to `ws://localhost:8080/ws`.

3) Optional: start Redis / PostgreSQL for multi-server features

- Redis (pub/sub / awareness):

```bash
docker run -p 6379:6379 -d redis:7
export REDIS_URL=redis://localhost:6379
# restart server with REDIS_URL set
```

- PostgreSQL (persistent storage):

```bash
docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=synckit -d postgres:15
export DATABASE_URL="Host=localhost;Port=5432;Database=synckit;Username=postgres;Password=[default password]"
# restart server with DATABASE_URL set
```

4) Quick verification & auth

```bash
# health
curl -s http://localhost:8080/health

# test auth login (demo uses demo login endpoint)
curl -X POST http://localhost:8080/auth/login -H "Content-Type: application/json" -d '{"email":"user@example.com","password":"password123"}'
```

Notes & troubleshooting:

- `JWT_SECRET` must be set for development (32+ chars). The server will error if missing.
- CORS is permissive (`*`) by default, so the Vite dev origin should be allowed.
- If the demo is not connecting, ensure the demo's `serverUrl` points to `ws://localhost:8080/ws` (or set `VITE_SERVER_URL` and restart Vite).
- For multi-server behavior (awareness/pubsub), ensure Redis is running and `REDIS_URL` is exported before starting the server.

---

## Documentation

| Document | Description |
|----------|-------------|
| [src/README.md](src/README.md) | Full documentation: configuration, development, testing |
| [TESTING.md](TESTING.md) | Testing strategy and test execution guide |
| [src/SyncKit.Server/LOGGING.md](src/SyncKit.Server/LOGGING.md) | Logging configuration and best practices |

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/)
- Docker & Docker Compose (for test dependencies)

## Testing

```bash
# Run unit tests (866 tests)
cd server/csharp/src
dotnet test SyncKit.Server.Tests/SyncKit.Server.Tests.csproj

# Run benchmarks
cd SyncKit.Server.Benchmarks
dotnet run -c Release

# Run integration tests against this server
cd ../../../../tests
./integration/run-against-csharp.sh
```

## Performance

Performance benchmarks show parity with the TypeScript reference server. See [docs/architecture/SERVER_PERFORMANCE.md](../../docs/architecture/SERVER_PERFORMANCE.md) for detailed metrics.

## Protocol Compatibility

The C# server implements the exact same binary WebSocket protocol as the TypeScript, Python, and Go servers:

```
┌─────────────┬──────────────┬───────────────┬──────────────┐
│Type (1 byte)│ Timestamp    │Payload Length │ Payload      │
│             │ (8 bytes)    │ (4 bytes)     │ (JSON bytes) │
└─────────────┴──────────────┴───────────────┴──────────────┘
```

Supported message types:
- CONNECT, DISCONNECT
- AUTH, AUTH_SUCCESS, AUTH_ERROR
- SUBSCRIBE, UNSUBSCRIBE
- SYNC_REQUEST, SYNC_RESPONSE
- DELTA, ACK
- PING, PONG
- AWARENESS_UPDATE, AWARENESS_SUBSCRIBE, AWARENESS_STATE
- ERROR

## Differences from TypeScript Server

The C# server aims for 100% protocol compatibility with the TypeScript reference. Implementation differences:

- **Framework:** ASP.NET Core (Kestrel) instead of Bun + Hono
- **WebSocket:** `System.Net.WebSockets` instead of the `ws` library
- **Auth:** `Microsoft.AspNetCore.Authentication.JwtBearer` instead of jose
- **Database:** Npgsql (ADO.NET) instead of node-postgres
- **Pub/Sub:** StackExchange.Redis instead of ioredis
- **Concurrency model:** Async/await with `Task` and `SemaphoreSlim` instead of Node.js event loop
- **Backpressure:** Configurable per-connection send queue limits (see [SERVER_PERFORMANCE.md](../../docs/architecture/SERVER_PERFORMANCE.md#websocket-backpressure-configuration))

**What's the same:** Clients can't tell the difference—they see the same WebSocket protocol, the same message types, and the same sync behavior.

## Related

- [TypeScript Reference Server](../typescript/README.md) - The reference implementation
- [Go Server](../go/README.md) - Go implementation
- [Python Server](../python/README.md) - Python implementation
- [Protocol Specification](../../protocol/specs/) - Wire protocol definitions
