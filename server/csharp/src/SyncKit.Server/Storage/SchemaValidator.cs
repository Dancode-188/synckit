using System.Data;
using Microsoft.Extensions.Logging;

namespace SyncKit.Server.Storage;

public class SchemaValidator
{
    private readonly Func<CancellationToken, Task<IDbConnection>> _connectionFactory;
    private readonly ILogger<SchemaValidator> _logger;
    private readonly string[] _requiredTables = new[] { "documents", "vector_clocks", "deltas", "sessions" };

    public SchemaValidator(Func<CancellationToken, Task<IDbConnection>> connectionFactory, ILogger<SchemaValidator> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<bool> ValidateSchemaAsync(CancellationToken ct = default)
    {
        try
        {
            using var conn = await _connectionFactory(ct);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $@"
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name IN ({string.Join(',', _requiredTables.Select(t => "'" + t + "'"))})";

            // Execute synchronously inside Task to keep compatibility with IDbCommand
            var scalar = await Task.Run(() => cmd.ExecuteScalar());
            if (scalar == null)
            {
                _logger.LogWarning("Schema validation returned null scalar");
                return false;
            }

            var count = Convert.ToInt32(scalar);
            _logger.LogInformation("Schema validation found {Count} tables (expected {Expected})", count, _requiredTables.Length);
            return count >= _requiredTables.Length;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error while validating schema");
            return false;
        }
    }
}
