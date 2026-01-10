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

}
