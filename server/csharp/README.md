# SyncKit C# Server (ASP.NET Core)

Production-ready ASP.NET Core (.NET 10) implementation of the SyncKit sync server, providing full protocol parity with the TypeScript reference server.

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

## Related

- [TypeScript Reference Server](../typescript/README.md) - The reference implementation
- [Protocol Specification](../../protocol/specs/) - Wire protocol definitions
