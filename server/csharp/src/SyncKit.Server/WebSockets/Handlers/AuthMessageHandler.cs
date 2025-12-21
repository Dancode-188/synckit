using System.Net.WebSockets;
using SyncKit.Server.Auth;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles AUTH messages to authenticate WebSocket connections.
/// Supports both JWT token and API key authentication methods.
/// </summary>
public class AuthMessageHandler : IMessageHandler
{
    private readonly IJwtValidator _jwtValidator;
    private readonly IApiKeyValidator _apiKeyValidator;
    private readonly ILogger<AuthMessageHandler> _logger;

    public MessageType[] HandledTypes => new[] { MessageType.Auth };

    public AuthMessageHandler(
        IJwtValidator jwtValidator,
        IApiKeyValidator apiKeyValidator,
        ILogger<AuthMessageHandler> logger)
    {
        _jwtValidator = jwtValidator ?? throw new ArgumentNullException(nameof(jwtValidator));
        _apiKeyValidator = apiKeyValidator ?? throw new ArgumentNullException(nameof(apiKeyValidator));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not AuthMessage auth)
        {
            _logger.LogWarning("AuthMessageHandler received non-auth message type: {Type}", message.Type);
            return;
        }

        // Don't re-authenticate already authenticated connections
        if (connection.State == ConnectionState.Authenticated)
        {
            _logger.LogDebug("Connection {ConnectionId} already authenticated, ignoring auth message",
                connection.Id);
            return;
        }

        _logger.LogDebug("Processing auth for connection {ConnectionId}", connection.Id);

        TokenPayload? payload = null;

        // Try JWT token first
        if (!string.IsNullOrEmpty(auth.Token))
        {
            _logger.LogDebug("Attempting JWT authentication for connection {ConnectionId}", connection.Id);
            payload = _jwtValidator.Validate(auth.Token);

            if (payload == null)
            {
                _logger.LogDebug("JWT validation failed for connection {ConnectionId}", connection.Id);
            }
        }

        // Fall back to API key if no token or token invalid
        if (payload == null && !string.IsNullOrEmpty(auth.ApiKey))
        {
            _logger.LogDebug("Attempting API key authentication for connection {ConnectionId}", connection.Id);
            payload = _apiKeyValidator.Validate(auth.ApiKey);

            if (payload == null)
            {
                _logger.LogDebug("API key validation failed for connection {ConnectionId}", connection.Id);
            }
        }

        // Auth failed - send error and close
        if (payload == null)
        {
            _logger.LogWarning("Authentication failed for connection {ConnectionId} - no valid credentials",
                connection.Id);

            var errorMessage = new AuthErrorMessage
            {
                Id = Guid.NewGuid().ToString(),
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Error = "Authentication failed: invalid or missing credentials"
            };

            connection.Send(errorMessage);

            // Close with PolicyViolation (1008) to match TypeScript behavior
            await connection.CloseAsync(
                WebSocketCloseStatus.PolicyViolation,
                "Authentication failed",
                CancellationToken.None);

            return;
        }

        // Auth succeeded - update connection state
        connection.UserId = payload.UserId;
        connection.ClientId = payload.UserId; // Use userId as clientId if not set
        connection.TokenPayload = payload;
        connection.State = ConnectionState.Authenticated;

        _logger.LogInformation(
            "Connection {ConnectionId} authenticated as user {UserId}",
            connection.Id, payload.UserId);

        // Send success response
        // Convert DocumentPermissions to Dictionary for protocol compatibility
        var permissionsDict = new Dictionary<string, object>
        {
            ["canRead"] = payload.Permissions.CanRead,
            ["canWrite"] = payload.Permissions.CanWrite,
            ["isAdmin"] = payload.Permissions.IsAdmin
        };

        var successMessage = new AuthSuccessMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            UserId = payload.UserId,
            Permissions = permissionsDict
        };

        connection.Send(successMessage);
    }
}
