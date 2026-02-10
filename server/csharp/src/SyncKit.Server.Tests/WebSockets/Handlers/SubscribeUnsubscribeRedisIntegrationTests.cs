using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.PubSub;
using SyncKit.Server.Storage;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol.Messages;
using SyncKit.Server.Auth;
using Xunit;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

public class SubscribeUnsubscribeRedisIntegrationTests
{
    [Fact]
    public async Task SubscribeMessageHandler_SubscribesToRedisWhenFirstLocalSubscriber()
    {
        var mockRedis = new Mock<IRedisPubSub>();
        var mockConnManager = new Mock<IConnectionManager>();
        var mockStorage = new Mock<IStorageAdapter>();
        var authGuard = new SyncKit.Server.WebSockets.AuthGuard(new NullLogger<SyncKit.Server.WebSockets.AuthGuard>());
        var subscribed = false;
        mockRedis.Setup(r => r.SubscribeAsync("doc1", It.IsAny<Func<SyncKit.Server.WebSockets.Protocol.IMessage, System.Threading.Tasks.Task>>()))
            .Callback<string, Func<SyncKit.Server.WebSockets.Protocol.IMessage, System.Threading.Tasks.Task>>((doc, fn) => subscribed = true)
            .Returns(Task.CompletedTask);

        var handler = new SubscribeMessageHandler(authGuard, mockStorage.Object, mockConnManager.Object, mockRedis.Object, new NullLogger<SubscribeMessageHandler>());

        // Setup: after subscription there will be one local connection
        mockConnManager.Setup(cm => cm.GetConnectionsByDocument("doc1")).Returns(new List<IConnection> { Mock.Of<IConnection>() });

        var message = new SubscribeMessage { Id = "s1", Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), DocumentId = "doc1" };
        var connectionMock = new Mock<IConnection>();
        connectionMock.Setup(c => c.Id).Returns("conn1");
        connectionMock.Setup(c => c.GetSubscriptions()).Returns(new HashSet<string>());
        connectionMock.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        connectionMock.Setup(c => c.TokenPayload).Returns(new TokenPayload { UserId = "user-1", Permissions = new DocumentPermissions { CanRead = new[] { "doc1" }, CanWrite = Array.Empty<string>(), IsAdmin = false } });

        await handler.HandleAsync(connectionMock.Object, message);

        Assert.True(subscribed);
    }

    [Fact]
    public async Task UnsubscribeMessageHandler_UnsubscribesFromRedisWhenNoLocalSubscribers()
    {
        var mockRedis = new Mock<IRedisPubSub>();
        var mockConnManager = new Mock<IConnectionManager>();
        var mockStorage = new Mock<IStorageAdapter>();
        var handler = new UnsubscribeMessageHandler(mockStorage.Object, mockConnManager.Object, mockRedis.Object, new NullLogger<UnsubscribeMessageHandler>());

        // Setup: after unsubscribe there will be zero local connections
        mockConnManager.Setup(cm => cm.GetConnectionsByDocument("doc1")).Returns(new List<IConnection>());

        var message = new UnsubscribeMessage { Id = "u1", Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), DocumentId = "doc1" };
        var connection = Mock.Of<IConnection>(c => c.Id == "conn1");

        await handler.HandleAsync(connection, message);

        mockRedis.Verify(r => r.UnsubscribeAsync("doc1"), Times.Once);
    }
}
