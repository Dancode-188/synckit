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
- **Health Checks** - Built-in monitoring endpoints
- **Graceful Shutdown** - Zero data loss on restart

## Quick Start

```bash
# From repository root
cd server/csharp/src/SyncKit.Server
JWT_SECRET="test-secret-key-for-development-32-chars" dotnet run

# Server starts on http://localhost:8090
# WebSocket endpoint: ws://localhost:8090/ws
# Health check: http://localhost:8090/health
```

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
# Start test dependencies (PostgreSQL, Redis)
cd server/csharp
docker compose -f docker-compose.test.yml up -d

# Run unit tests (772 tests)
dotnet test src/SyncKit.Server.Tests/SyncKit.Server.Tests.csproj

# Run integration tests against this server
cd ../../tests
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
- AUTH, AUTH_SUCCESS, AUTH_ERROR
- SUBSCRIBE, UNSUBSCRIBE
- SYNC_REQUEST, SYNC_RESPONSE
- DELTA, DELTA_BATCH, ACK
- PING, PONG
- AWARENESS_UPDATE, AWARENESS_STATE

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
