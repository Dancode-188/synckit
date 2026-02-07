namespace SyncKit.Server.Sync;

/// <summary>
/// Abstraction for document storage and retrieval.
/// Implementations can be in-memory, PostgreSQL, or other backends.
/// </summary>
public interface IDocumentStore
{
    /// <summary>
    /// Get an existing document or create a new empty one.
    /// </summary>
    /// <param name="documentId">Document identifier</param>
    /// <returns>The document (existing or newly created)</returns>
    Task<Document> GetOrCreateAsync(string documentId);

    /// <summary>
    /// Get an existing document.
    /// </summary>
    /// <param name="documentId">Document identifier</param>
    /// <returns>The document if it exists, null otherwise</returns>
    Task<Document?> GetAsync(string documentId);

    /// <summary>
    /// Check if a document exists.
    /// </summary>
    /// <param name="documentId">Document identifier</param>
    /// <returns>True if the document exists</returns>
    Task<bool> ExistsAsync(string documentId);

    /// <summary>
    /// Delete a document and all its deltas.
    /// </summary>
    /// <param name="documentId">Document identifier</param>
    /// <returns>Task representing the async operation</returns>
    Task DeleteAsync(string documentId);

    /// <summary>
    /// Get all document IDs.
    /// </summary>
    /// <returns>List of all document IDs</returns>
    Task<IReadOnlyList<string>> GetDocumentIdsAsync();

    /// <summary>
    /// Add a delta to a document.
    /// Creates the document if it doesn't exist.
    /// </summary>
    /// <param name="documentId">Document identifier</param>
    /// <param name="delta">Delta to add</param>
    /// <returns>Task representing the async operation</returns>
    Task AddDeltaAsync(string documentId, StoredDelta delta);

    /// <summary>
    /// Get all deltas that occurred after the given vector clock.
    /// </summary>
    /// <param name="documentId">Document identifier</param>
    /// <param name="since">Vector clock representing client's current state (null for all deltas)</param>
    /// <returns>List of deltas the client needs</returns>
    Task<IReadOnlyList<StoredDelta>> GetDeltasSinceAsync(string documentId, VectorClock? since);
}
