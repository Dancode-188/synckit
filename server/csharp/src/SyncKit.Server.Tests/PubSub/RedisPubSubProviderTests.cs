using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using StackExchange.Redis;
using SyncKit.Server.Configuration;
using SyncKit.Server.PubSub;
using SyncKit.Server.WebSockets.Protocol.Messages;
using Xunit;

namespace SyncKit.Server.Tests.PubSub;

public class RedisPubSubProviderTests
{
    [Fact]
    public async Task PublishDeltaAsync_CallsRedisPublish()
    {
        var mockConn = new Mock<IConnectionMultiplexer>();
        var mockSub = new Mock<ISubscriber>();
        mockConn.Setup(c => c.GetSubscriber(It.IsAny<object>())).Returns(mockSub.Object);

        mockSub.Setup(s => s.PublishAsync(It.IsAny<RedisChannel>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>())).ReturnsAsync(1L);

        var cfg = Options.Create(new SyncKitConfig { RedisUrl = "localhost:6379" });
        var provider = new RedisPubSubProvider(new NullLogger<RedisPubSubProvider>(), cfg, mockConn.Object);

        var msg = new DeltaMessage { Id = "d1", Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), DocumentId = "doc1", Delta = JsonSerializer.Deserialize<JsonElement>("{}"), VectorClock = new Dictionary<string, long>() };

        await provider.PublishDeltaAsync("doc1", msg);

        mockSub.Verify(s => s.PublishAsync(It.Is<RedisChannel>(ch => ch.ToString().Contains("delta:doc1")), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>()), Times.Once);
    }

    [Fact]
    public async Task PublishAwarenessAsync_CallsRedisPublish()
    {
        var mockConn = new Mock<IConnectionMultiplexer>();
        var mockSub = new Mock<ISubscriber>();
        mockConn.Setup(c => c.GetSubscriber(It.IsAny<object>())).Returns(mockSub.Object);

        mockSub.Setup(s => s.PublishAsync(It.IsAny<RedisChannel>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>())).ReturnsAsync(1L);

        var cfg = Options.Create(new SyncKitConfig { RedisUrl = "localhost:6379" });
        var provider = new RedisPubSubProvider(new NullLogger<RedisPubSubProvider>(), cfg, mockConn.Object);

        var msg = new AwarenessUpdateMessage { Id = "a1", Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), DocumentId = "doc1", ClientId = "client1", State = null, Clock = 0 };

        await provider.PublishAwarenessAsync("doc1", msg);

        mockSub.Verify(s => s.PublishAsync(It.Is<RedisChannel>(ch => ch.ToString().Contains("awareness:doc1")), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>()), Times.Once);
    }

    [Fact]
    public async Task SubscribeAsync_InvokesHandlerOnMessage()
    {
        var mockConn = new Mock<IConnectionMultiplexer>();
        var mockSub = new Mock<ISubscriber>();
        Action<RedisChannel, RedisValue>? capturedHandler = null;

        mockConn.Setup(c => c.GetSubscriber(It.IsAny<object>())).Returns(mockSub.Object);
        mockSub.Setup(s => s.SubscribeAsync(It.IsAny<RedisChannel>(), It.IsAny<Action<RedisChannel, RedisValue>>(), It.IsAny<CommandFlags>()))
            .Callback<RedisChannel, Action<RedisChannel, RedisValue>, CommandFlags>((ch, handler, flags) => capturedHandler = handler)
            .Returns(Task.CompletedTask);

        var cfg = Options.Create(new SyncKitConfig { RedisUrl = "localhost:6379" });
        var provider = new RedisPubSubProvider(new NullLogger<RedisPubSubProvider>(), cfg, mockConn.Object);

        var called = false;
        await provider.SubscribeAsync("doc1", async (msg) =>
        {
            Assert.IsType<DeltaMessage>(msg);
            called = true;
            await Task.CompletedTask;
        });

        // Simulate incoming Redis message
        var delta = new DeltaMessage { Id = "d1", Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), DocumentId = "doc1", Delta = JsonSerializer.Deserialize<JsonElement>("{}"), VectorClock = new Dictionary<string, long>() };
        var json = JsonSerializer.Serialize(delta, delta.GetType(), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true });

        Assert.NotNull(capturedHandler);
        capturedHandler!(RedisChannel.Literal("ch"), json);

        Assert.True(called);
    }
}
