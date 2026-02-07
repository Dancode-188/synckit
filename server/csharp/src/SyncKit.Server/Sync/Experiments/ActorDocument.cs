using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;

namespace SyncKit.Server.Sync.Experiments;

/// <summary>
/// Actor-model implementation of Document using Channel<T> for message passing.
///
/// Each document acts as an actor with a single consumer processing operations
/// sequentially. This eliminates lock contention by replacing shared-state
/// synchronization with message queues.
///
/// Key differences from lock-based implementation:
/// - Operations are queued instead of blocking
/// - Single consumer thread processes operations in order
/// - No lock contention, predictable latency
/// - Slightly higher base latency due to async overhead
/// </summary>
public class ActorDocument : IAsyncDisposable
{
    private const int InitialDeltaCapacity = 16;
    private const int InitialFieldCapacity = 8;
    private const int ChannelCapacity = 1024;

    // Channel for operation messages
    private readonly Channel<DeltaOperation> _opChannel;
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _processorTask;

    // State - only accessed by the processor task (no locking needed)
    private readonly List<StoredDelta> _deltas;
    private readonly Dictionary<string, FieldEntry> _resolvedFields;
    private readonly ConcurrentDictionary<string, byte> _subscribedConnections = new();
    private VectorClock _vectorClock;
    private long _cachedTimestamp;
    private long _updatedAt;

    private readonly record struct FieldEntry(object? Value, long Timestamp, long ClockCounter, string ClientId, bool IsTombstone);

    /// <summary>
    /// Operation message for the actor channel.
    /// </summary>
    private class DeltaOperation
    {
        public required StoredDelta? Delta { get; init; }
        public required string? ClientId { get; init; }
        public required JsonElement? Data { get; init; }
        public required string? DeltaId { get; init; }
        public TaskCompletionSource<StoredDelta?>? Completion { get; init; }
        public bool IsIncrementedClock { get; init; }
    }

    public string Id { get; }
    public VectorClock VectorClock => _vectorClock;
    public long CreatedAt { get; }
    public long UpdatedAt => _updatedAt;
    public int SubscriberCount => _subscribedConnections.Count;

    /// <summary>
    /// Create a new actor document.
    /// </summary>
    public ActorDocument(string id)
    {
        Id = id;
        _vectorClock = new VectorClock();
        _deltas = new List<StoredDelta>(InitialDeltaCapacity);
        _resolvedFields = new Dictionary<string, FieldEntry>(InitialFieldCapacity);
        _cachedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        CreatedAt = _cachedTimestamp;
        _updatedAt = _cachedTimestamp;

        // Create bounded channel for backpressure
        _opChannel = Channel.CreateBounded<DeltaOperation>(new BoundedChannelOptions(ChannelCapacity)
        {
            SingleWriter = false,
            SingleReader = true,
            FullMode = BoundedChannelFullMode.Wait
        });

        // Start the processor task
        _processorTask = ProcessOperationsAsync(_cts.Token);
    }

    /// <summary>
    /// Create an actor document from existing state.
    /// </summary>
    public ActorDocument(string id, VectorClock vectorClock, IEnumerable<StoredDelta> deltas)
    {
        Id = id;
        _vectorClock = vectorClock;
        var deltaList = deltas.ToList();
        _deltas = new List<StoredDelta>(Math.Max(deltaList.Count, InitialDeltaCapacity));
        _deltas.AddRange(deltaList);
        _resolvedFields = new Dictionary<string, FieldEntry>(Math.Max(deltaList.Count / 2, InitialFieldCapacity));
        _cachedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        CreatedAt = _cachedTimestamp;
        _updatedAt = _cachedTimestamp;

        // Rebuild resolved state (no channel needed yet, single-threaded construction)
        foreach (var delta in _deltas)
        {
            ApplyDeltaToResolvedStateInternal(delta);
        }

        // Create channel and start processor
        _opChannel = Channel.CreateBounded<DeltaOperation>(new BoundedChannelOptions(ChannelCapacity)
        {
            SingleWriter = false,
            SingleReader = true,
            FullMode = BoundedChannelFullMode.Wait
        });
        _processorTask = ProcessOperationsAsync(_cts.Token);
    }

    /// <summary>
    /// Add a delta to the document asynchronously.
    /// </summary>
    public async ValueTask AddDeltaAsync(StoredDelta delta)
    {
        var op = new DeltaOperation
        {
            Delta = delta,
            ClientId = null,
            Data = null,
            DeltaId = null,
            IsIncrementedClock = false
        };

        await _opChannel.Writer.WriteAsync(op);
    }

    /// <summary>
    /// Atomically increment the vector clock and add a delta.
    /// Returns the stored delta with the assigned vector clock.
    /// </summary>
    public async ValueTask<StoredDelta> AddDeltaWithIncrementedClockAsync(string clientId, JsonElement data, string? deltaId = null)
    {
        var tcs = new TaskCompletionSource<StoredDelta?>(TaskCreationOptions.RunContinuationsAsynchronously);

        var op = new DeltaOperation
        {
            Delta = null,
            ClientId = clientId,
            Data = data,
            DeltaId = deltaId,
            Completion = tcs,
            IsIncrementedClock = true
        };

        await _opChannel.Writer.WriteAsync(op);
        var result = await tcs.Task;
        return result!;
    }

    /// <summary>
    /// Build the current document state.
    /// Note: This reads from the resolved fields which may be slightly behind
    /// if there are queued operations. For strict consistency, consider
    /// adding a read operation to the channel.
    /// </summary>
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public Dictionary<string, object?> BuildState()
    {
        // For actor model, we could queue a read operation to ensure
        // we see all queued writes. For now, we read the current state
        // which is eventually consistent.
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
        if (since == null)
        {
            return _deltas.ToList();
        }

        return _deltas
            .Where(d => !d.VectorClock.HappensBefore(since) && !d.VectorClock.Equals(since))
            .ToList();
    }

    /// <summary>
    /// The processor loop that handles all operations sequentially.
    /// </summary>
    private async Task ProcessOperationsAsync(CancellationToken ct)
    {
        try
        {
            await foreach (var op in _opChannel.Reader.ReadAllAsync(ct))
            {
                try
                {
                    if (op.IsIncrementedClock && op.ClientId != null && op.Data.HasValue)
                    {
                        // Atomically increment and create delta
                        var incrementedClock = _vectorClock.Increment(op.ClientId);
                        _cachedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                        var stored = new StoredDelta
                        {
                            Id = op.DeltaId ?? Guid.NewGuid().ToString(),
                            ClientId = op.ClientId,
                            Timestamp = _cachedTimestamp,
                            Data = op.Data.Value,
                            VectorClock = incrementedClock
                        };

                        _deltas.Add(stored);
                        _vectorClock = incrementedClock;
                        _updatedAt = _cachedTimestamp;
                        ApplyDeltaToResolvedStateInternal(stored);

                        op.Completion?.TrySetResult(stored);
                    }
                    else if (op.Delta != null)
                    {
                        // Simple delta add
                        _deltas.Add(op.Delta);
                        _vectorClock = _vectorClock.Merge(op.Delta.VectorClock);
                        _cachedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        _updatedAt = _cachedTimestamp;
                        ApplyDeltaToResolvedStateInternal(op.Delta);
                    }
                }
                catch (Exception ex)
                {
                    op.Completion?.TrySetException(ex);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
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

    public async ValueTask DisposeAsync()
    {
        _opChannel.Writer.Complete();
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
