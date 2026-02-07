using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.PubSub;

public interface IRedisPubSub
{
    Task PublishDeltaAsync(string documentId, DeltaMessage delta);
    Task PublishAwarenessAsync(string documentId, AwarenessUpdateMessage update);
    Task SubscribeAsync(string documentId, Func<IMessage, Task> handler);
    Task UnsubscribeAsync(string documentId);
    Task<bool> IsConnectedAsync();
}
