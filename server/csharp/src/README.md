# SyncKit .NET Server

ASP.NET Core (.NET 10) implementation of the SyncKit sync server.

## Prerequisites

- Install the .NET 10 SDK: https://dotnet.microsoft.com/
- Docker & Docker Compose (for test dependencies: PostgreSQL, Redis)
- A POSIX-compatible shell for the examples below (macOS, Linux)

## Quick Start

From the repository root run the server locally with a development JWT secret:

```bash
# from repo root
JWT_SECRET="test-secret-key-for-development-32-chars" \
  dotnet run --project server/csharp/src/SyncKit.Server/SyncKit.Server.csproj
```

Or run from the server folder:

```bash
cd server/csharp/src/SyncKit.Server
JWT_SECRET="test-secret-key-for-development-32-chars" dotnet run
```

The server exposes a root info endpoint at `GET /` and a health endpoint at `GET /health` by default, and listens on the configured ASP.NET Core URL (see Configuration).

The server automatically falls back to in-memory storage if PostgreSQL or Redis is unavailable, allowing development without Docker dependencies.

## Configuration

Configuration is driven by environment variables and the standard ASP.NET Core configuration system. Common variables:

- `JWT_SECRET`: Required for local development. A 32+ character secret used to sign development JWTs.
- `JWT_ISSUER`: Optional issuer to enforce during JWT validation.
- `JWT_AUDIENCE`: Optional audience to enforce during JWT validation.
- `ASPNETCORE_ENVIRONMENT`: `Development` (default) or `Production`.
- `ConnectionStrings__synckit`: PostgreSQL connection string for persistent storage (alternatively use `DATABASE_URL`).
- `REDIS_URL`: Redis connection string for pub/sub coordination (alternatively use `ConnectionStrings__redis`).
- `PORT` or `ASPNETCORE_URLS`: Server listening port(s). Example: `http://localhost:5000`.
- `RATE_LIMIT_PER_MINUTE`: Max requests per minute per client (default: `100`).
- `MAX_CONNECTIONS_PER_IP`: Max concurrent WebSocket connections per IP (default: `50`).
- `SYNCKIT_CORS_ORIGINS`: Comma-separated allowed CORS origins (default: `*`).

Example `env` for development:

```bash
export JWT_SECRET="test-secret-key-for-development-32-chars"
export JWT_ISSUER="synckit-server"
export JWT_AUDIENCE="synckit-api"
export ASPNETCORE_ENVIRONMENT=Development
export DATABASE_URL="Host=localhost;Port=5432;Database=synckit;Username=postgres;Password=postgres"
export REDIS_URL=redis://localhost:6379
export ASPNETCORE_URLS="http://localhost:5000"
```

Configuration precedence follows ASP.NET Core conventions: appsettings.json -> appsettings.{Environment}.json -> environment variables -> command line.

## Development

- Restore and build

```bash
dotnet restore server/csharp/src/SyncKit.Server/SyncKit.Server.csproj
dotnet build server/csharp/src/SyncKit.Server/SyncKit.Server.csproj
```

- Run with `dotnet watch` (if SDK tooling present) to get live reload during development:

```bash
cd server/csharp/src/SyncKit.Server
dotnet watch run
```

- Code style and conventions: follow existing repository patterns and naming. Keep public protocols compatible with the TypeScript reference implementation in `server/typescript`.

## Testing

Integration tests require PostgreSQL and Redis. If available, start them locally or via Docker.

- Run the .NET test project:

```bash
dotnet test server/csharp/src/SyncKit.Server.Tests/SyncKit.Server.Tests.csproj
```

- The broader integration test suite for the whole repository is run from the top-level `tests` folder (see repository README):

```bash
# from repo root
cd tests
# (example runner used by the project; may require bun/node)
bun test
```

## Docker

The server can be containerized; a sample Dockerfile and compose service can be added as needed. For local development with PostgreSQL and Redis dependencies, run them via Docker separately or use the .NET Aspire orchestration (see `orchestration/aspire/`).

## API Reference

### REST Endpoints

#### Server Info

**GET /** - Server info and capabilities
```bash
curl http://localhost:8080/
```

Returns:
```json
{
  "name": "synckit-server",
  "version": "0.3.0",
  "description": "SyncKit Collaboration Server (C#)",
  "endpoints": { "ws": "/ws", "health": "/health", "auth": "/auth/*" },
  "features": ["binary-protocol", "json-protocol", "jwt-auth", "delta-sync", "awareness"]
}
```

#### Authentication (Phase 3)

The server provides REST authentication endpoints at `/auth/*`:

**POST /auth/login** - User login (demo implementation)
```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "permissions": {
      "canRead": ["doc-1"],
      "canWrite": ["doc-1"],
      "isAdmin": false
    }
  }'
```

Returns:
```json
{
  "userId": "user-1234567890",
  "email": "user@example.com",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "permissions": {
    "canRead": ["doc-1"],
    "canWrite": ["doc-1"],
    "isAdmin": false
  }
}
```

**POST /auth/refresh** - Refresh access token
```bash
curl -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refresh_token>"}'
```

**GET /auth/me** - Get current user info
```bash
curl -X GET http://localhost:8080/auth/me \
  -H "Authorization: Bearer <access_token>"
```

**POST /auth/verify** - Verify token validity
```bash
curl -X POST http://localhost:8080/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "<token>"}'
```

### WebSocket Protocol

Protocol and message shapes are documented in the repository protocol specs (`protocol/specs/` and the TypeScript server reference). Maintain strict compatibility with the TypeScript implementation.

## Contributing

- Follow the repository `CONTRIBUTING.md` and commit conventions.
- For protocol or behavioural changes, coordinate with the TypeScript reference implementers to maintain protocol compatibility.

## Troubleshooting

- If the server fails to start due to missing `JWT_SECRET`, set `JWT_SECRET` to a secure value for development.
- Check `ASPNETCORE_URLS` and firewall settings if the server isn't reachable.

## Further Reading

- [Protocol Specification](../../../protocol/specs/) - Wire protocol definitions
- [Server Performance Comparison](../../../docs/architecture/SERVER_PERFORMANCE.md) - Benchmarks across server implementations
- [TypeScript Reference Server](../../typescript/README.md) - The canonical reference implementation
