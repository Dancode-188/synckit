using System.Collections.Concurrent;

namespace SyncKit.Server.Sync;

/// <summary>
/// In-memory document store implementation.
/// Thread-safe, suitable for single-server deployments or development.
/// </summary>
/// <remarks>
/// This is the default implementation. For production multi-server setups,
/// consider using a persistent store with Redis pub/sub for coordination.
/// </remarks>
public class InMemoryDocumentStore : IDocumentStore
{
    private readonly ConcurrentDictionary<string, Document> _documents = new();
    private readonly ILogger<InMemoryDocumentStore> _logger;

    /// <summary>
    /// Create a new in-memory document store.
    /// </summary>
    /// <param name="logger">Logger instance</param>
    public InMemoryDocumentStore(ILogger<InMemoryDocumentStore> logger)
    {
        _logger = logger;
    }

    /// <inheritdoc />
    public Task<Document> GetOrCreateAsync(string documentId)
    {
        var document = _documents.GetOrAdd(documentId, id =>
        {
            _logger.LogDebug("Creating new document: {DocumentId}", id);
            return new Document(id);
        });

        return Task.FromResult(document);
    }

    /// <inheritdoc />
    public Task<Document?> GetAsync(string documentId)
    {
        _documents.TryGetValue(documentId, out var document);
        return Task.FromResult(document);
    }

    /// <inheritdoc />
    public Task<bool> ExistsAsync(string documentId)
    {
        return Task.FromResult(_documents.ContainsKey(documentId));
    }

    /// <inheritdoc />
    public Task DeleteAsync(string documentId)
    {
        if (_documents.TryRemove(documentId, out _))
        {
            _logger.LogDebug("Deleted document: {DocumentId}", documentId);
        }
        else
        {
            _logger.LogDebug("Document not found for deletion: {DocumentId}", documentId);
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<string>> GetDocumentIdsAsync()
    {
        var ids = _documents.Keys.ToList();
        return Task.FromResult<IReadOnlyList<string>>(ids);
    }

    /// <inheritdoc />
    public async Task AddDeltaAsync(string documentId, StoredDelta delta)
    {
        var document = await GetOrCreateAsync(documentId);
        document.AddDelta(delta);

        _logger.LogDebug(
            "Added delta {DeltaId} to document {DocumentId} (client: {ClientId}, vectorClock: {VectorClock})",
            delta.Id,
            documentId,
            delta.ClientId,
            string.Join(", ", delta.VectorClock.Entries.Select(kvp => $"{kvp.Key}:{kvp.Value}")));
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<StoredDelta>> GetDeltasSinceAsync(
        string documentId,
        VectorClock? since)
    {
        var document = await GetAsync(documentId);
        if (document == null)
        {
            _logger.LogDebug(
                "Document {DocumentId} not found, returning empty deltas",
                documentId);
            return Array.Empty<StoredDelta>();
        }

        var deltas = document.GetDeltasSince(since);

        _logger.LogDebug(
            "Retrieved {DeltaCount} deltas for document {DocumentId} since {VectorClock}",
            deltas.Count,
            documentId,
            since != null
                ? string.Join(", ", since.Entries.Select(kvp => $"{kvp.Key}:{kvp.Value}"))
                : "beginning");

        return deltas;
    }

    /// <summary>
    /// Get statistics about the document store.
    /// Useful for monitoring and debugging.
    /// </summary>
    /// <returns>Statistics object</returns>
    public DocumentStoreStats GetStats()
    {
        var totalDeltas = 0;
        var totalSubscribers = 0;

        foreach (var doc in _documents.Values)
        {
            totalDeltas += doc.DeltaCount;
            totalSubscribers += doc.SubscriberCount;
        }

        return new DocumentStoreStats
        {
            DocumentCount = _documents.Count,
            TotalDeltas = totalDeltas,
            TotalSubscribers = totalSubscribers
        };
    }
}

/// <summary>
/// Statistics about the document store.
/// </summary>
public class DocumentStoreStats
{
    /// <summary>
    /// Total number of documents in the store.
    /// </summary>
    public int DocumentCount { get; init; }

    /// <summary>
    /// Total number of deltas across all documents.
    /// </summary>
    public int TotalDeltas { get; init; }

    /// <summary>
    /// Total number of active subscribers across all documents.
    /// </summary>
    public int TotalSubscribers { get; init; }
}
