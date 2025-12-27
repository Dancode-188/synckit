# SyncKit Aspire Orchestration

This directory contains the .NET Aspire orchestration for the SyncKit development environment. It provides a unified way to run the full SyncKit stack with configurable backends, storage, and frontend examples.

## Overview

The Aspire AppHost orchestrates:

- **Backend Services**: TypeScript (Bun + Hono) and/or C# (ASP.NET Core) servers
- **Infrastructure**: PostgreSQL for persistence, Redis for pub/sub coordination
- **Frontend Examples**: React, Vue, or Svelte collaborative editor examples

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL/Redis containers)
- [Bun](https://bun.sh/) (for TypeScript backend)
- [Node.js](https://nodejs.org/) (for frontend examples)

## Quick Start

```bash
# Navigate to the orchestration directory
cd orchestration/aspire

# Run with default settings (TypeScript backend, in-memory storage, React frontend)
dotnet run --project SyncKit.AppHost

# Or use a specific launch profile
dotnet run --project SyncKit.AppHost --launch-profile "C# Backend + PostgreSQL"
```

The Aspire Dashboard will open automatically, showing all running services.

## Configuration

### Configuration Options

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| `SyncKit:Backend` | `typescript`, `csharp`, `both` | `typescript` | Which backend server(s) to run |
| `SyncKit:Storage` | `inmemory`, `postgres` | `inmemory` | Storage mode (postgres also enables Redis) |
| `SyncKit:Frontend` | `react`, `vue`, `svelte`, `none` | `react` | Which frontend example to run |
| `SyncKit:JwtSecret` | string (min 32 chars) | dev default | Shared JWT secret for both backends |

### Environment Variable Mapping

When `Storage=postgres`, Aspire injects connection strings differently for each backend:

**TypeScript Backend** (matches `server/typescript/src/config.ts`):
| Aspire Injects | TypeScript Expects | Format |
|----------------|-------------------|--------|
| `DATABASE_URL` | `DATABASE_URL` | `postgresql://user:pass@host:port/database` |
| `REDIS_URL` | `REDIS_URL` | `redis://host:port` |
| `PORT` | `PORT` | `3000` |
| `JWT_SECRET` | `JWT_SECRET` | Shared secret |

**C# Backend** (Aspire standard):
| Aspire Injects | C# Reads Via | Format |
|----------------|--------------|--------|
| `ConnectionStrings__synckit` | `IConfiguration` | `Host=...;Port=...;Database=...;Username=...;Password=...` |
| `ConnectionStrings__redis` | `IConfiguration` | `host:port` |
| `JWT_SECRET` | `IConfiguration` | Shared secret |

Both backends share the **same PostgreSQL and Redis instances**, enabling:
- Protocol compatibility testing between implementations
- Seamless failover during migration
- Cross-server pub/sub coordination

Migration note: Aspire now runs the migration runner (`server/typescript/src/storage/migrate.ts`) as a pre-start step and both backends wait for it when `SyncKit:Storage=postgres`. This ensures the canonical schema is applied before services start.

### Setting Configuration

**Via Environment Variables:**
```bash
export SyncKit__Backend=csharp
export SyncKit__Storage=postgres
export SyncKit__Frontend=react
dotnet run --project SyncKit.AppHost
```

**Via appsettings.json:**
Edit `SyncKit.AppHost/appsettings.Development.json`:
```json
{
  "SyncKit": {
    "Backend": "csharp",
    "Storage": "postgres",
    "Frontend": "react"
  }
}
```

**Via Launch Profiles (VS Code / Visual Studio):**
Select from pre-configured profiles in `Properties/launchSettings.json`.

## Launch Profiles

| Profile | Backend | Storage | Frontend |
|---------|---------|---------|----------|
| Default (TypeScript + InMemory) | TypeScript | In-Memory | React |
| C# Backend (InMemory) | C# | In-Memory | React |
| TypeScript + PostgreSQL | TypeScript | PostgreSQL + Redis | React |
| C# Backend + PostgreSQL | C# | PostgreSQL + Redis | React |
| Full Stack (Both Backends + PostgreSQL) | Both | PostgreSQL + Redis | React |
| Backend Only (No Frontend) | TypeScript | In-Memory | None |

## Service Endpoints

When running, services are available at:

| Service | Port | Description |
|---------|------|-------------|
| Aspire Dashboard | 15131 (http) / 17235 (https) | Orchestration dashboard |
| TypeScript Backend | 3000 | Bun + Hono WebSocket server |
| C# Backend | 5000 | ASP.NET Core WebSocket server |
| React Frontend | 5173 | Vite dev server |
| Vue Frontend | 5174 | Vite dev server |
| Svelte Frontend | 5175 | Vite dev server |
| PostgreSQL | 5432 | Database (when enabled) |
| Redis | 6379 | Pub/sub (when enabled) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Aspire Dashboard                             │
│                   (Monitoring & Logs)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Frontend    │    │  TypeScript   │    │    C#         │
│   (React/     │───▶│   Backend     │    │   Backend     │
│   Vue/Svelte) │    │  (Bun+Hono)   │    │ (ASP.NET)     │
└───────────────┘    └───────┬───────┘    └───────┬───────┘
                             │                     │
                             └──────────┬──────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
            │  PostgreSQL   │   │    Redis      │   │   In-Memory   │
            │  (Documents,  │   │   (Pub/Sub)   │   │   (Default)   │
            │   Deltas)     │   │               │   │               │
            └───────────────┘   └───────────────┘   └───────────────┘
```

## Development Scenarios

### Scenario 1: Quick Development (Default)
```bash
dotnet run --project SyncKit.AppHost
```
- TypeScript backend with in-memory storage
- React frontend for testing
- Fastest startup, no Docker required

### Scenario 2: Testing C# Backend
```bash
dotnet run --project SyncKit.AppHost --launch-profile "C# Backend (InMemory)"
```
- C# backend with in-memory storage
- Useful for .NET server development

### Scenario 3: Full Integration Testing
```bash
dotnet run --project SyncKit.AppHost --launch-profile "Full Stack (Both Backends + PostgreSQL)"
```
- Both backends running simultaneously
- PostgreSQL + Redis for realistic testing
- Compare behavior between implementations

### Scenario 4: Storage Layer Development (T6-01)
```bash
dotnet run --project SyncKit.AppHost --launch-profile "C# Backend + PostgreSQL"
```
- C# backend with PostgreSQL storage
- Perfect for implementing `IStorageAdapter`
- Redis available for pub/sub testing

## Troubleshooting

### Docker Not Running
If you see container-related errors, ensure Docker Desktop is running:
```bash
docker info
```

### Port Conflicts
If ports are in use, you can modify them in `AppHost.cs` or stop conflicting services.

### Bun Not Found
Ensure Bun is installed and in your PATH:
```bash
bun --version
```

### Frontend Dependencies
If frontend fails to start, install dependencies first:
```bash
cd examples/react-example && npm install
```

## Related Documentation

- [.NET Aspire Documentation](https://learn.microsoft.com/en-us/dotnet/aspire/)
- [SyncKit .NET Server Implementation Plan](../../docs/.dotnet-feature/IMPLEMENTATION_PLAN.md)
- [Phase 6: Storage Layer](../../docs/.dotnet-feature/work-items/PHASE-6-STORAGE.md)
- [T6-01: Storage Abstractions](../../docs/.dotnet-feature/work-items/phase-6/T6-01.md)
