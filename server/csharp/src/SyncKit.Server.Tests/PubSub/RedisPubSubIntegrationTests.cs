using System.Text.Json;
using System.Threading.Tasks;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using SyncKit.Server.Configuration;
using SyncKit.Server.PubSub;
using SyncKit.Server.WebSockets.Protocol.Messages;
using Xunit;

namespace SyncKit.Server.Tests.PubSub;

[Collection("Integration")]
public class RedisPubSubIntegrationTests : IAsyncLifetime
{
    private readonly TestcontainersContainer _redisContainer;

    public RedisPubSubIntegrationTests()
    {
        _redisContainer = new TestcontainersBuilder<TestcontainersContainer>()
            .WithImage("redis:7-alpine")
            .WithCleanUp(true)
            .WithName("synckit-test-redis")
            .WithPortBinding(6379, true)
            .Build();
    }

    private bool _dockerUnavailable = false;

    public async Task InitializeAsync()
    {
        try
        {
            await _redisContainer.StartAsync();
        }
        catch (Exception ex)
        {
            // Docker/Testcontainers not available in this environment - mark tests to be skipped
            _dockerUnavailable = true;
            Console.WriteLine($"Skipping Redis integration tests - docker not available: {ex.Message}");
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
    public async Task MessagePublishedOnOneInstance_IsReceivedByTheOther()
    {
        if (_dockerUnavailable) return;

        var host = _redisContainer.Hostname;
        var port = _redisContainer.GetMappedPublicPort(6379);
        var endpoint = $"{host}:{port}";

        var opts = Options.Create(new SyncKitConfig { RedisUrl = endpoint });

        var conn1 = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions { EndPoints = { endpoint }, AbortOnConnectFail = false, ConnectRetry = 3 });
        var conn2 = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions { EndPoints = { endpoint }, AbortOnConnectFail = false, ConnectRetry = 3 });

        await using var providerA = new RedisPubSubProvider(new NullLogger<RedisPubSubProvider>(), opts, conn1);
        await using var providerB = new RedisPubSubProvider(new NullLogger<RedisPubSubProvider>(), opts, conn2);

        if (_dockerUnavailable)
        {
            // Skip in CI environments where Docker/Testcontainers aren't available
            return;
        }

        var tcs = new TaskCompletionSource<bool>();

        await providerB.SubscribeAsync("doc1", async (msg) =>
        {
            if (msg is DeltaMessage)
            {
                tcs.TrySetResult(true);
            }
            await Task.CompletedTask;
        });

        var delta = new DeltaMessage { Id = "delta-1", Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), DocumentId = "doc1", Delta = JsonDocument.Parse("{}").RootElement, VectorClock = new Dictionary<string, long>() };
        await providerA.PublishDeltaAsync("doc1", delta);

        // Wait for providerB to receive
        var received = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(10)));
        Assert.True(tcs.Task.IsCompleted, "Provider B did not receive the message within timeout");

        Assert.Equal(1, providerA.PublishedCount);
        Assert.Equal(1, providerB.ReceivedCount);
        Assert.Equal(0, providerA.ReceivedCount); // ensure dedupe avoided local re-broadcast
    }

    [Fact]
    public async Task AwarenessPublishedOnOneInstance_IsReceivedByTheOther()
    {
        if (_dockerUnavailable) return;

        var host = _redisContainer.Hostname;
        var port = _redisContainer.GetMappedPublicPort(6379);
        var endpoint = $"{host}:{port}";

        var opts = Options.Create(new SyncKitConfig { RedisUrl = endpoint });

        var conn1 = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions { EndPoints = { endpoint }, AbortOnConnectFail = false, ConnectRetry = 3 });
        var conn2 = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions { EndPoints = { endpoint }, AbortOnConnectFail = false, ConnectRetry = 3 });

        await using var providerA = new RedisPubSubProvider(new NullLogger<RedisPubSubProvider>(), opts, conn1);
        await using var providerB = new RedisPubSubProvider(new NullLogger<RedisPubSubProvider>(), opts, conn2);

        var tcs = new TaskCompletionSource<bool>();

        await providerB.SubscribeAsync("doc1", async (msg) =>
        {
            if (msg is AwarenessUpdateMessage)
            {
                tcs.TrySetResult(true);
            }
            await Task.CompletedTask;
        });

        var update = new AwarenessUpdateMessage { Id = "au-1", Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), DocumentId = "doc1", ClientId = "client1", State = null, Clock = 0 };
        await providerA.PublishAwarenessAsync("doc1", update);

        // Wait for providerB to receive
        var received = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(10)));
        Assert.True(tcs.Task.IsCompleted, "Provider B did not receive the awareness update within timeout");

        Assert.Equal(1, providerA.PublishedCount);
        Assert.Equal(1, providerB.ReceivedCount);
    }

    [Fact]
    public async Task RestartingRedis_TriggersReconnectionEvent()
    {
        if (_dockerUnavailable) return;

        var host = _redisContainer.Hostname;
        var port = _redisContainer.GetMappedPublicPort(6379);
        var endpoint = $"{host}:{port}";

        var opts = Options.Create(new SyncKitConfig { RedisUrl = endpoint });

        if (_dockerUnavailable)
        {
            // Skip in CI environments where Docker/Testcontainers aren't available
            return;
        }

        var conn = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions 
        { 
            EndPoints = { endpoint }, 
            AbortOnConnectFail = false, 
            ConnectRetry = 5,
            ReconnectRetryPolicy = new ExponentialRetry(100, 1000),  // Start at 100ms, max 1s between retries
            ConnectTimeout = 5000,
            KeepAlive = 1  // Send keepalive every 1 second to detect disconnection quickly
        });

        await using var provider = new RedisPubSubProvider(new NullLogger<RedisPubSubProvider>(), opts, conn);

        // Subscribe to a document so the provider has active subscriptions during reconnection
        var messageReceived = new TaskCompletionSource<bool>();
        await provider.SubscribeAsync("test-doc", async (msg) =>
        {
            messageReceived.TrySetResult(true);
            await Task.CompletedTask;
        });

        // Trigger a restart
        await _redisContainer.StopAsync();
        await Task.Delay(2000);  // Give Redis time to fully stop
        await _redisContainer.StartAsync();
        await Task.Delay(2000);  // Give Redis time to fully start
        
        // Wait for the connection to actually reconnect to Redis
        var connectSw = System.Diagnostics.Stopwatch.StartNew();
        while (connectSw.Elapsed < TimeSpan.FromSeconds(15))
        {
            if (conn.IsConnected) break;
            await Task.Delay(500);
        }
        
        if (!conn.IsConnected)
        {
            Assert.Fail("Connection did not reconnect to Redis within timeout");
        }

        // Wait until reconnection count increments or timeout
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (sw.Elapsed < TimeSpan.FromSeconds(30))
        {
            if (provider.ReconnectionCount > 0) break;
            await Task.Delay(500);
        }

        Assert.True(provider.ReconnectionCount > 0, "Provider did not detect reconnection after Redis restart");
    }
}
