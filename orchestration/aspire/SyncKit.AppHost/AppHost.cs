// SyncKit Aspire AppHost - Orchestrates the full SyncKit development environment
// Supports: In-memory or real PostgreSQL/Redis, TypeScript or C# backend, frontend examples
//
// TypeScript Server Environment Variables (from server/typescript/src/config.ts):
//   DATABASE_URL     - PostgreSQL connection string (postgresql://user:pass@host:port/db)
//   REDIS_URL        - Redis connection string (redis://host:port)
//   PORT             - HTTP server port
//   NODE_ENV         - Environment mode
//   JWT_SECRET       - JWT signing secret (min 32 chars)
//
// C# Server Environment Variables:
//   ConnectionStrings__synckit - PostgreSQL connection string (Aspire standard)
//   ConnectionStrings__redis   - Redis connection string (Aspire standard)
//   STORAGE_MODE               - "inmemory" or "postgres"

using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

// ============================================================================
// Configuration
// ============================================================================
// Backend selection: "typescript" | "csharp" | "both"
var backendMode = builder.Configuration["SyncKit:Backend"] ?? "typescript";

// Storage mode: "inmemory" | "postgres" (also enables Redis for pub/sub)
var storageMode = builder.Configuration["SyncKit:Storage"] ?? "inmemory";

// Frontend example to run: "react" | "vue" | "svelte" | "none"
var frontendMode = builder.Configuration["SyncKit:Frontend"] ?? "react";

// Shared JWT secret for both backends (ensures token compatibility)
var jwtSecret = builder.Configuration["SyncKit:JwtSecret"] 
    ?? "development-secret-change-in-production-min-32-chars";

// ============================================================================
// Infrastructure Resources (PostgreSQL + Redis)
// ============================================================================
IResourceBuilder<PostgresServerResource>? postgres = null;
IResourceBuilder<PostgresDatabaseResource>? syncKitDb = null;
IResourceBuilder<RedisResource>? redis = null;
IResourceBuilder<ExecutableResource>? migrations = null;

if (storageMode == "postgres")
{
    // PostgreSQL for document storage, vector clocks, deltas, sessions
    postgres = builder.AddPostgres("postgres")
        .WithDataVolume("synckit-postgres-data")
        .WithLifetime(ContainerLifetime.Persistent);
    
    syncKitDb = postgres.AddDatabase("synckit");
    
    // Run migrations BEFORE starting any server
    migrations = builder.AddExecutable("synckit-migrations", "bun", Path.GetFullPath(
            Path.Combine(builder.AppHostDirectory, "..", "..", "..", "server", "typescript")),
            "run", "src/storage/migrate.ts")
        .WithEnvironment("DATABASE_URL", syncKitDb.Resource.ConnectionStringExpression)
        .WaitFor(syncKitDb);

    // Redis for pub/sub coordination in multi-server deployments
    redis = builder.AddRedis("redis")
        .WithDataVolume("synckit-redis-data")
        .WithLifetime(ContainerLifetime.Persistent);
}

// ============================================================================
// Backend Services
// ============================================================================

// TypeScript Backend (Bun + Hono)
// Environment variables expected by server/typescript/src/config.ts:
//   PORT, NODE_ENV, DATABASE_URL, REDIS_URL, JWT_SECRET, etc.
if (backendMode is "typescript" or "both")
{
    var tsServerPath = Path.GetFullPath(
        Path.Combine(builder.AppHostDirectory, "..", "..", "..", "server", "typescript"));
    
    var tsBackend = builder.AddExecutable("synckit-ts-server", "bun", tsServerPath, "run", "dev")
        .WithHttpEndpoint(port: 3000, name: "http", env: "PORT")
        .WithEnvironment("NODE_ENV", "development")
        .WithEnvironment("JWT_SECRET", jwtSecret);
    
    if (storageMode == "postgres" && syncKitDb is not null && redis is not null)
    {
        // TypeScript server expects DATABASE_URL and REDIS_URL environment variables
        // Format: postgresql://user:password@host:port/database
        // Format: redis://host:port
        tsBackend
            .WithEnvironment("DATABASE_URL", syncKitDb.Resource.ConnectionStringExpression)
            .WithEnvironment("REDIS_URL", redis.Resource.ConnectionStringExpression)
            .WaitFor(syncKitDb)
            .WaitFor(redis)
            .WaitFor(migrations);
    }
}

// C# Backend (ASP.NET Core)
// Uses Aspire standard connection string injection via WithReference()
// Connection strings available as: ConnectionStrings__synckit, ConnectionStrings__redis
if (backendMode is "csharp" or "both")
{
    var csharpBackend = builder.AddProject<Projects.SyncKit_Server>("synckit-csharp-server")
        .WithHttpEndpoint(port: 5000, name: "http")
        .WithEnvironment("STORAGE_MODE", storageMode)
        .WithEnvironment("JWT_SECRET", jwtSecret);
    
    if (storageMode == "postgres" && syncKitDb is not null && redis is not null)
    {
        // C# server uses Aspire's standard WithReference() which injects:
        //   ConnectionStrings__synckit = Host=...;Port=...;Database=...;Username=...;Password=...
        //   ConnectionStrings__redis = ...
        csharpBackend
            .WithReference(syncKitDb)
            .WithReference(redis)
            .WaitFor(syncKitDb)
            .WaitFor(redis)
            .WaitFor(migrations);
    }
}

// ============================================================================
// Frontend Examples
// ============================================================================
if (frontendMode != "none")
{
    var examplesPath = Path.GetFullPath(
        Path.Combine(builder.AppHostDirectory, "..", "..", "..", "examples"));
    
    // Determine which backend URL to use for the frontend
    var backendUrl = backendMode == "csharp" 
        ? "http://localhost:5000" 
        : "http://localhost:3000";
    
    switch (frontendMode)
    {
        case "react":
            var reactPath = Path.Combine(examplesPath, "react-example");
            // AddNodeApp with package.json auto-detects npm, then use WithRunScript for "dev"
            builder.AddNodeApp("synckit-react-frontend", reactPath, "node_modules/.bin/vite")
                .WithRunScript("dev")
                .WithHttpEndpoint(port: 5173, name: "http", env: "PORT")
                .WithEnvironment("VITE_SYNCKIT_SERVER_URL", backendUrl)
                .WithExternalHttpEndpoints();
            break;
            
        case "vue":
            var vuePath = Path.Combine(examplesPath, "vue-collaborative-editor");
            builder.AddNodeApp("synckit-vue-frontend", vuePath, "node_modules/.bin/vite")
                .WithRunScript("dev")
                .WithHttpEndpoint(port: 5174, name: "http", env: "PORT")
                .WithEnvironment("VITE_SYNCKIT_SERVER_URL", backendUrl)
                .WithExternalHttpEndpoints();
            break;
            
        case "svelte":
            var sveltePath = Path.Combine(examplesPath, "svelte-collaborative-editor");
            builder.AddNodeApp("synckit-svelte-frontend", sveltePath, "node_modules/.bin/vite")
                .WithRunScript("dev")
                .WithHttpEndpoint(port: 5175, name: "http", env: "PORT")
                .WithEnvironment("VITE_SYNCKIT_SERVER_URL", backendUrl)
                .WithExternalHttpEndpoints();
            break;
    }
}

builder.Build().Run();
