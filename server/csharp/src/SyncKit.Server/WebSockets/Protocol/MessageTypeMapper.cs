namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Mapper for converting between MessageType (string enum) and MessageTypeCode (byte enum).
/// Ensures exact compatibility with TypeScript implementation.
/// </summary>
public static class MessageTypeMapper
{
    /// <summary>
    /// Maps MessageTypeCode to MessageType (for decoding binary messages).
    /// </summary>
    private static readonly Dictionary<MessageTypeCode, MessageType> CodeToType = new()
    {
        { MessageTypeCode.AUTH, MessageType.Auth },
        { MessageTypeCode.AUTH_SUCCESS, MessageType.AuthSuccess },
        { MessageTypeCode.AUTH_ERROR, MessageType.AuthError },
        { MessageTypeCode.SUBSCRIBE, MessageType.Subscribe },
        { MessageTypeCode.UNSUBSCRIBE, MessageType.Unsubscribe },
        { MessageTypeCode.SYNC_REQUEST, MessageType.SyncRequest },
        { MessageTypeCode.SYNC_RESPONSE, MessageType.SyncResponse },
        { MessageTypeCode.DELTA, MessageType.Delta },
        { MessageTypeCode.ACK, MessageType.Ack },
        { MessageTypeCode.PING, MessageType.Ping },
        { MessageTypeCode.PONG, MessageType.Pong },
        { MessageTypeCode.AWARENESS_UPDATE, MessageType.AwarenessUpdate },
        { MessageTypeCode.AWARENESS_SUBSCRIBE, MessageType.AwarenessSubscribe },
        { MessageTypeCode.AWARENESS_STATE, MessageType.AwarenessState },
        { MessageTypeCode.ERROR, MessageType.Error }
    };

    /// <summary>
    /// Maps MessageType to MessageTypeCode (for encoding binary messages).
    /// </summary>
    private static readonly Dictionary<MessageType, MessageTypeCode> TypeToCode = new()
    {
        { MessageType.Auth, MessageTypeCode.AUTH },
        { MessageType.AuthSuccess, MessageTypeCode.AUTH_SUCCESS },
        { MessageType.AuthError, MessageTypeCode.AUTH_ERROR },
        { MessageType.Subscribe, MessageTypeCode.SUBSCRIBE },
        { MessageType.Unsubscribe, MessageTypeCode.UNSUBSCRIBE },
        { MessageType.SyncRequest, MessageTypeCode.SYNC_REQUEST },
        { MessageType.SyncResponse, MessageTypeCode.SYNC_RESPONSE },
        { MessageType.Delta, MessageTypeCode.DELTA },
        { MessageType.Ack, MessageTypeCode.ACK },
        { MessageType.Ping, MessageTypeCode.PING },
        { MessageType.Pong, MessageTypeCode.PONG },
        { MessageType.AwarenessUpdate, MessageTypeCode.AWARENESS_UPDATE },
        { MessageType.AwarenessSubscribe, MessageTypeCode.AWARENESS_SUBSCRIBE },
        { MessageType.AwarenessState, MessageTypeCode.AWARENESS_STATE },
        { MessageType.Error, MessageTypeCode.ERROR },
        // Special mappings for compatibility
        { MessageType.Connect, MessageTypeCode.AUTH }, // Connect maps to AUTH for compatibility
        { MessageType.Disconnect, MessageTypeCode.ERROR } // Disconnect maps to ERROR for compatibility
    };

    /// <summary>
    /// Converts a MessageTypeCode to a MessageType.
    /// </summary>
    /// <param name="code">The message type code to convert.</param>
    /// <returns>The corresponding MessageType.</returns>
    /// <exception cref="ArgumentException">Thrown when the code is not recognized.</exception>
    public static MessageType GetTypeFromCode(MessageTypeCode code)
    {
        if (CodeToType.TryGetValue(code, out var type))
        {
            return type;
        }
        throw new ArgumentException($"Unknown message type code: 0x{code:X2}", nameof(code));
    }

    /// <summary>
    /// Converts a MessageType to a MessageTypeCode.
    /// </summary>
    /// <param name="type">The message type to convert.</param>
    /// <returns>The corresponding MessageTypeCode.</returns>
    /// <exception cref="ArgumentException">Thrown when the type is not recognized.</exception>
    public static MessageTypeCode GetCodeFromType(MessageType type)
    {
        if (TypeToCode.TryGetValue(type, out var code))
        {
            return code;
        }
        throw new ArgumentException($"Unknown message type: {type}", nameof(type));
    }

    /// <summary>
    /// Tries to convert a MessageTypeCode to a MessageType.
    /// </summary>
    /// <param name="code">The message type code to convert.</param>
    /// <param name="type">The resulting MessageType if successful.</param>
    /// <returns>True if the conversion was successful; otherwise, false.</returns>
    public static bool TryGetTypeFromCode(MessageTypeCode code, out MessageType type)
    {
        return CodeToType.TryGetValue(code, out type);
    }

    /// <summary>
    /// Tries to convert a MessageType to a MessageTypeCode.
    /// </summary>
    /// <param name="type">The message type to convert.</param>
    /// <param name="code">The resulting MessageTypeCode if successful.</param>
    /// <returns>True if the conversion was successful; otherwise, false.</returns>
    public static bool TryGetCodeFromType(MessageType type, out MessageTypeCode code)
    {
        return TypeToCode.TryGetValue(type, out code);
    }
}
