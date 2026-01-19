using System.Text.Json;
using Microsoft.Extensions.Options;
using SyncKit.Server.Configuration;
using SyncKit.Server.Sync;
using SyncKit.Server.Awareness;
using SyncKit.Server.Services;
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

        // Register in-memory storage adapter (single modern registration)
        services.AddSingleton<Storage.InMemoryStorageAdapter>();
        services.AddSingleton<Storage.IStorageAdapter>(sp => sp.GetRequiredService<Storage.InMemoryStorageAdapter>());

        // Register awareness store (in-memory for Phase 5)
        services.AddSingleton<IAwarenessStore, InMemoryAwarenessStore>();

        // Register Redis pub/sub provider (noop by default)
        services.AddSingleton<PubSub.IRedisPubSub, PubSub.NoopRedisPubSub>();

        // Replace with real Redis provider if configured
        var provider = services.BuildServiceProvider();
        var config = provider.GetRequiredService<IOptions<SyncKitConfig>>().Value;
        if (!string.IsNullOrEmpty(config.RedisUrl))
        {
            services.AddSingleton<PubSub.IRedisPubSub, PubSub.RedisPubSubProvider>();
        }

        // Register AuthGuard for permission enforcement
        services.AddSingleton<AuthGuard>();

        // Register delta batching service for efficient broadcast coalescing
        // This batches rapid delta updates within a 50ms window before broadcasting
        services.AddSingleton<DeltaBatchingService>();
        services.AddHostedService(sp => sp.GetRequiredService<DeltaBatchingService>());

        // Register ACK tracker service for message delivery tracking and retry
        // This tracks pending acknowledgments and retries unacknowledged messages
        services.AddSingleton<AckTracker.AckTrackerOptions>();
        services.AddSingleton<AckTracker>();
        services.AddHostedService(sp => sp.GetRequiredService<AckTracker>());

        // Register message handlers
        // Heartbeat handlers
        services.AddSingleton<Handlers.IMessageHandler, Handlers.PingMessageHandler>();
        services.AddSingleton<Handlers.IMessageHandler, Handlers.PongMessageHandler>();

        // Auth handler
        services.AddSingleton<Handlers.IMessageHandler, Handlers.AuthMessageHandler>();

        // Sync handlers
        services.AddSingleton<Handlers.IMessageHandler, Handlers.SubscribeMessageHandler>();
        services.AddSingleton<Handlers.IMessageHandler, Handlers.UnsubscribeMessageHandler>();

        // DeltaMessageHandler with explicit dependencies including batching service
        services.AddSingleton<Handlers.IMessageHandler>(sp =>
        {
            var authGuard = sp.GetRequiredService<AuthGuard>();
            var storage = sp.GetRequiredService<Storage.IStorageAdapter>();
            var connectionManager = sp.GetRequiredService<IConnectionManager>();
            var batchingService = sp.GetRequiredService<DeltaBatchingService>();
            var redis = sp.GetService<PubSub.IRedisPubSub>();
            var logger = sp.GetRequiredService<ILogger<Handlers.DeltaMessageHandler>>();

            return new Handlers.DeltaMessageHandler(
                authGuard,
                storage,
                connectionManager,
                batchingService,
                redis,
                logger);
        });

        services.AddSingleton<Handlers.IMessageHandler, Handlers.SyncRequestMessageHandler>();

        // AckMessageHandler with ACK tracker for delivery tracking and retry
        services.AddSingleton<Handlers.IMessageHandler>(sp =>
        {
            var logger = sp.GetRequiredService<ILogger<Handlers.AckMessageHandler>>();
            var ackTracker = sp.GetRequiredService<AckTracker>();
            return new Handlers.AckMessageHandler(logger, ackTracker);
        });

        // Awareness handlers
        services.AddSingleton<Handlers.IMessageHandler, Handlers.AwarenessSubscribeMessageHandler>();
        services.AddSingleton<Handlers.IMessageHandler, Handlers.AwarenessUpdateMessageHandler>();

        // Register message dispatcher
        services.AddSingleton<Handlers.IMessageDispatcher, Handlers.MessageDispatcher>();

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
        // Convert details to JsonElement if provided, for source-generated serialization
        JsonElement? detailsJson = details != null
            ? JsonSerializer.SerializeToElement(details)
            : null;

        var errorMessage = new ErrorMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Error = error,
            Details = detailsJson
        };

        connection.Send(errorMessage);
    }
}
