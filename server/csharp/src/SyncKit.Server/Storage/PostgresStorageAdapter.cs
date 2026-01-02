using System.Text.Json;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace SyncKit.Server.Storage;

public class PostgresStorageAdapter : IStorageAdapter, IAsyncDisposable
{
    private readonly string _connectionString;
    private readonly ILogger<PostgresStorageAdapter> _logger;
    private readonly SchemaValidator _validator;
    private bool _isConnected;

    public PostgresStorageAdapter(string connectionString, ILogger<PostgresStorageAdapter> logger)
    {
        _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _validator = new SchemaValidator(async ct =>
        {
            var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(ct);
            return conn;
        }, new LoggerFactory().CreateLogger<SchemaValidator>());
    }

    public bool IsConnected => _isConnected;

    public async Task ConnectAsync(CancellationToken ct = default)
    {
        _logger.LogInformation("Connecting to PostgreSQL...");
        try
        {
            // Validate schema by opening a connection and checking required tables
            var ok = await _validator.ValidateSchemaAsync(ct);
            if (!ok)
            {
                _logger.LogError("PostgreSQL schema validation failed. Ensure shared migrations have been applied.");
                throw new InvalidOperationException("Missing required PostgreSQL schema for SyncKit. Run shared migrations first.");
            }

            // Test simple query
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT 1";
            var res = await cmd.ExecuteScalarAsync(ct);
            _isConnected = res != null;
            _logger.LogInformation("PostgreSQL connected (schema validated)");
        }
        catch
        {
            _isConnected = false;
            throw;
        }
    }

