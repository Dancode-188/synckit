using System.Threading.Tasks;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using SyncKit.Server.Awareness;
using SyncKit.Server.Configuration;
using Xunit;

namespace SyncKit.Server.Tests.Awareness;

[Collection("Integration")]
public class RedisAwarenessStoreIntegrationTests : IAsyncLifetime
{
    private readonly TestcontainersContainer _redisContainer;
    private bool _dockerUnavailable = false;

    public RedisAwarenessStoreIntegrationTests()
    {
        _redisContainer = new TestcontainersBuilder<TestcontainersContainer>()
            .WithImage("redis:7-alpine")
            .WithCleanUp(true)
            .WithName("synckit-test-redis-awareness")
            .WithPortBinding(6379, true)
            .Build();
    }

    public async Task InitializeAsync()
    {
        try
        {
            await _redisContainer.StartAsync();
        }
        catch (Exception ex)
        {
            _dockerUnavailable = true;
            Console.WriteLine($"Skipping Redis awareness integration tests - docker not available: {ex.Message}");
        }
    }

    public async Task DisposeAsync()
    {
        if (_dockerUnavailable) return;
        try
        {
            await _redisContainer.StopAsync();
            await _redisContainer.DisposeAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error disposing Redis container: {ex.Message}");
        }
    }

    [Fact]
    public async Task Set_OnOneInstance_IsVisibleToAnother()
    {
        if (_dockerUnavailable) return;

        var host = _redisContainer.Hostname;
        var port = _redisContainer.GetMappedPublicPort(6379);
        var endpoint = $"{host}:{port}";

        var opts = Options.Create(new SyncKitConfig { RedisUrl = endpoint, AwarenessTimeoutMs = 5000 });

        var conn1 = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions { EndPoints = { endpoint }, AbortOnConnectFail = false });
        var conn2 = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions { EndPoints = { endpoint }, AbortOnConnectFail = false });

        var storeA = new RedisAwarenessStore(new NullLogger<RedisAwarenessStore>(), opts, conn1);
        var storeB = new RedisAwarenessStore(new NullLogger<RedisAwarenessStore>(), opts, conn2);

        var setResult = await storeA.SetAsync("doc1", "client1", SyncKit.Server.Awareness.AwarenessState.Create("client1", null, 1), 1);
        Assert.True(setResult);

        var all = await storeB.GetAllAsync("doc1");
        Assert.Single(all);
        Assert.Equal("client1", all[0].ClientId);
    }

    [Fact]
    public async Task Expiration_PruneExpired_RemovesEntries()
    {
        if (_dockerUnavailable) return;

        var host = _redisContainer.Hostname;
        var port = _redisContainer.GetMappedPublicPort(6379);
        var endpoint = $"{host}:{port}";

        var opts = Options.Create(new SyncKitConfig { RedisUrl = endpoint, AwarenessTimeoutMs = 200 });

        var conn = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions { EndPoints = { endpoint }, AbortOnConnectFail = false });

        var store = new RedisAwarenessStore(new NullLogger<RedisAwarenessStore>(), opts, conn);

        var ok = await store.SetAsync("doc1", "client-exp", SyncKit.Server.Awareness.AwarenessState.Create("client-exp", null, 1), 1);
        Assert.True(ok);

        // Wait for expiration
        await Task.Delay(500);

        var expired = await store.GetExpiredAsync();
        Assert.NotEmpty(expired);

        await store.PruneExpiredAsync();

        var all = await store.GetAllAsync("doc1");
        Assert.Empty(all);
    }
}
