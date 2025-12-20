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

The server exposes a minimal health endpoint at `/health` by default and listens on the configured ASP.NET Core URL (see Configuration).

## Configuration

Configuration is driven by environment variables and the standard ASP.NET Core configuration system. Common variables:

- `JWT_SECRET`: Required for local development. A 32+ character secret used to sign development JWTs.
- `JWT_ISSUER`: Optional issuer to enforce during JWT validation.
- `JWT_AUDIENCE`: Optional audience to enforce during JWT validation.
- `ASPNETCORE_ENVIRONMENT`: `Development` (default) or `Production`.
- `ConnectionStrings__Postgres`: PostgreSQL connection string for persistent storage.
- `REDIS__ENDPOINT` or `REDIS_URL`: Redis connection string for pub/sub coordination.
- `PORT` or `ASPNETCORE_URLS`: Server listening port(s). Example: `http://localhost:5000`.

Example `env` for development:

```bash
export JWT_SECRET="test-secret-key-for-development-32-chars"
export JWT_ISSUER="synckit-server"
export JWT_AUDIENCE="synckit-api"
export ASPNETCORE_ENVIRONMENT=Development
export ConnectionStrings__Postgres="Host=localhost;Port=5432;Database=synckit;Username=postgres;Password=postgres"
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

Integration tests require PostgreSQL and Redis. Start the test dependencies with Docker Compose in the `server/csharp` folder:

```bash
cd server/csharp
docker compose -f docker-compose.test.yml up -d
```

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

There is a Docker Compose file for test dependencies at `server/csharp/docker-compose.test.yml` (Postgres + Redis). The server itself can be containerized; a sample Dockerfile and compose service can be added as needed.

## API Reference

Protocol and message shapes are documented in the repository protocol specs (`protocol/specs/` and the TypeScript server reference). Maintain strict compatibility with the TypeScript implementation.

## Contributing

- Follow the repository `CONTRIBUTING.md` and commit conventions.
- For protocol or behavioural changes, update the docs under `docs/.dotnet-feature/` and coordinate with the TypeScript reference implementers.

## Troubleshooting

- If the server fails to start due to missing `JWT_SECRET`, set `JWT_SECRET` to a secure value for development.
- Check `ASPNETCORE_URLS` and firewall settings if the server isn't reachable.

## Further reading

- Refer to `docs/.dotnet-feature/IMPLEMENTATION_PLAN.md` for implementation details and phase work items.
