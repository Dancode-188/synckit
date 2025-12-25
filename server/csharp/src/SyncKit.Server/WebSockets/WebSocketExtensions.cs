using Microsoft.Extensions.Options;
using SyncKit.Server.Configuration;
using SyncKit.Server.Sync;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets;

/// <summary>
/// Extension methods for configuring WebSocket services and middleware.
/// </summary>
public static class WebSocketExtensions
{
    /// <summary>
    /// Adds SyncKit WebSocket services to the service collection.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddSyncKitWebSockets(this IServiceCollection services)
    {
        services.AddSingleton<IConnectionManager, ConnectionManager>();

        // Register document store
        services.AddSingleton<IDocumentStore, InMemoryDocumentStore>();

        // Register AuthGuard for permission enforcement
        services.AddSingleton<AuthGuard>();

        // Register message handlers
        services.AddSingleton<Handlers.IMessageHandler, Handlers.AuthMessageHandler>();
        services.AddSingleton<Handlers.IMessageHandler, Handlers.SubscribeMessageHandler>();
        services.AddSingleton<Handlers.IMessageHandler, Handlers.UnsubscribeMessageHandler>();
        services.AddSingleton<Handlers.IMessageHandler, Handlers.DeltaMessageHandler>();
        services.AddSingleton<Handlers.IMessageHandler, Handlers.AwarenessSubscribeMessageHandler>();
        services.AddSingleton<Handlers.IMessageHandler, Handlers.AwarenessUpdateMessageHandler>();

        // Register message router
        services.AddSingleton<Handlers.MessageRouter>();

        return services;
    }

    /// <summary>
    /// Configures and uses SyncKit WebSocket middleware.
    /// </summary>
    /// <param name="app">The web application.</param>
    /// <returns>The application for chaining.</returns>
    public static IApplicationBuilder UseSyncKitWebSockets(this IApplicationBuilder app)
    {
        // Get configuration for WebSocket options
        var config = app.ApplicationServices
            .GetRequiredService<IOptions<SyncKitConfig>>()
            .Value;

        // Configure WebSocket options from SyncKitConfig
        var webSocketOptions = new WebSocketOptions
        {
            // KeepAliveInterval sends WebSocket protocol-level pings
            KeepAliveInterval = TimeSpan.FromMilliseconds(config.WsHeartbeatInterval)
        };

        app.UseWebSockets(webSocketOptions);
        app.UseMiddleware<SyncWebSocketMiddleware>();

        return app;
    }

    /// <summary>
    /// Sends an error message to the client.
    /// </summary>
    /// <param name="connection">The connection to send the error to.</param>
    /// <param name="error">The error message.</param>
    /// <param name="details">Optional error details.</param>
    public static void SendError(this IConnection connection, string error, object? details = null)
    {
        var errorMessage = new ErrorMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Error = error,
            Details = details
        };

        connection.Send(errorMessage);
    }
}
