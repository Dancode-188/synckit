namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Stub implementation of JSON protocol handler for P2-02.
/// </summary>
/// <remarks>
/// Full implementation with message type parsing will be added in P2-04.
/// This stub allows Connection class to compile and enables basic message logging.
/// </remarks>
public class JsonProtocolHandler : IProtocolHandler
{
    private readonly ILogger<JsonProtocolHandler> _logger;

    public JsonProtocolHandler(ILogger<JsonProtocolHandler> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <inheritdoc />
    public IMessage? Parse(ReadOnlyMemory<byte> data)
    {
        // Stub implementation - full parsing in P2-04
        _logger.LogTrace("JSON parse stub called with {ByteCount} bytes", data.Length);
        return null;
    }

    /// <inheritdoc />
    public ReadOnlyMemory<byte> Serialize(IMessage message)
    {
        // Stub implementation - full serialization in P2-04
        _logger.LogTrace("JSON serialize stub called for message {MessageId}", message.Id);
        return ReadOnlyMemory<byte>.Empty;
    }
}
