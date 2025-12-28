using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SyncKit.Server.Configuration;
using SyncKit.Server.Storage;
using Xunit;

namespace SyncKit.Server.Tests.Storage;

public class StorageRegistrationTests
{
    [Fact]
    public void Default_registration_uses_inmemory_and_noop_pubsub_and_inmemory_awareness()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var services = new ServiceCollection();

        // Register configuration (mirrors Program.cs ordering)
        services.AddSyncKitConfiguration(config);

        // Register storage factory
        services.AddSyncKitStorage(config);

        var sp = services.BuildServiceProvider();

        var storage = sp.GetRequiredService<IStorageAdapter>();
        Assert.IsType<InMemoryStorageAdapter>(storage);

        var awareness = sp.GetRequiredService<SyncKit.Server.Awareness.IAwarenessStore>();
        Assert.IsType<SyncKit.Server.Awareness.InMemoryAwarenessStore>(awareness);

        var pubsub = sp.GetRequiredService<SyncKit.Server.PubSub.IRedisPubSub>();
        Assert.IsType<SyncKit.Server.PubSub.NoopRedisPubSub>(pubsub);
    }

    [Fact]
    public void Postgres_registration_installs_postgres_adapter_and_validator()
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
        Assert.IsType<PostgresStorageAdapter>(storage);

        // SchemaValidator should be registered
        var validator = sp.GetRequiredService<SchemaValidator>();
        Assert.NotNull(validator);
    }

    [Fact]
    public void PubSub_enabled_registers_redis_pubsub_and_sets_options()
    {
        var dict = new Dictionary<string, string?>
        {
            ["PubSub:Enabled"] = "true",
            ["PubSub:Provider"] = "redis",
            ["PubSub:Redis:ConnectionString"] = "localhost:6379",
            ["PubSub:Redis:ChannelPrefix"] = "synckit-test:"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        var services = new ServiceCollection();

        // Ensure SyncKitConfig options exist so PostConfigure can set values
        services.AddSyncKitConfiguration(config);

        // Register storage factory (will register redis pubsub)
        services.AddSyncKitStorage(config);

        // Examine service descriptors to ensure IRedisPubSub is registered
        var descriptor = services.FirstOrDefault(sd => sd.ServiceType == typeof(SyncKit.Server.PubSub.IRedisPubSub));
        Assert.NotNull(descriptor);

        // Check that SyncKitConfig options are post-configured with redis values
        var sp = services.BuildServiceProvider();
        var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<SyncKitConfig>>();
        Assert.Equal("localhost:6379", opts.Value.RedisUrl);
        Assert.Equal("synckit-test:", opts.Value.RedisChannelPrefix);
    }

    [Fact]
    public void Missing_postgres_connectionstring_throws()
    {
        var dict = new Dictionary<string, string?>
        {
            ["Storage:Provider"] = "postgresql"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        var services = new ServiceCollection();

        services.AddSyncKitConfiguration(config);

        Assert.Throws<InvalidOperationException>(() => services.AddSyncKitStorage(config));
    }

    [Fact]
    public void PubSub_enabled_without_connstring_throws()
    {
        var dict = new Dictionary<string, string?>
        {
            ["PubSub:Enabled"] = "true",
            ["PubSub:Provider"] = "redis"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        var services = new ServiceCollection();

        services.AddSyncKitConfiguration(config);

        Assert.Throws<InvalidOperationException>(() => services.AddSyncKitStorage(config));
    }

    [Fact]
    public void Awareness_redis_provider_registers_redis_store()
    {
        var dict = new Dictionary<string, string?>
        {
            ["Awareness:Provider"] = "redis",
            ["Awareness:Redis:ConnectionString"] = "localhost:6379"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        var services = new ServiceCollection();

        services.AddSyncKitConfiguration(config);

        // Should not throw
        services.AddSyncKitStorage(config);

        var descriptor = services.FirstOrDefault(sd => sd.ServiceType == typeof(SyncKit.Server.Awareness.IAwarenessStore));
        Assert.NotNull(descriptor);
    }

    [Fact]
    public void Awareness_postgres_provider_not_implemented_yet()
    {
        var dict = new Dictionary<string, string?>
        {
            ["Awareness:Provider"] = "postgresql"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        var services = new ServiceCollection();

        services.AddSyncKitConfiguration(config);

        Assert.Throws<InvalidOperationException>(() => services.AddSyncKitStorage(config));
    }
}
