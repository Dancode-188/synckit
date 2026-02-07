using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;

namespace SyncKit.Server.Sync.Experiments;

/// <summary>
/// Single-threaded event loop coordinator that processes all document operations
/// through a single global channel.
///
/// This pattern completely eliminates lock contention by serializing all operations
/// through one thread. Similar to Node.js event loop or Redis single-threaded model.
///
/// Key differences from lock-based implementation:
/// - All operations queued to a single global channel
/// - One consumer thread processes all documents
/// - Zero lock contention
/// - May bottleneck under high multi-document load
/// - Best for single-document contention scenarios
/// </summary>
public class SingleThreadedCoordinator : IAsyncDisposable
{
    private const int ChannelCapacity = 4096;

    private readonly Channel<Operation> _eventLoop;
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _processorTask;

    // All state managed by the single processor thread
    private readonly ConcurrentDictionary<string, SingleThreadDocument> _documents = new();

    /// <summary>
    /// Base class for operations
    /// </summary>
    private abstract class Operation
    {
        public abstract void Execute(SingleThreadedCoordinator coordinator);
    }

    /// <summary>
    /// Get or create document operation
    /// </summary>
    private class GetOrCreateDocOp : Operation
    {
        public required string DocumentId { get; init; }
        public required TaskCompletionSource<SingleThreadDocument> Completion { get; init; }

        public override void Execute(SingleThreadedCoordinator coordinator)
        {
            var doc = coordinator._documents.GetOrAdd(DocumentId, id => new SingleThreadDocument(id));
            Completion.TrySetResult(doc);
        }
    }

    /// <summary>
    /// Add delta operation
    /// </summary>
    private class AddDeltaOp : Operation
    {
        public required string DocumentId { get; init; }
        public required StoredDelta Delta { get; init; }
        public TaskCompletionSource<bool>? Completion { get; init; }

        public override void Execute(SingleThreadedCoordinator coordinator)
        {
            var doc = coordinator._documents.GetOrAdd(DocumentId, id => new SingleThreadDocument(id));
            doc.AddDelta(Delta);
            Completion?.TrySetResult(true);
        }
    }

    /// <summary>
    /// Add delta with incremented clock operation
    /// </summary>
    private class AddDeltaWithClockOp : Operation
    {
        public required string DocumentId { get; init; }
        public required string ClientId { get; init; }
        public required JsonElement Data { get; init; }
        public required string? DeltaId { get; init; }
        public required TaskCompletionSource<StoredDelta> Completion { get; init; }

        public override void Execute(SingleThreadedCoordinator coordinator)
        {
            var doc = coordinator._documents.GetOrAdd(DocumentId, id => new SingleThreadDocument(id));
            var stored = doc.AddDeltaWithIncrementedClock(ClientId, Data, DeltaId);
            Completion.TrySetResult(stored);
        }
    }

    /// <summary>
    /// Build state operation
    /// </summary>
    private class BuildStateOp : Operation
    {
        public required string DocumentId { get; init; }
        public required TaskCompletionSource<Dictionary<string, object?>> Completion { get; init; }

        public override void Execute(SingleThreadedCoordinator coordinator)
        {
            if (coordinator._documents.TryGetValue(DocumentId, out var doc))
            {
                Completion.TrySetResult(doc.BuildState());
            }
            else
            {
                Completion.TrySetResult(new Dictionary<string, object?>());
            }
        }
    }

    public SingleThreadedCoordinator()
    {
        _eventLoop = Channel.CreateBounded<Operation>(new BoundedChannelOptions(ChannelCapacity)
        {
            SingleWriter = false,
            SingleReader = true,
            FullMode = BoundedChannelFullMode.Wait
        });

        _processorTask = ProcessEventsAsync(_cts.Token);
    }

    /// <summary>
    /// Get or create a document.
    /// </summary>
    public async ValueTask<SingleThreadDocument> GetOrCreateDocumentAsync(string documentId)
    {
        var tcs = new TaskCompletionSource<SingleThreadDocument>(TaskCreationOptions.RunContinuationsAsynchronously);
        await _eventLoop.Writer.WriteAsync(new GetOrCreateDocOp
        {
            DocumentId = documentId,
            Completion = tcs
        });
        return await tcs.Task;
    }

