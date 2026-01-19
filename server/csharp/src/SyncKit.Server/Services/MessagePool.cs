using System.Collections.Concurrent;
using Microsoft.Extensions.ObjectPool;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Services;

/// <summary>
/// Provides object pooling for frequently-allocated message objects.
/// Reduces GC pressure during high-throughput scenarios by reusing objects.
/// </summary>
public class MessagePool : IDisposable
{
    private readonly ILogger<MessagePool> _logger;
    private bool _disposed;

    // Pools for message types that are frequently created
    private readonly ObjectPool<AckMessage> _ackMessagePool;
    private readonly ObjectPool<ErrorMessage> _errorMessagePool;
    private readonly ObjectPool<PongMessage> _pongMessagePool;

    // Pool for Dictionary<string, long> used in vector clocks
    private readonly ObjectPool<Dictionary<string, long>> _vectorClockPool;

    // Pool for Dictionary<string, object?> used in delta data
    private readonly ObjectPool<Dictionary<string, object?>> _deltaDictionaryPool;

    // Statistics for monitoring
    private long _ackMessagesRented;
    private long _ackMessagesReturned;
    private long _errorMessagesRented;
    private long _errorMessagesReturned;
    private long _pongMessagesRented;
    private long _pongMessagesReturned;
    private long _vectorClocksRented;
    private long _vectorClocksReturned;
    private long _deltaDictionariesRented;
    private long _deltaDictionariesReturned;

