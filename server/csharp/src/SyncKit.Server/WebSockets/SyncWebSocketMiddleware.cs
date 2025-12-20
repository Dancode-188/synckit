using System.Net.WebSockets;

namespace SyncKit.Server.WebSockets;

/// <summary>
/// ASP.NET Core middleware to handle WebSocket upgrade requests at the /ws endpoint.
/// </summary>
/// <remarks>
/// This middleware:
/// - Accepts WebSocket upgrade requests at /ws
/// - Rejects non-WebSocket requests to /ws with 400 Bad Request
/// - Creates a Connection for each WebSocket and tracks it via ConnectionManager
/// - Handles connection lifecycle with proper error handling and logging
/// - Gracefully handles client disconnects without error logs
/// </remarks>
public class SyncWebSocketMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IConnectionManager _connectionManager;
    private readonly ILogger<SyncWebSocketMiddleware> _logger;

    /// <summary>
    /// Creates a new instance of the WebSocket middleware.
    /// </summary>
    /// <param name="next">The next middleware in the pipeline.</param>
    /// <param name="connectionManager">The connection manager service.</param>
    /// <param name="logger">Logger instance.</param>
    public SyncWebSocketMiddleware(
        RequestDelegate next,
        IConnectionManager connectionManager,
        ILogger<SyncWebSocketMiddleware> logger)
    {
        _next = next ?? throw new ArgumentNullException(nameof(next));
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Process an HTTP request.
    /// </summary>
    /// <param name="context">The HTTP context.</param>
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path == "/ws")
        {
            if (context.WebSockets.IsWebSocketRequest)
            {
                await HandleWebSocketAsync(context);
            }
            else
            {
                _logger.LogDebug("Non-WebSocket request to /ws endpoint from {RemoteIp}",
                    context.Connection.RemoteIpAddress);
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsync("WebSocket connections only");
            }
        }
        else
        {
            await _next(context);
        }
    }

    /// <summary>
    /// Handles WebSocket connection lifecycle.
    /// </summary>
    private async Task HandleWebSocketAsync(HttpContext context)
    {
        WebSocket webSocket;

        try
        {
            webSocket = await context.WebSockets.AcceptWebSocketAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to accept WebSocket connection");
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            return;
        }

        IConnection? connection = null;

        try
        {
            connection = await _connectionManager.CreateConnectionAsync(webSocket, context.RequestAborted);

            _logger.LogInformation("WebSocket connection established: {ConnectionId} from {RemoteIp}",
                connection.Id,
                context.Connection.RemoteIpAddress);

            await connection.ProcessMessagesAsync(context.RequestAborted);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // Client disconnected - this is expected, no error log
            _logger.LogDebug("Client {ConnectionId} disconnected (request aborted)",
                connection?.Id ?? "unknown");
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
        {
            // Client closed connection abruptly - this is common, no error log
            _logger.LogDebug("Client {ConnectionId} closed connection prematurely",
                connection?.Id ?? "unknown");
        }
        catch (WebSocketException ex)
        {
            // Other WebSocket errors
            _logger.LogWarning(ex, "WebSocket error for connection {ConnectionId}: {ErrorCode}",
                connection?.Id ?? "unknown",
                ex.WebSocketErrorCode);
        }
        catch (Exception ex)
        {
            // Unhandled exceptions - log error but don't expose to client
            _logger.LogError(ex, "Unhandled exception for connection {ConnectionId}",
                connection?.Id ?? "unknown");
        }
        finally
        {
            if (connection is not null)
            {
                await _connectionManager.RemoveConnectionAsync(connection.Id);
                _logger.LogInformation("WebSocket connection closed: {ConnectionId}", connection.Id);
            }
        }
    }
}