    /// <summary>
    /// Add a delta to a document.
    /// </summary>
    public async ValueTask AddDeltaAsync(string documentId, StoredDelta delta)
    {
        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        await _eventLoop.Writer.WriteAsync(new AddDeltaOp
        {
            DocumentId = documentId,
            Delta = delta,
            Completion = tcs
        });
        await tcs.Task;
    }

    /// <summary>
    /// Add a delta with incremented clock.
    /// </summary>
    public async ValueTask<StoredDelta> AddDeltaWithIncrementedClockAsync(
        string documentId, string clientId, JsonElement data, string? deltaId = null)
    {
        var tcs = new TaskCompletionSource<StoredDelta>(TaskCreationOptions.RunContinuationsAsynchronously);
        await _eventLoop.Writer.WriteAsync(new AddDeltaWithClockOp
        {
            DocumentId = documentId,
            ClientId = clientId,
            Data = data,
            DeltaId = deltaId,
            Completion = tcs
        });
        return await tcs.Task;
    }

    /// <summary>
    /// Build the state of a document.
    /// </summary>
    public async ValueTask<Dictionary<string, object?>> BuildStateAsync(string documentId)
    {
        var tcs = new TaskCompletionSource<Dictionary<string, object?>>(TaskCreationOptions.RunContinuationsAsynchronously);
        await _eventLoop.Writer.WriteAsync(new BuildStateOp
        {
            DocumentId = documentId,
            Completion = tcs
        });
        return await tcs.Task;
    }

