using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Storage;

public static class StorageRegistration
{
    public static IServiceCollection AddSyncKitStorage(this IServiceCollection services, SyncKitConfig config)
    {
        var storageMode = Environment.GetEnvironmentVariable("SyncKit__Storage") ?? "inmemory";
        if (storageMode == "postgres")
        {
            if (string.IsNullOrEmpty(config.DatabaseUrl)) throw new InvalidOperationException("DATABASE_URL is required for postgres storage");

            // Use connection string; Npgsql provides connection pooling automatically
            var connectionString = config.DatabaseUrl;

            services.AddSingleton<IStorageAdapter>(sp => new PostgresStorageAdapter(connectionString, sp.GetRequiredService<ILogger<PostgresStorageAdapter>>()));
            services.AddSingleton<SchemaValidator>(sp => new SchemaValidator(async ct =>
            {
                var conn = new NpgsqlConnection(connectionString);
                await conn.OpenAsync(ct);
                return conn;
            }, sp.GetRequiredService<ILogger<SchemaValidator>>()));
        }
        else
        {
            services.AddSingleton<IStorageAdapter>(sp => new InMemoryStorageAdapter(sp.GetRequiredService<ILogger<InMemoryStorageAdapter>>()));
        }

        return services;
    }
}
