using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Tasks.Dataflow;

namespace SyncKit.Server.Sync.Experiments;

/// <summary>
/// Dataflow-based implementation of Document using TPL Dataflow ActionBlock<T>.
///
/// Each document has an ActionBlock with MaxDegreeOfParallelism=1, providing
/// ordered sequential processing with built-in backpressure and batching support.
///
/// Key differences from lock-based implementation:
/// - Uses TPL Dataflow for operation queuing
/// - Built-in bounded capacity for backpressure
/// - Potential for batch processing with BatchBlock
/// - Higher base overhead but better burst handling
/// </summary>
public class DataflowDocument : IAsyncDisposable
{
    private const int InitialDeltaCapacity = 16;
    private const int InitialFieldCapacity = 8;
    private const int BoundedCapacity = 1024;

    // Dataflow block for processing operations
    private readonly ActionBlock<DeltaOperation> _processor;

    // State - only accessed by the processor (single consumer)
    private readonly List<StoredDelta> _deltas;
    private readonly Dictionary<string, FieldEntry> _resolvedFields;
    private readonly ConcurrentDictionary<string, byte> _subscribedConnections = new();
    private VectorClock _vectorClock;
    private long _cachedTimestamp;
    private long _updatedAt;

    private readonly record struct FieldEntry(object? Value, long Timestamp, long ClockCounter, string ClientId, bool IsTombstone);

    /// <summary>
    /// Operation message for the dataflow block.
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
    /// Create a new dataflow document.
    /// </summary>
    public DataflowDocument(string id)
    {
        Id = id;
        _vectorClock = new VectorClock();
        _deltas = new List<StoredDelta>(InitialDeltaCapacity);
        _resolvedFields = new Dictionary<string, FieldEntry>(InitialFieldCapacity);
        _cachedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        CreatedAt = _cachedTimestamp;
        _updatedAt = _cachedTimestamp;

        // Create ActionBlock with bounded capacity and single-threaded processing
        _processor = new ActionBlock<DeltaOperation>(
            ProcessOperation,
            new ExecutionDataflowBlockOptions
            {
                MaxDegreeOfParallelism = 1, // Sequential processing
                BoundedCapacity = BoundedCapacity,
                EnsureOrdered = true
            }
        );
    }

    /// <summary>
    /// Create a dataflow document from existing state.
    /// </summary>
    public DataflowDocument(string id, VectorClock vectorClock, IEnumerable<StoredDelta> deltas)
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

        // Rebuild resolved state (single-threaded construction)
        foreach (var delta in _deltas)
        {
            ApplyDeltaToResolvedStateInternal(delta);
        }

        // Create ActionBlock
        _processor = new ActionBlock<DeltaOperation>(
            ProcessOperation,
            new ExecutionDataflowBlockOptions
            {
                MaxDegreeOfParallelism = 1,
                BoundedCapacity = BoundedCapacity,
                EnsureOrdered = true
            }
        );
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

        var accepted = await _processor.SendAsync(op);
        if (!accepted)
        {
            throw new InvalidOperationException("Document processor is completed");
        }
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

        var accepted = await _processor.SendAsync(op);
        if (!accepted)
        {
            throw new InvalidOperationException("Document processor is completed");
        }

        var result = await tcs.Task;
        return result!;
    }

    /// <summary>
    /// Process a single operation. Called by the ActionBlock.
    /// </summary>
    private void ProcessOperation(DeltaOperation op)
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

    /// <summary>
    /// Build the current document state.
    /// </summary>
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
        if (since == null)
        {
            return _deltas.ToList();
        }

        return _deltas
            .Where(d => !d.VectorClock.HappensBefore(since) && !d.VectorClock.Equals(since))
            .ToList();
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
        _processor.Complete();
        await _processor.Completion;
    }
}