    public MessagePool(ILogger<MessagePool> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));

        // Create policies for each message type
        var ackPolicy = new PooledAckMessagePolicy();
        var errorPolicy = new PooledErrorMessagePolicy();
        var pongPolicy = new PooledPongMessagePolicy();
        var vectorClockPolicy = new PooledVectorClockPolicy();
        var deltaDictionaryPolicy = new PooledDeltaDictionaryPolicy();

        // Create pools with default max size (Environment.ProcessorCount * 2)
        _ackMessagePool = new DefaultObjectPool<AckMessage>(ackPolicy);
        _errorMessagePool = new DefaultObjectPool<ErrorMessage>(errorPolicy);
        _pongMessagePool = new DefaultObjectPool<PongMessage>(pongPolicy);
        _vectorClockPool = new DefaultObjectPool<Dictionary<string, long>>(vectorClockPolicy);
        _deltaDictionaryPool = new DefaultObjectPool<Dictionary<string, object?>>(deltaDictionaryPolicy);

        _logger.LogInformation("Message pool initialized");
    }

    #region AckMessage Pool

    /// <summary>
    /// Rents an AckMessage from the pool.
    /// The message should be returned after use via ReturnAckMessage.
    /// </summary>
    /// <param name="messageId">The ID of the message being acknowledged.</param>
    /// <returns>A pooled or new AckMessage instance.</returns>
    public AckMessage RentAckMessage(string messageId)
    {
        if (_disposed) throw new ObjectDisposedException(nameof(MessagePool));

        Interlocked.Increment(ref _ackMessagesRented);

        var message = _ackMessagePool.Get();
        message.Id = Guid.NewGuid().ToString();
        message.Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        message.MessageId = messageId;

        return message;
    }

    /// <summary>
    /// Returns an AckMessage to the pool for reuse.
    /// </summary>
    public void ReturnAckMessage(AckMessage message)
    {
        if (_disposed || message == null) return;

        Interlocked.Increment(ref _ackMessagesReturned);
        _ackMessagePool.Return(message);
    }

    #endregion

    #region ErrorMessage Pool

    /// <summary>
    /// Rents an ErrorMessage from the pool.
    /// The message should be returned after use via ReturnErrorMessage.
    /// </summary>
    /// <param name="error">The error description.</param>
    /// <returns>A pooled or new ErrorMessage instance.</returns>
    public ErrorMessage RentErrorMessage(string error)
    {
        if (_disposed) throw new ObjectDisposedException(nameof(MessagePool));

        Interlocked.Increment(ref _errorMessagesRented);

        var message = _errorMessagePool.Get();
        message.Id = Guid.NewGuid().ToString();
        message.Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        message.Error = error;
        message.Details = null;

        return message;
    }

    /// <summary>
    /// Returns an ErrorMessage to the pool for reuse.
    /// </summary>
    public void ReturnErrorMessage(ErrorMessage message)
    {
        if (_disposed || message == null) return;

        Interlocked.Increment(ref _errorMessagesReturned);
        _errorMessagePool.Return(message);
    }

    #endregion

    #region PongMessage Pool

    /// <summary>
    /// Rents a PongMessage from the pool.
    /// The message should be returned after use via ReturnPongMessage.
    /// </summary>
    /// <returns>A pooled or new PongMessage instance.</returns>
    public PongMessage RentPongMessage()
    {
        if (_disposed) throw new ObjectDisposedException(nameof(MessagePool));

        Interlocked.Increment(ref _pongMessagesRented);

        var message = _pongMessagePool.Get();
        message.Id = Guid.NewGuid().ToString();
        message.Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        return message;
    }

    /// <summary>
    /// Returns a PongMessage to the pool for reuse.
    /// </summary>
    public void ReturnPongMessage(PongMessage message)
    {
        if (_disposed || message == null) return;

        Interlocked.Increment(ref _pongMessagesReturned);
        _pongMessagePool.Return(message);
    }

    #endregion

    #region VectorClock Dictionary Pool

    /// <summary>
    /// Rents a Dictionary for vector clock data from the pool.
    /// The dictionary should be returned after use via ReturnVectorClock.
    /// </summary>
    /// <returns>A pooled or new Dictionary instance.</returns>
    public Dictionary<string, long> RentVectorClock()
    {
        if (_disposed) throw new ObjectDisposedException(nameof(MessagePool));

        Interlocked.Increment(ref _vectorClocksRented);
        return _vectorClockPool.Get();
    }

    /// <summary>
    /// Rents a Dictionary for vector clock data, initialized with existing data.
    /// </summary>
    /// <param name="source">Source dictionary to copy from.</param>
    /// <returns>A pooled dictionary with copied data.</returns>
    public Dictionary<string, long> RentVectorClock(IDictionary<string, long> source)
    {
        var dict = RentVectorClock();
        foreach (var kvp in source)
        {
            dict[kvp.Key] = kvp.Value;
        }
        return dict;
    }

    /// <summary>
    /// Returns a vector clock Dictionary to the pool for reuse.
    /// </summary>
    public void ReturnVectorClock(Dictionary<string, long>? dictionary)
    {
        if (_disposed || dictionary == null) return;

        Interlocked.Increment(ref _vectorClocksReturned);
        dictionary.Clear();
        _vectorClockPool.Return(dictionary);
    }

    #endregion

    #region Delta Dictionary Pool

    /// <summary>
    /// Rents a Dictionary for delta data from the pool.
    /// The dictionary should be returned after use via ReturnDeltaDictionary.
    /// </summary>
    /// <returns>A pooled or new Dictionary instance.</returns>
    public Dictionary<string, object?> RentDeltaDictionary()
    {
        if (_disposed) throw new ObjectDisposedException(nameof(MessagePool));

        Interlocked.Increment(ref _deltaDictionariesRented);
        return _deltaDictionaryPool.Get();
    }

    /// <summary>
    /// Returns a delta Dictionary to the pool for reuse.
    /// </summary>
    public void ReturnDeltaDictionary(Dictionary<string, object?>? dictionary)
    {
        if (_disposed || dictionary == null) return;

        Interlocked.Increment(ref _deltaDictionariesReturned);
        dictionary.Clear();
        _deltaDictionaryPool.Return(dictionary);
    }

    #endregion

    #region Statistics

    /// <summary>
    /// Gets current pool statistics.
    /// </summary>
    public PoolStatistics GetStatistics()
    {
        return new PoolStatistics
        {
            AckMessagesRented = Interlocked.Read(ref _ackMessagesRented),
            AckMessagesReturned = Interlocked.Read(ref _ackMessagesReturned),
            ErrorMessagesRented = Interlocked.Read(ref _errorMessagesRented),
            ErrorMessagesReturned = Interlocked.Read(ref _errorMessagesReturned),
            PongMessagesRented = Interlocked.Read(ref _pongMessagesRented),
            PongMessagesReturned = Interlocked.Read(ref _pongMessagesReturned),
            VectorClocksRented = Interlocked.Read(ref _vectorClocksRented),
            VectorClocksReturned = Interlocked.Read(ref _vectorClocksReturned),
            DeltaDictionariesRented = Interlocked.Read(ref _deltaDictionariesRented),
            DeltaDictionariesReturned = Interlocked.Read(ref _deltaDictionariesReturned)
        };
    }

    /// <summary>
    /// Pool usage statistics.
    /// </summary>
    public record PoolStatistics
    {
        public long AckMessagesRented { get; init; }
        public long AckMessagesReturned { get; init; }
        public long ErrorMessagesRented { get; init; }
        public long ErrorMessagesReturned { get; init; }
        public long PongMessagesRented { get; init; }
        public long PongMessagesReturned { get; init; }
        public long VectorClocksRented { get; init; }
        public long VectorClocksReturned { get; init; }
        public long DeltaDictionariesRented { get; init; }
        public long DeltaDictionariesReturned { get; init; }

        /// <summary>
        /// Total objects currently rented (not returned).
        /// </summary>
        public long TotalActive =>
            (AckMessagesRented - AckMessagesReturned) +
            (ErrorMessagesRented - ErrorMessagesReturned) +
            (PongMessagesRented - PongMessagesReturned) +
            (VectorClocksRented - VectorClocksReturned) +
            (DeltaDictionariesRented - DeltaDictionariesReturned);
    }

    #endregion

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        var stats = GetStatistics();
        _logger.LogInformation(
            "Message pool disposed. Stats: ACKs={AckRented}/{AckReturned}, " +
            "Errors={ErrorRented}/{ErrorReturned}, Pongs={PongRented}/{PongReturned}, " +
            "VectorClocks={VcRented}/{VcReturned}, Deltas={DeltaRented}/{DeltaReturned}",
            stats.AckMessagesRented, stats.AckMessagesReturned,
            stats.ErrorMessagesRented, stats.ErrorMessagesReturned,
            stats.PongMessagesRented, stats.PongMessagesReturned,
            stats.VectorClocksRented, stats.VectorClocksReturned,
            stats.DeltaDictionariesRented, stats.DeltaDictionariesReturned);
    }

    #region Pool Policies

    /// <summary>
    /// Pool policy for AckMessage objects.
    /// </summary>
    private class PooledAckMessagePolicy : IPooledObjectPolicy<AckMessage>
    {
        public AckMessage Create() => new() { MessageId = string.Empty };

        public bool Return(AckMessage obj)
        {
            // Reset for reuse
            obj.Id = string.Empty;
            obj.Timestamp = 0;
            obj.MessageId = string.Empty;
            return true;
        }
    }

    /// <summary>
    /// Pool policy for ErrorMessage objects.
    /// </summary>
    private class PooledErrorMessagePolicy : IPooledObjectPolicy<ErrorMessage>
    {
        public ErrorMessage Create() => new() { Error = string.Empty };

        public bool Return(ErrorMessage obj)
        {
            // Reset for reuse
            obj.Id = string.Empty;
            obj.Timestamp = 0;
            obj.Error = string.Empty;
            obj.Details = null;
            return true;
        }
    }

    /// <summary>
    /// Pool policy for PongMessage objects.
    /// </summary>
    private class PooledPongMessagePolicy : IPooledObjectPolicy<PongMessage>
    {
        public PongMessage Create() => new();

        public bool Return(PongMessage obj)
        {
            // Reset for reuse
            obj.Id = string.Empty;
            obj.Timestamp = 0;
            return true;
        }
    }

    /// <summary>
    /// Pool policy for vector clock dictionaries.
    /// </summary>
    private class PooledVectorClockPolicy : IPooledObjectPolicy<Dictionary<string, long>>
    {
        public Dictionary<string, long> Create() => new(StringComparer.Ordinal);

        public bool Return(Dictionary<string, long> obj)
        {
            // Clear for reuse (capacity is preserved)
            obj.Clear();
            return true;
        }
    }

    /// <summary>
    /// Pool policy for delta data dictionaries.
    /// </summary>
    private class PooledDeltaDictionaryPolicy : IPooledObjectPolicy<Dictionary<string, object?>>
    {
        public Dictionary<string, object?> Create() => new(StringComparer.Ordinal);

        public bool Return(Dictionary<string, object?> obj)
        {
            // Clear for reuse (capacity is preserved)
            obj.Clear();
            return true;
        }
    }

    #endregion
}
