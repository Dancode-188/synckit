using System.Net.WebSockets;
using Microsoft.Extensions.Options;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles AUTH messages to authenticate WebSocket connections.
/// Supports both JWT token and API key authentication methods.
/// </summary>
public class AuthMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Auth];

    private readonly IJwtValidator _jwtValidator;
    private readonly IApiKeyValidator _apiKeyValidator;
    private readonly SyncKitConfig _config;
    private readonly ILogger<AuthMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public AuthMessageHandler(
        IJwtValidator jwtValidator,
        IApiKeyValidator apiKeyValidator,
        IOptions<SyncKitConfig> options,
        ILogger<AuthMessageHandler> logger)
    {
        _jwtValidator = jwtValidator ?? throw new ArgumentNullException(nameof(jwtValidator));
        _apiKeyValidator = apiKeyValidator ?? throw new ArgumentNullException(nameof(apiKeyValidator));
        _config = options?.Value ?? throw new ArgumentNullException(nameof(options));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not AuthMessage auth)
        {
            _logger.LogWarning("AuthMessageHandler received non-auth message type: {Type}", message.Type);
            return;
        }

        // If already authenticated (e.g., auto-auth when auth disabled), send success and return
        _logger.LogDebug("Connection {ConnectionId} state is {State}", connection.Id, connection.State);
        if (connection.State == ConnectionState.Authenticated)
        {
            _logger.LogDebug("Connection {ConnectionId} already authenticated, sending auth_success",
                connection.Id);

            // Send success response for already authenticated connection
            SendAuthSuccess(connection);
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

        // If no valid credentials but auth is not required, allow anonymous access
        if (payload == null && !_config.AuthRequired)
        {
            _logger.LogDebug("No credentials provided, allowing anonymous access (auth disabled)");
            payload = new TokenPayload
            {
                UserId = "anonymous",
                Permissions = new DocumentPermissions
                {
                    CanRead = [],
                    CanWrite = [],
                    IsAdmin = true // Give admin permissions for test/dev mode
                }
            };
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
        SendAuthSuccess(connection);
    }

    /// <summary>
    /// Sends an auth_success message to the connection.
    /// </summary>
    private void SendAuthSuccess(IConnection connection)
    {
        var permissionsDict = new Dictionary<string, object>
        {
            ["canRead"] = connection.TokenPayload?.Permissions.CanRead ?? [],
            ["canWrite"] = connection.TokenPayload?.Permissions.CanWrite ?? [],
            ["isAdmin"] = connection.TokenPayload?.Permissions.IsAdmin ?? false
        };

        var successMessage = new AuthSuccessMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            UserId = connection.UserId ?? "anonymous",
            Permissions = permissionsDict
        };

        connection.Send(successMessage);
    }
}
