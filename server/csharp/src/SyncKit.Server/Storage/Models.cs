using System.Text.Json;

namespace SyncKit.Server.Storage;

/// <summary>Matches TS DocumentState</summary>
public record DocumentState(
    string Id,
    JsonElement State,
    long Version,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

/// <summary>Matches TS DeltaEntry</summary>
public record DeltaEntry
{
    public string? Id { get; init; }
    public required string DocumentId { get; init; }
    public required string ClientId { get; init; }
    public required string OperationType { get; init; }  // "set" | "delete" | "merge"
    public required string FieldPath { get; init; }
    public JsonElement? Value { get; init; }
    public required long ClockValue { get; init; }
    public DateTime? Timestamp { get; init; }

    // .NET enhancement: for SQL-level filtering
    public long MaxClockValue { get; init; }

    // For backwards compatibility with protocol expectations we include the vector clock
    // that was present with the message when it was saved.
    public Dictionary<string, long>? VectorClock { get; init; }
}

/// <summary>Matches TS SessionEntry</summary>
public record SessionEntry
{
    public required string Id { get; init; }
    public required string UserId { get; init; }
    public string? ClientId { get; init; }
    public DateTime ConnectedAt { get; init; }
    public DateTime LastSeen { get; init; }
    public Dictionary<string, object>? Metadata { get; init; }
}

/// <summary>Matches TS cleanup() options</summary>
public record CleanupOptions(
    int OldSessionsHours = 24,
    int OldDeltasDays = 30
);

/// <summary>Matches TS cleanup() return type</summary>
public record CleanupResult(
    int SessionsDeleted,
    int DeltasDeleted
);
