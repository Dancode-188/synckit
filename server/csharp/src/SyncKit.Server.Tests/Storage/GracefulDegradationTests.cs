using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using SyncKit.Server.Configuration;
using SyncKit.Server.Storage;
using Xunit;

namespace SyncKit.Server.Tests.Storage;

public class GracefulDegradationTests
{
    [Fact]
    public async Task FallbackStorageAdapter_falls_back_to_inmemory_when_primary_fails()
    {
        // Arrange: create a PostgresStorageAdapter with an invalid connection string
        var loggerFactory = new NullLoggerFactory();
        var primary = new PostgresStorageAdapter(
            "Host=invalid-host-that-does-not-exist;Port=5432;Database=synckit;Username=test;Password=test;Timeout=1",
            loggerFactory.CreateLogger<PostgresStorageAdapter>());
        var adapter = new FallbackStorageAdapter(primary, loggerFactory);

        Assert.False(adapter.IsUsingFallback);

        // Act: ConnectAsync should catch the failure and fall back
        await adapter.ConnectAsync();

        // Assert: now using fallback in-memory storage
        Assert.True(adapter.IsUsingFallback);
        Assert.True(adapter.IsConnected);
    }

    [Fact]
    public async Task FallbackStorageAdapter_works_normally_with_inmemory_primary()
    {
        // Arrange: use InMemoryStorageAdapter as primary (always succeeds)
        var loggerFactory = new NullLoggerFactory();
        var primary = new InMemoryStorageAdapter(loggerFactory.CreateLogger<InMemoryStorageAdapter>());
        var adapter = new FallbackStorageAdapter(primary, loggerFactory);

        // Act
        await adapter.ConnectAsync();

        // Assert: should NOT fall back
        Assert.False(adapter.IsUsingFallback);
        Assert.True(adapter.IsConnected);
    }

    [Fact]
    public async Task FallbackStorageAdapter_delegates_operations_after_fallback()
    {
        // Arrange: force fallback
        var loggerFactory = new NullLoggerFactory();
        var primary = new PostgresStorageAdapter(
            "Host=invalid-host;Port=5432;Database=synckit;Username=test;Password=test;Timeout=1",
            loggerFactory.CreateLogger<PostgresStorageAdapter>());
        var adapter = new FallbackStorageAdapter(primary, loggerFactory);

        await adapter.ConnectAsync();
        Assert.True(adapter.IsUsingFallback);

        // Act: use storage operations — they should work via in-memory
        var state = JsonDocument.Parse("{\"field\": \"value\"}").RootElement;
        var saved = await adapter.SaveDocumentAsync("doc1", state);
        Assert.Equal("doc1", saved.Id);

        var retrieved = await adapter.GetDocumentAsync("doc1");
        Assert.NotNull(retrieved);

        var delta = new DeltaEntry
        {
            DocumentId = "doc1",
            ClientId = "client1",
            ClockValue = 1,
            OperationType = "set",
            FieldPath = "field",
            Value = JsonDocument.Parse("{\"field\": \"value\"}").RootElement
        };
        var savedDelta = await adapter.SaveDeltaAsync(delta);
        Assert.NotNull(savedDelta.Id);

        var deltas = await adapter.GetDeltasAsync("doc1");
        Assert.Single(deltas);
    }

    [Fact]
    public async Task FallbackStorageAdapter_health_check_works_after_fallback()
    {
        var loggerFactory = new NullLoggerFactory();
        var primary = new PostgresStorageAdapter(
            "Host=invalid-host;Port=5432;Database=synckit;Timeout=1",
            loggerFactory.CreateLogger<PostgresStorageAdapter>());
        var adapter = new FallbackStorageAdapter(primary, loggerFactory);

        await adapter.ConnectAsync();
        Assert.True(adapter.IsUsingFallback);

        var healthy = await adapter.HealthCheckAsync();
        Assert.True(healthy);
    }

    [Fact]
    public void Postgres_registration_wraps_with_FallbackStorageAdapter()
    {
        var dict = new Dictionary<string, string?>
        {
            ["Storage:Provider"] = "postgresql",
            ["Storage:PostgreSql:ConnectionString"] = "Host=localhost;Database=synckit;Username=postgres;Password=postgres"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        var services = new ServiceCollection();

        services.AddSyncKitConfiguration(config);
        services.AddSyncKitStorage(config);

        var sp = services.BuildServiceProvider();
        var storage = sp.GetRequiredService<IStorageAdapter>();

        // Should be wrapped in FallbackStorageAdapter
        Assert.IsType<FallbackStorageAdapter>(storage);
    }

    [Fact]
    public async Task Server_starts_with_invalid_connection_string_using_inmemory_fallback()
    {
        // Simulate the Program.cs flow with an invalid connection string
        var dict = new Dictionary<string, string?>
        {
            ["Storage:Provider"] = "postgresql",
            ["Storage:PostgreSql:ConnectionString"] = "Host=invalid-host-does-not-exist;Port=5432;Database=synckit;Timeout=1"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        var services = new ServiceCollection();

        services.AddSyncKitConfiguration(config);
        services.AddSyncKitStorage(config);

        var sp = services.BuildServiceProvider();
        var storage = sp.GetRequiredService<IStorageAdapter>();

        // Connect — should not throw, should fall back
        await storage.ConnectAsync();

        var fallback = Assert.IsType<FallbackStorageAdapter>(storage);
        Assert.True(fallback.IsUsingFallback);
        Assert.True(storage.IsConnected);

        // Verify storage is functional
        var docState = await storage.GetDocumentStateAsync("test-doc");
        Assert.NotNull(docState);
        Assert.Empty(docState);
    }
}
