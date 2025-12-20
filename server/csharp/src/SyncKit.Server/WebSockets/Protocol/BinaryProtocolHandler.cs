namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Stub implementation of binary protocol handler for P2-02.
/// </summary>
/// <remarks>
/// Full implementation with message type parsing will be added in P2-05.
/// This stub allows Connection class to compile and enables basic message logging.
/// </remarks>
public class BinaryProtocolHandler : IProtocolHandler
{
    private readonly ILogger<BinaryProtocolHandler> _logger;

    public BinaryProtocolHandler(ILogger<BinaryProtocolHandler> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <inheritdoc />
    public IMessage? Parse(ReadOnlyMemory<byte> data)
    {
        // Stub implementation - full parsing in P2-05
        _logger.LogTrace("Binary parse stub called with {ByteCount} bytes", data.Length);
        return null;
    }

    /// <inheritdoc />
    public ReadOnlyMemory<byte> Serialize(IMessage message)
    {
        // Stub implementation - full serialization in P2-05
        _logger.LogTrace("Binary serialize stub called for message {MessageId}", message.Id);
        return ReadOnlyMemory<byte>.Empty;
    }
}
