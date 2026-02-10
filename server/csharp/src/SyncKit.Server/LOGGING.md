# SyncKit Server Logging Conventions

This document describes the logging conventions and best practices for the SyncKit .NET server.

## Overview

SyncKit uses [Serilog](https://serilog.net/) for structured logging with the following features:

- **Structured logging** - Log events with rich, queryable properties
- **Multiple sinks** - Console output (development) and file output (production)
- **Request logging** - Automatic HTTP request/response logging
- **Contextual enrichment** - Machine name, thread ID, and custom properties

## Log Levels

| Level | When to Use | Examples |
|-------|-------------|----------|
| **Debug** | Detailed diagnostic information for troubleshooting | Variable values, state transitions, method entry/exit |
| **Information** | General operational events | Server started, client connected, sync completed |
| **Warning** | Non-critical issues that may need attention | Retry attempt, deprecated feature usage, high latency |
| **Error** | Failures that need attention but don't stop the app | Failed to save document, auth token expired |
| **Fatal** | Critical failures that cause shutdown | Database connection failed, unrecoverable state |

## Usage Examples

### Getting a Logger

Use dependency injection to get a typed logger:

```csharp
public class MyService
{
    private readonly ILogger<MyService> _logger;

    public MyService(ILogger<MyService> logger)
    {
        _logger = logger;
    }

    public void DoSomething()
    {
        _logger.LogInformation("Doing something");
    }
}
```

### Structured Logging

Always use structured logging with message templates (not string interpolation):

```csharp
// ✅ Good - structured logging
_logger.LogInformation("User {UserId} connected to document {DocumentId}", userId, documentId);

// ❌ Bad - string interpolation loses structure
_logger.LogInformation($"User {userId} connected to document {documentId}");
```

### Log Context (Scopes)

Use scopes to add contextual information to a group of log entries:

```csharp
using (_logger.BeginScope(new Dictionary<string, object>
{
    ["DocumentId"] = documentId,
    ["ClientId"] = clientId
}))
{
    _logger.LogInformation("Processing sync request");
    // All logs within this block will include DocumentId and ClientId
    ProcessSync();
    _logger.LogInformation("Sync complete");
}
```

### Exception Logging

Always pass exceptions as the first parameter:

```csharp
try
{
    await SaveDocument();
}
catch (Exception ex)
{
    // ✅ Good - exception is properly captured
    _logger.LogError(ex, "Failed to save document {DocumentId}", documentId);
    
    // ❌ Bad - exception details may be lost
    _logger.LogError("Failed to save document: {Error}", ex.Message);
}
```

## Configuration

### appsettings.json

Log configuration is in `appsettings.json` under the `Serilog` section:

```json
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "Microsoft.Hosting.Lifetime": "Information"
      }
    },
    "WriteTo": [
      {
        "Name": "Console",
        "Args": {
          "outputTemplate": "[{Timestamp:HH:mm:ss} {Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}"
        }
      }
    ]
  }
}
```

### Environment-Specific Configuration

- **Development** (`appsettings.Development.json`): Debug level, more verbose Microsoft logs
- **Production** (`appsettings.json`): Information level, suppressed Microsoft logs, file sink enabled

### Overriding Log Levels

Override log levels for specific namespaces:

```json
{
  "Serilog": {
    "MinimumLevel": {
      "Override": {
        "Microsoft.EntityFrameworkCore": "Warning",
        "SyncKit.Server.Sync": "Debug"
      }
    }
  }
}
```

## Output Formats

### Console Output

```
[14:23:45 INF] SyncKit.Server.Sync.SyncCoordinator: Client abc123 connected to document doc-456
```

### File Output

```
2024-01-15 14:23:45.123 +00:00 [INF] SyncKit.Server.Sync.SyncCoordinator: Client abc123 connected to document doc-456
```

## Request Logging

HTTP requests are automatically logged with:

- Request method and path
- Response status code
- Elapsed time in milliseconds
- Request host
- User agent

Example output:
```
[14:23:45 INF] HTTP GET /health responded 200 in 1.2345 ms
```

## File Logging

Log files are written to the `logs/` directory with:

- Daily rolling (new file each day)
- 7-day retention
- Pattern: `synckit-YYYYMMDD.log`

## Best Practices

1. **Be concise** - Log meaningful events, not every method call
2. **Use appropriate levels** - Don't log everything as Information
3. **Include context** - Add relevant IDs and state information
4. **Avoid sensitive data** - Never log passwords, tokens, or PII
5. **Use message templates** - Enable structured querying
6. **Log at boundaries** - Focus on API endpoints, service boundaries, and error conditions
