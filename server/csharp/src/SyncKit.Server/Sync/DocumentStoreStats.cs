namespace SyncKit.Server.Sync;

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
