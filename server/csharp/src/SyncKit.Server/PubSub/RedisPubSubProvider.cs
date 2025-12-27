using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using SyncKit.Server.Configuration;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.PubSub;

/// <summary>
/// Redis-backed pub/sub provider for broadcasting delta and awareness messages across instances.
/// </summary>
public class RedisPubSubProvider : IRedisPubSub, IAsyncDisposable
{
    private static readonly System.Diagnostics.Metrics.Meter s_meter = new("SyncKit.PubSub", "1.0");

    private readonly ILogger<RedisPubSubProvider> _logger;
    private readonly SyncKitConfig _config;
    private readonly IConnectionMultiplexer _conn;
    private readonly ISubscriber _sub;
    private readonly JsonSerializerOptions _jsonOptions;

    // Track per-document subscription handlers and which channels we've subscribed to
    private readonly ConcurrentDictionary<string, Func<IMessage, Task>> _handlers = new();
    private readonly ConcurrentDictionary<string, int> _subscriptionRefCount = new();

    // Metrics / counters
    private readonly System.Diagnostics.Metrics.Counter<long> _publishedCounter;
    private readonly System.Diagnostics.Metrics.Counter<long> _receivedCounter;
    private readonly System.Diagnostics.Metrics.Counter<long> _reconnectionCounter;

    // Internal atomic counters exposed for tests
    private long _publishedCount;
    private long _receivedCount;
    private long _reconnectionCount;

    public RedisPubSubProvider(ILogger<RedisPubSubProvider> logger, IOptions<SyncKitConfig> options)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _config = options?.Value ?? throw new ArgumentNullException(nameof(options));

        if (string.IsNullOrEmpty(_config.RedisUrl))
            throw new InvalidOperationException("RedisUrl must be configured to use RedisPubSubProvider");

        // Create connection
        _conn = ConnectionMultiplexer.Connect(_config.RedisUrl);
        _sub = _conn.GetSubscriber();

        InitializeConnectionEvents(_conn);

        _jsonOptions = CreateJsonOptions();

