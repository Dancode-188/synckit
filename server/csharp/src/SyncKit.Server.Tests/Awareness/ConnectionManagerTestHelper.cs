using System.Linq;
using System.Threading.Tasks;
using Moq;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol;

namespace SyncKit.Server.Tests.Awareness;

/// <summary>
/// Utilities to create mocked connection managers and connections for awareness tests.
/// </summary>
public static class ConnectionManagerTestHelper
{
    public static Mock<IConnection> CreateMockConnection(string id)
    {
        var mock = new Mock<IConnection>();
        mock.SetupGet(c => c.Id).Returns(id);
        mock.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        // Default subscriptions empty; tests can override if needed
        mock.Setup(c => c.GetSubscriptions()).Returns(new HashSet<string>());
        return mock;
    }

    public static Mock<IConnectionManager> CreateMockManagerWithSubscribers(string documentId, IEnumerable<Mock<IConnection>> subscribers)
    {
        var subs = subscribers.ToList();
        var mock = new Mock<IConnectionManager>();

        mock.Setup(cm => cm.GetConnectionsByDocument(documentId)).Returns(subs.Select(s => s.Object).ToList().AsReadOnly());

        mock.Setup(cm => cm.BroadcastToDocumentAsync(documentId, It.IsAny<IMessage>(), It.IsAny<string?>()))
            .Returns<string, IMessage, string?>((doc, msg, exclude) =>
            {

                var errors = new List<Exception>();

                foreach (var s in subs)
                {
                    if (s.Object.Id == exclude) continue;
                    try
                    {
                        s.Object.Send(msg);
                    }
                    catch (Exception ex)
                    {
                        // Collect exceptions to rethrow after all subscribers processed so the caller can log
                        errors.Add(ex);
                    }
                }

                if (errors.Any())
                {
                    throw new AggregateException(errors);
                }

                return Task.CompletedTask;
            });

        return mock;
    }

    public static Mock<IConnectionManager> CreateMockManagerWithDocumentSubscribers(Dictionary<string, List<Mock<IConnection>>> documentSubscribers)
    {
        var mock = new Mock<IConnectionManager>();

        mock.Setup(cm => cm.GetConnectionsByDocument(It.IsAny<string>()))
            .Returns<string>(doc => documentSubscribers.ContainsKey(doc) ? documentSubscribers[doc].Select(s => s.Object).ToList().AsReadOnly() : new List<IConnection>().AsReadOnly());

        mock.Setup(cm => cm.BroadcastToDocumentAsync(It.IsAny<string>(), It.IsAny<IMessage>(), It.IsAny<string?>()))
            .Returns<string, IMessage, string?>((doc, msg, exclude) =>
            {
                if (!documentSubscribers.ContainsKey(doc)) return Task.CompletedTask;
                var errors = new List<Exception>();

                foreach (var s in documentSubscribers[doc])
                {
                    if (s.Object.Id == exclude) continue;
                    try
                    {
                        s.Object.Send(msg);
                    }
                    catch (Exception ex)
                    {
                        errors.Add(ex);
                    }
                }

                if (errors.Any())
                {
                    throw new AggregateException(errors);
                }

                return Task.CompletedTask;
            });

        return mock;
    }
}
