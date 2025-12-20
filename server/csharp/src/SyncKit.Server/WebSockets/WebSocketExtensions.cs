using Microsoft.Extensions.Options;
using SyncKit.Server.Configuration;

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
}
