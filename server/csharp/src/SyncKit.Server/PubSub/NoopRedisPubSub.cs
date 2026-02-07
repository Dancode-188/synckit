using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.PubSub;

public class NoopRedisPubSub : IRedisPubSub
{
    public Task PublishDeltaAsync(string documentId, DeltaMessage delta) => Task.CompletedTask;
    public Task PublishAwarenessAsync(string documentId, AwarenessUpdateMessage update) => Task.CompletedTask;
    public Task SubscribeAsync(string documentId, Func<IMessage, Task> handler) => Task.CompletedTask;
    public Task UnsubscribeAsync(string documentId) => Task.CompletedTask;
    public Task<bool> IsConnectedAsync() => Task.FromResult(false);
}