    public Task DisconnectAsync(CancellationToken ct = default)
    {
        // Npgsql provides automatic connection pooling via connection string; nothing to dispose here.
        _isConnected = false;
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync()
    {
        // Nothing to dispose - connections are pooled and closed per-use
        return ValueTask.CompletedTask;
    }

    public async Task<bool> HealthCheckAsync(CancellationToken ct = default)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT 1";
            var scalar = await cmd.ExecuteScalarAsync(ct);
            return scalar != null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Health check failed");
            return false;
        }
    }

    // === Document operations ===
    public async Task<DocumentState?> GetDocumentAsync(string id, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"SELECT state, version, created_at, updated_at FROM documents WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        var state = (JsonElement)await reader.GetFieldValueAsync<JsonElement>(0, ct);
        var version = reader.GetFieldValue<long>(1);
        var created = reader.GetFieldValue<DateTime>(2);
        var updated = reader.GetFieldValue<DateTime>(3);

        return new DocumentState(id, state, version, created, updated);
    }

    public async Task<DocumentState> SaveDocumentAsync(string id, JsonElement state, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
INSERT INTO documents (id, state)
VALUES (@id, @state::jsonb)
ON CONFLICT (id) DO UPDATE SET state = @state::jsonb, updated_at = NOW(), version = documents.version + 1
RETURNING version, created_at, updated_at";
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@state", NpgsqlTypes.NpgsqlDbType.Jsonb, state.ToString());

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) throw new InvalidOperationException("Failed to save document");

        var version = reader.GetFieldValue<long>(0);
        var created = reader.GetFieldValue<DateTime>(1);
        var updated = reader.GetFieldValue<DateTime>(2);

        return new DocumentState(id, state, version, created, updated);
    }

    public async Task<DocumentState> UpdateDocumentAsync(string id, JsonElement state, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"UPDATE documents SET state = @state::jsonb, updated_at = NOW(), version = documents.version + 1 WHERE id = @id RETURNING version, created_at, updated_at";
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@state", NpgsqlTypes.NpgsqlDbType.Jsonb, state.ToString());

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) throw new InvalidOperationException("Document does not exist");

        var version = reader.GetFieldValue<long>(0);
        var created = reader.GetFieldValue<DateTime>(1);
        var updated = reader.GetFieldValue<DateTime>(2);

        await tx.CommitAsync(ct);
        return new DocumentState(id, state, version, created, updated);
    }

    public async Task<bool> DeleteDocumentAsync(string id, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM documents WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows > 0;
    }

    public async Task<IReadOnlyList<DocumentState>> ListDocumentsAsync(int limit = 100, int offset = 0, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT id, state, version, created_at, updated_at FROM documents ORDER BY updated_at DESC LIMIT @limit OFFSET @offset";
        cmd.Parameters.AddWithValue("@limit", limit);
        cmd.Parameters.AddWithValue("@offset", offset);

        var list = new List<DocumentState>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var id = reader.GetFieldValue<string>(0);
            var state = (JsonElement)await reader.GetFieldValueAsync<JsonElement>(1, ct);
            var version = reader.GetFieldValue<long>(2);
            var created = reader.GetFieldValue<DateTime>(3);
            var updated = reader.GetFieldValue<DateTime>(4);
            list.Add(new DocumentState(id, state, version, created, updated));
        }

        return list.AsReadOnly();
    }

    public async Task<Dictionary<string, object?>> GetDocumentStateAsync(string documentId, CancellationToken ct = default)
    {
        // Build document state from deltas - apply each delta to reconstruct current state
        var deltas = await GetDeltasAsync(documentId, limit: 10000, ct);
        var state = new Dictionary<string, object?>();

        foreach (var delta in deltas)
        {
            // Each delta has a field_path and value
            // For "set" operations, set the field to the value
            if (delta.OperationType == "set" && delta.Value.HasValue)
            {
                state[delta.FieldPath] = ConvertJsonElement(delta.Value.Value);
            }
            else if (delta.OperationType == "delete")
            {
                state.Remove(delta.FieldPath);
            }
        }

        return state;
    }

    private static object? ConvertJsonElement(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number when element.TryGetInt64(out var l) => l,
            JsonValueKind.Number => element.GetDouble(),
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Array => element.EnumerateArray()
                .Select(ConvertJsonElement)
                .ToList(),
            JsonValueKind.Object => element.EnumerateObject()
                .ToDictionary(p => p.Name, p => ConvertJsonElement(p.Value)),
            _ => element.ToString()
        };
    }

    // === Vector clocks ===
    public async Task<Dictionary<string, long>> GetVectorClockAsync(string documentId, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT client_id, clock_value FROM vector_clocks WHERE document_id = @docId";
        cmd.Parameters.AddWithValue("@docId", documentId);

        var dict = new Dictionary<string, long>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            dict[reader.GetFieldValue<string>(0)] = reader.GetFieldValue<long>(1);
        }

        return dict;
    }

    public async Task UpdateVectorClockAsync(string documentId, string clientId, long clockValue, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"INSERT INTO vector_clocks (document_id, client_id, clock_value) VALUES (@docId, @clientId, @clockValue) ON CONFLICT (document_id, client_id) DO UPDATE SET clock_value = GREATEST(vector_clocks.clock_value, @clockValue), updated_at = NOW();";
        cmd.Parameters.AddWithValue("@docId", documentId);
        cmd.Parameters.AddWithValue("@clientId", clientId);
        cmd.Parameters.AddWithValue("@clockValue", clockValue);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task MergeVectorClockAsync(string documentId, Dictionary<string, long> clock, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        foreach (var kv in clock)
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"INSERT INTO vector_clocks (document_id, client_id, clock_value) VALUES (@docId, @clientId, @clockValue) ON CONFLICT (document_id, client_id) DO UPDATE SET clock_value = GREATEST(vector_clocks.clock_value, @clockValue), updated_at = NOW();";
            cmd.Parameters.AddWithValue("@docId", documentId);
            cmd.Parameters.AddWithValue("@clientId", kv.Key);
            cmd.Parameters.AddWithValue("@clockValue", kv.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        await tx.CommitAsync(ct);
    }

    // === Deltas ===
    public async Task<DeltaEntry> SaveDeltaAsync(DeltaEntry delta, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"INSERT INTO deltas (document_id, client_id, operation_type, field_path, value, clock_value) VALUES (@docId, @clientId, @op, @path, @value::jsonb, @clock) RETURNING id, timestamp";
        cmd.Parameters.AddWithValue("@docId", delta.DocumentId);
        cmd.Parameters.AddWithValue("@clientId", delta.ClientId);
        cmd.Parameters.AddWithValue("@op", delta.OperationType);
        cmd.Parameters.AddWithValue("@path", delta.FieldPath);
        cmd.Parameters.AddWithValue("@value", NpgsqlTypes.NpgsqlDbType.Jsonb, delta.Value?.ToString() ?? "{}" );
        cmd.Parameters.AddWithValue("@clock", delta.ClockValue);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) throw new InvalidOperationException("Failed to insert delta");

        var id = reader.GetFieldValue<Guid>(0).ToString();
        var ts = reader.GetFieldValue<DateTime>(1);
        var maxClockValue = delta.MaxClockValue != 0 ? delta.MaxClockValue : delta.ClockValue;

        return delta with { Id = id, Timestamp = ts, MaxClockValue = maxClockValue };
    }

    public async Task<IReadOnlyList<DeltaEntry>> GetDeltasAsync(string documentId, int limit = 100, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT id, client_id, operation_type, field_path, value, clock_value, timestamp FROM deltas WHERE document_id = @docId ORDER BY timestamp ASC LIMIT @limit";
        cmd.Parameters.AddWithValue("@docId", documentId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<DeltaEntry>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            list.Add(new DeltaEntry
            {
                Id = reader.GetFieldValue<Guid>(0).ToString(),
                DocumentId = documentId,
                ClientId = reader.GetFieldValue<string>(1),
                OperationType = reader.GetFieldValue<string>(2),
                FieldPath = reader.GetFieldValue<string>(3),
                Value = (JsonElement)await reader.GetFieldValueAsync<JsonElement>(4, ct),
                ClockValue = reader.GetFieldValue<long>(5),
                Timestamp = reader.GetFieldValue<DateTime>(6),
                MaxClockValue = reader.GetFieldValue<long>(5)
            });
        }

        return list.AsReadOnly();
    }

    public async Task<IReadOnlyList<DeltaEntry>> GetDeltasSinceAsync(string documentId, long? sinceMaxClock, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        if (sinceMaxClock == null)
        {
            cmd.CommandText = "SELECT id, client_id, operation_type, field_path, value, clock_value, timestamp FROM deltas WHERE document_id = @docId ORDER BY timestamp ASC";
            cmd.Parameters.AddWithValue("@docId", documentId);
        }
        else
        {
            cmd.CommandText = "SELECT id, client_id, operation_type, field_path, value, clock_value, timestamp FROM deltas WHERE document_id = @docId AND clock_value > @since ORDER BY timestamp ASC";
            cmd.Parameters.AddWithValue("@docId", documentId);
            cmd.Parameters.AddWithValue("@since", sinceMaxClock.Value);
        }

        var list = new List<DeltaEntry>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            list.Add(new DeltaEntry
            {
                Id = reader.GetFieldValue<Guid>(0).ToString(),
                DocumentId = documentId,
                ClientId = reader.GetFieldValue<string>(1),
                OperationType = reader.GetFieldValue<string>(2),
                FieldPath = reader.GetFieldValue<string>(3),
                Value = (JsonElement)await reader.GetFieldValueAsync<JsonElement>(4, ct),
                ClockValue = reader.GetFieldValue<long>(5),
                Timestamp = reader.GetFieldValue<DateTime>(6),
                MaxClockValue = reader.GetFieldValue<long>(5)
            });
        }

        return list.AsReadOnly();
    }

    // === Sessions ===
    public async Task<SessionEntry> SaveSessionAsync(SessionEntry session, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"INSERT INTO sessions (id, user_id, client_id, connected_at, last_seen, metadata) VALUES (@id, @user, @client, @connected, @last, @meta::jsonb) ON CONFLICT (id) DO UPDATE SET last_seen = @last, metadata = @meta::jsonb RETURNING connected_at, last_seen";
        cmd.Parameters.AddWithValue("@id", session.Id);
        cmd.Parameters.AddWithValue("@user", session.UserId);
        cmd.Parameters.AddWithValue("@client", (object?)session.ClientId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@connected", session.ConnectedAt == default ? DateTime.UtcNow : session.ConnectedAt);
        cmd.Parameters.AddWithValue("@last", session.LastSeen == default ? DateTime.UtcNow : session.LastSeen);
        cmd.Parameters.AddWithValue("@meta", NpgsqlTypes.NpgsqlDbType.Jsonb, session.Metadata != null ? JsonSerializer.Serialize(session.Metadata) : "{}" );

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) throw new InvalidOperationException("Failed to save session");

        var connected = reader.GetFieldValue<DateTime>(0);
        var last = reader.GetFieldValue<DateTime>(1);
        return session with { ConnectedAt = connected, LastSeen = last };
    }

    public async Task UpdateSessionAsync(string sessionId, DateTime lastSeen, Dictionary<string, object>? metadata = null, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE sessions SET last_seen = @last, metadata = @meta::jsonb WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", sessionId);
        cmd.Parameters.AddWithValue("@last", lastSeen);
        cmd.Parameters.AddWithValue("@meta", NpgsqlTypes.NpgsqlDbType.Jsonb, metadata != null ? JsonSerializer.Serialize(metadata) : "{}" );
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<bool> DeleteSessionAsync(string sessionId, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM sessions WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", sessionId);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows > 0;
    }

    public async Task<IReadOnlyList<SessionEntry>> GetSessionsAsync(string userId, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT id, user_id, client_id, connected_at, last_seen, metadata FROM sessions WHERE user_id = @user";
        cmd.Parameters.AddWithValue("@user", userId);

        var list = new List<SessionEntry>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var id = reader.GetFieldValue<string>(0);
            var user = reader.GetFieldValue<string>(1);
            var client = reader.IsDBNull(2) ? null : reader.GetFieldValue<string>(2);
            var connected = reader.GetFieldValue<DateTime>(3);
            var last = reader.GetFieldValue<DateTime>(4);
            var metaJson = (string)reader.GetFieldValue<string>(5);
            var meta = string.IsNullOrWhiteSpace(metaJson) ? null : JsonSerializer.Deserialize<Dictionary<string, object>>(metaJson);
            list.Add(new SessionEntry { Id = id, UserId = user, ClientId = client, ConnectedAt = connected, LastSeen = last, Metadata = meta });
        }

        return list.AsReadOnly();
    }

    public async Task<CleanupResult> CleanupAsync(CleanupOptions? options = null, CancellationToken ct = default)
    {
        var opts = options ?? new CleanupOptions();
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT cleanup_old_sessions(), cleanup_old_deltas()";
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return new CleanupResult(0, 0);
        var sessionsDeleted = reader.GetFieldValue<int>(0);
        var deltasDeleted = reader.GetFieldValue<int>(1);
        return new CleanupResult(sessionsDeleted, deltasDeleted);
    }
}