        _publishedCounter = s_meter.CreateCounter<long>("pubsub.messages.published", "messages", "Number of published pub/sub messages");
        _receivedCounter = s_meter.CreateCounter<long>("pubsub.messages.received", "messages", "Number of received pub/sub messages");
        _reconnectionCounter = s_meter.CreateCounter<long>("pubsub.reconnections", "count", "Number of redis reconnections");
    }

    // Testing constructor allows injecting a mock connection multiplexer
    public RedisPubSubProvider(ILogger<RedisPubSubProvider> logger, IOptions<SyncKitConfig> options, IConnectionMultiplexer conn)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _config = options?.Value ?? throw new ArgumentNullException(nameof(options));
        _conn = conn ?? throw new ArgumentNullException(nameof(conn));
        _sub = _conn.GetSubscriber();

        InitializeConnectionEvents(_conn);
        _jsonOptions = CreateJsonOptions();

        _publishedCounter = s_meter.CreateCounter<long>("pubsub.messages.published", "messages", "Number of published pub/sub messages");
        _receivedCounter = s_meter.CreateCounter<long>("pubsub.messages.received", "messages", "Number of received pub/sub messages");
        _reconnectionCounter = s_meter.CreateCounter<long>("pubsub.reconnections", "count", "Number of redis reconnections");
    }

    private void InitializeConnectionEvents(IConnectionMultiplexer conn)
    {
        conn.ConnectionRestored += OnConnectionRestored;
        conn.ConnectionFailed += OnConnectionFailed;
    }

    private JsonSerializerOptions CreateJsonOptions()
    {
        return new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
            Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter(new WebSockets.Protocol.SnakeCaseNamingPolicy()) }
        };
    }

    private readonly ConcurrentDictionary<string, long> _publishedMessageIds = new();

    public async Task PublishDeltaAsync(string documentId, DeltaMessage delta)
    {
        CleanupPublishedIds();
        var channel = GetDeltaChannel(documentId);
        var json = JsonSerializer.Serialize(delta, delta.GetType(), _jsonOptions);
        _publishedMessageIds[delta.Id] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await _sub.PublishAsync(RedisChannel.Literal(channel), json).ConfigureAwait(false);

        // Increment metrics
        Interlocked.Increment(ref _publishedCount);
        _publishedCounter.Add(1);

        _logger.LogTrace("Published delta to channel {Channel} for document {DocumentId}", channel, documentId);
    }

    public async Task PublishAwarenessAsync(string documentId, AwarenessUpdateMessage update)
    {
        var channel = GetAwarenessChannel(documentId);
        var json = JsonSerializer.Serialize(update, update.GetType(), _jsonOptions);
        _publishedMessageIds[update.Id] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await _sub.PublishAsync(RedisChannel.Literal(channel), json).ConfigureAwait(false);

        // Increment metrics
        Interlocked.Increment(ref _publishedCount);
        _publishedCounter.Add(1);

        _logger.LogTrace("Published awareness to channel {Channel} for document {DocumentId}", channel, documentId);
    }

    public async Task SubscribeAsync(string documentId, Func<IMessage, Task> handler)
    {
        if (handler == null) throw new ArgumentNullException(nameof(handler));

        // Register handler
        _handlers[documentId] = handler;
        _subscriptionRefCount.AddOrUpdate(documentId, 1, (_, v) => v + 1);

        // Subscribe to both channels if refcount is 1
        if (_subscriptionRefCount[documentId] == 1)
        {
            await _sub.SubscribeAsync(RedisChannel.Literal(GetDeltaChannel(documentId)), (ch, val) => OnMessageReceived(documentId, val)).ConfigureAwait(false);
            await _sub.SubscribeAsync(RedisChannel.Literal(GetAwarenessChannel(documentId)), (ch, val) => OnMessageReceived(documentId, val)).ConfigureAwait(false);
            _logger.LogInformation("Subscribed to Redis channels for document {DocumentId}", documentId);
        }
    }

    public async Task UnsubscribeAsync(string documentId)
    {
        if (!_subscriptionRefCount.ContainsKey(documentId)) return;

        _subscriptionRefCount.AddOrUpdate(documentId, 0, (_, v) => Math.Max(0, v - 1));
        if (_subscriptionRefCount[documentId] == 0)
        {
            await _sub.UnsubscribeAsync(RedisChannel.Literal(GetDeltaChannel(documentId))).ConfigureAwait(false);
            await _sub.UnsubscribeAsync(RedisChannel.Literal(GetAwarenessChannel(documentId))).ConfigureAwait(false);
            _handlers.TryRemove(documentId, out _);
            _subscriptionRefCount.TryRemove(documentId, out _);
            _logger.LogInformation("Unsubscribed from Redis channels for document {DocumentId}", documentId);
        }
    }

    public Task<bool> IsConnectedAsync()
    {
        return Task.FromResult(_conn.IsConnected);
    }

    private string GetDeltaChannel(string documentId) => $"{_config.RedisChannelPrefix}delta:{documentId}";
    private string GetAwarenessChannel(string documentId) => $"{_config.RedisChannelPrefix}awareness:{documentId}";

    private void OnMessageReceived(string documentId, RedisValue value)
    {
        try
        {
            var json = value.ToString();
            if (string.IsNullOrEmpty(json)) return;

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeElement))
            {
                _logger.LogWarning("Received pubsub message missing 'type' property: {Json}", json);
                return;
            }

            var typeStr = typeElement.GetString();
            if (string.IsNullOrEmpty(typeStr)) return;

            var message = ParseMessage(json, typeStr);
            if (message == null)
            {
                _logger.LogWarning("Failed to parse pubsub message for document {DocumentId}: {Json}", documentId, json);
                return;
            }

            if (_publishedMessageIds.ContainsKey(message.Id))
            {
                // This message was published by this instance - avoid re-broadcasting locally
                _publishedMessageIds.TryRemove(message.Id, out _);
                _logger.LogTrace("Ignoring message {MessageId} for document {DocumentId} because it was published locally", message.Id, documentId);
                return;
            }

            // Increment metrics for a received message
            Interlocked.Increment(ref _receivedCount);
            _receivedCounter.Add(1);

            if (_handlers.TryGetValue(documentId, out var handler))
            {
                // Fire-and-forget handler invocation, log any unobserved exceptions
                _ = handler.Invoke(message).ContinueWith(t => {
                    if (t.IsFaulted)
                    {
                        _logger.LogError(t.Exception, "Handler for document {DocumentId} threw an exception", documentId);
                    }
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling pubsub message");
        }
    }

    private IMessage? ParseMessage(string json, string typeStr)
    {
        // Convert snake_case to MessageType
        // Reuse logic: try parse case-insensitive else convert snake_case to PascalCase
        MessageType? messageType = null;
        if (Enum.TryParse<MessageType>(typeStr, ignoreCase: true, out var direct)) messageType = direct;
        else
        {
            var pascal = ConvertSnakeCaseToPascalCase(typeStr);
            if (Enum.TryParse<MessageType>(pascal, ignoreCase: false, out var conv)) messageType = conv;
        }

        if (messageType == null) return null;

        return messageType switch
        {
            MessageType.Delta => JsonSerializer.Deserialize<DeltaMessage>(json, _jsonOptions),
            MessageType.AwarenessUpdate => JsonSerializer.Deserialize<AwarenessUpdateMessage>(json, _jsonOptions),
            _ => null
        };
    }

    private string ConvertSnakeCaseToPascalCase(string snakeCase)
    {
        if (string.IsNullOrEmpty(snakeCase)) return snakeCase;
        var parts = snakeCase.Split('_');
        var sb = new StringBuilder();
        foreach (var part in parts)
        {
            if (part.Length == 0) continue;
            sb.Append(char.ToUpperInvariant(part[0]));
            if (part.Length > 1) sb.Append(part.Substring(1).ToLowerInvariant());
        }
        return sb.ToString();
    }

    private void OnConnectionRestored(object? sender, ConnectionFailedEventArgs e)
    {
        Interlocked.Increment(ref _reconnectionCount);
        _reconnectionCounter.Add(1);
        _logger.LogInformation("Redis connection restored. Re-subscribing to {Count} documents (reconnection #{Reconnections})", _handlers.Count, Interlocked.Read(ref _reconnectionCount));

        // Re-subscribe to all document channels
        foreach (var docId in _handlers.Keys)
        {
            _ = _sub.SubscribeAsync(RedisChannel.Literal(GetDeltaChannel(docId)), (ch, val) => OnMessageReceived(docId, val));
            _ = _sub.SubscribeAsync(RedisChannel.Literal(GetAwarenessChannel(docId)), (ch, val) => OnMessageReceived(docId, val));
        }
    }

    private void OnConnectionFailed(object? sender, ConnectionFailedEventArgs e)
    {
        _logger.LogWarning(e.Exception, "Redis connection failed: {FailureType}", e.FailureType);
    }

    private void CleanupPublishedIds()
    {
        var cutoff = DateTimeOffset.UtcNow.AddMinutes(-5).ToUnixTimeMilliseconds();
        foreach (var kvp in _publishedMessageIds)
        {
            if (kvp.Value < cutoff)
            {
                _publishedMessageIds.TryRemove(kvp.Key, out _);
            }
        }
    }

    // Expose counters for testing and monitoring
    public long PublishedCount => Interlocked.Read(ref _publishedCount);
    public long ReceivedCount => Interlocked.Read(ref _receivedCount);
    public long ReconnectionCount => Interlocked.Read(ref _reconnectionCount);
    public int SubscriptionCount => _subscriptionRefCount.Count;
    public async ValueTask DisposeAsync()
    {
        try
        {
            _conn.ConnectionRestored -= OnConnectionRestored;
            _conn.ConnectionFailed -= OnConnectionFailed;
            foreach (var docId in _handlers.Keys)
            {
                await _sub.UnsubscribeAsync(RedisChannel.Literal(GetDeltaChannel(docId))).ConfigureAwait(false);
                await _sub.UnsubscribeAsync(RedisChannel.Literal(GetAwarenessChannel(docId))).ConfigureAwait(false);
            }
            await _conn.CloseAsync();
            _conn.Dispose();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error disposing RedisPubSubProvider");
        }
    }
}