    /// <summary>
    /// The single event loop processor.
    /// </summary>
    private async Task ProcessEventsAsync(CancellationToken ct)
    {
        try
        {
            await foreach (var op in _eventLoop.Reader.ReadAllAsync(ct))
            {
                try
                {
                    op.Execute(this);
                }
                catch (Exception)
                {
                    // Log but continue processing
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
    }

    public async ValueTask DisposeAsync()
    {
        _eventLoop.Writer.Complete();
        await _cts.CancelAsync();
        try
        {
            await _processorTask;
        }
        catch (OperationCanceledException)
        {
            // Expected
        }
        _cts.Dispose();
    }
}

/// <summary>
/// Document implementation for single-threaded coordinator.
/// No locking needed as all access is through the event loop.
/// </summary>
public class SingleThreadDocument
{
    private const int InitialDeltaCapacity = 16;
    private const int InitialFieldCapacity = 8;

    private readonly List<StoredDelta> _deltas;
    private readonly Dictionary<string, FieldEntry> _resolvedFields;
    private readonly ConcurrentDictionary<string, byte> _subscribedConnections = new();
    private VectorClock _vectorClock;
    private long _cachedTimestamp;

    private readonly record struct FieldEntry(object? Value, long Timestamp, long ClockCounter, string ClientId, bool IsTombstone);

    public string Id { get; }
    public VectorClock VectorClock => _vectorClock;
    public long CreatedAt { get; }
    public long UpdatedAt { get; private set; }
    public int SubscriberCount => _subscribedConnections.Count;

    public SingleThreadDocument(string id)
    {
        Id = id;
        _vectorClock = new VectorClock();
        _deltas = new List<StoredDelta>(InitialDeltaCapacity);
        _resolvedFields = new Dictionary<string, FieldEntry>(InitialFieldCapacity);
        _cachedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        CreatedAt = _cachedTimestamp;
        UpdatedAt = _cachedTimestamp;
    }

    public SingleThreadDocument(string id, VectorClock vectorClock, IEnumerable<StoredDelta> deltas)
    {
        Id = id;
        _vectorClock = vectorClock;
        var deltaList = deltas.ToList();
        _deltas = new List<StoredDelta>(Math.Max(deltaList.Count, InitialDeltaCapacity));
        _deltas.AddRange(deltaList);
        _resolvedFields = new Dictionary<string, FieldEntry>(Math.Max(deltaList.Count / 2, InitialFieldCapacity));
        _cachedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        CreatedAt = _cachedTimestamp;
        UpdatedAt = _cachedTimestamp;

        foreach (var delta in _deltas)
        {
            ApplyDeltaToResolvedStateInternal(delta);
        }
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public void AddDelta(StoredDelta delta)
    {
        _deltas.Add(delta);
        _vectorClock = _vectorClock.Merge(delta.VectorClock);
        _cachedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        UpdatedAt = _cachedTimestamp;
        ApplyDeltaToResolvedStateInternal(delta);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public StoredDelta AddDeltaWithIncrementedClock(string clientId, JsonElement data, string? deltaId = null)
    {
        var incrementedClock = _vectorClock.Increment(clientId);
        _cachedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var stored = new StoredDelta
        {
            Id = deltaId ?? Guid.NewGuid().ToString(),
            ClientId = clientId,
            Timestamp = _cachedTimestamp,
            Data = data,
            VectorClock = incrementedClock
        };

        _deltas.Add(stored);
        _vectorClock = incrementedClock;
        UpdatedAt = _cachedTimestamp;
        ApplyDeltaToResolvedStateInternal(stored);

        return stored;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public Dictionary<string, object?> BuildState()
    {
        var state = new Dictionary<string, object?>(_resolvedFields.Count);

        foreach (var kvp in _resolvedFields)
        {
            var entry = kvp.Value;
            if (!entry.IsTombstone)
            {
                state[kvp.Key] = entry.Value;
            }
        }

        return state;
    }

    public void Subscribe(string connectionId) => _subscribedConnections.TryAdd(connectionId, 0);
    public void Unsubscribe(string connectionId) => _subscribedConnections.TryRemove(connectionId, out _);
    public IReadOnlySet<string> GetSubscribers() => _subscribedConnections.Keys.ToHashSet();
    public IReadOnlyList<StoredDelta> GetAllDeltas() => _deltas.ToList();
    public int DeltaCount => _deltas.Count;

    public IReadOnlyList<StoredDelta> GetDeltasSince(VectorClock? since)
    {
        if (since == null) return _deltas.ToList();
        return _deltas.Where(d => !d.VectorClock.HappensBefore(since) && !d.VectorClock.Equals(since)).ToList();
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private void ApplyDeltaToResolvedStateInternal(StoredDelta delta)
    {
        if (delta.Data.ValueKind != JsonValueKind.Object)
            return;

        var deltaTs = delta.Timestamp;
        var clientId = delta.ClientId ?? string.Empty;
        var clockCounter = delta.VectorClock.Get(clientId);

        foreach (var property in delta.Data.EnumerateObject())
        {
            var fieldName = property.Name;
            var isTombstone = IsTombstone(property.Value);
            var value = isTombstone ? null : ConvertJsonElement(property.Value);

            if (_resolvedFields.TryGetValue(fieldName, out var existing))
            {
                var timestampWins = deltaTs > existing.Timestamp;
                var timestampTie = deltaTs == existing.Timestamp;
                var clockWins = clockCounter > existing.ClockCounter;
                var clockTie = clockCounter == existing.ClockCounter;
                var clientIdWins = string.Compare(clientId, existing.ClientId, StringComparison.Ordinal) > 0;

                var thisWins = timestampWins ||
                              (timestampTie && clockWins) ||
                              (timestampTie && clockTie && clientIdWins);

                if (thisWins)
                {
                    _resolvedFields[fieldName] = new FieldEntry(value, deltaTs, clockCounter, clientId, isTombstone);
                }
            }
            else
            {
                _resolvedFields[fieldName] = new FieldEntry(value, deltaTs, clockCounter, clientId, isTombstone);
            }
        }
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static bool IsTombstone(JsonElement element)
    {
        return element.ValueKind == JsonValueKind.Object &&
               element.TryGetProperty("__deleted", out var deletedProp) &&
               deletedProp.ValueKind == JsonValueKind.True;
    }

    private static object? ConvertJsonElement(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number when element.TryGetInt64(out var l) => l,
            JsonValueKind.Number => element.GetDouble(),
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Array => element.EnumerateArray().Select(ConvertJsonElement).ToList(),
            JsonValueKind.Object => element.EnumerateObject().ToDictionary(p => p.Name, p => ConvertJsonElement(p.Value)),
            _ => element.ToString()
        };
    }
}
