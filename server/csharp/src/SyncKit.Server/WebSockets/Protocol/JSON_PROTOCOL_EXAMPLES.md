# JSON Protocol Handler - Example Usage

## Overview

The JSON Protocol Handler provides text-based JSON message parsing and serialization for test suite compatibility and debugging.

## Format Specification

### Properties
- **Naming**: camelCase (e.g., `documentId`, `vectorClock`)
- **Optional fields**: Omitted when null

### Message Types (Enums)
- **Naming**: snake_case (e.g., `auth`, `sync_request`, `awareness_update`)

## Example Messages

### Authentication
```json
{
  "type": "auth",
  "id": "msg-123",
  "timestamp": 1702900000000,
  "token": "jwt.token.here"
}
```

### Delta Update
```json
{
  "type": "delta",
  "id": "msg-456",
  "timestamp": 1702900001000,
  "documentId": "doc-1",
  "delta": { "field": "value" },
  "vectorClock": { "client-1": 5 }
}
```

### Sync Request
```json
{
  "type": "sync_request",
  "id": "sync-1",
  "timestamp": 1702900002000,
  "documentId": "doc-2",
  "vectorClock": { "client-1": 3, "client-2": 7 }
}
```

### Awareness Update
```json
{
  "type": "awareness_update",
  "id": "awareness-1",
  "timestamp": 1702900003000,
  "documentId": "doc-3",
  "clientId": "client-1",
  "state": { "cursor": { "x": 10, "y": 20 } },
  "clock": 42
}
```

### Error
```json
{
  "type": "error",
  "id": "error-1",
  "timestamp": 1702900004000,
  "error": "Something went wrong",
  "details": { "code": 500 }
}
```

## Usage in Code

```csharp
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

// Initialize handler
var handler = new JsonProtocolHandler(logger);

// Parse incoming JSON message
var jsonBytes = Encoding.UTF8.GetBytes(jsonString);
var message = handler.Parse(jsonBytes);

if (message is AuthMessage authMsg)
{
    Console.WriteLine($"Auth token: {authMsg.Token}");
}

// Serialize outgoing message
var response = new AuthSuccessMessage
{
    Id = Guid.NewGuid().ToString(),
    Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
    UserId = "user-123",
    Permissions = new Dictionary<string, object> { { "read", true } }
};

var serialized = handler.Serialize(response);
var json = Encoding.UTF8.GetString(serialized.Span);
// json = {"type":"auth_success","id":"...","timestamp":...,"userId":"user-123","permissions":{"read":true}}
```

## TypeScript Compatibility

The handler is fully compatible with the TypeScript server implementation:

- ✅ Message type codes match exactly
- ✅ Property naming follows camelCase convention
- ✅ Enum values use snake_case
- ✅ All 17 message types supported
- ✅ Null optional properties omitted from output
- ✅ Case-insensitive parsing for robustness

## Testing

Comprehensive test suite with 46+ tests:
- Unit tests for all message types
- Integration tests for TypeScript compatibility
- Round-trip serialization/deserialization tests
- Error handling and malformed input tests

Run tests:
```bash
cd server/csharp/src/SyncKit.Server.Tests
dotnet test --filter "FullyQualifiedName~JsonProtocol"
```
