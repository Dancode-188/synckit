using System.Text.Json;
using SyncKit.Server.Sync;

namespace SyncKit.Server.Storage;

/// <summary>
/// Convenience adapter helpers for working with `IStorageAdapter`.
/// </summary>
public static class StorageAdapterExtensions
{
    public static async Task<Document> GetOrCreateDocumentAsync(this IStorageAdapter adapter, string documentId)
    {
        // If the adapter can indicate the document exists return a Document wrapper; otherwise create
        var docState = await adapter.GetDocumentAsync(documentId);
        if (docState != null) return new Document(documentId);

        await adapter.SaveDocumentAsync(documentId, JsonDocument.Parse("{}").RootElement);
        return new Document(documentId);
    }

    public static async Task<IReadOnlyList<StoredDelta>> GetDeltasSinceViaAdapterAsync(this IStorageAdapter adapter, string documentId, VectorClock? since)
    {
        // Use adapter's deltas directly and convert to StoredDelta
        var entries = await adapter.GetDeltasAsync(documentId, 0, CancellationToken.None) ?? Array.Empty<SyncKit.Server.Storage.DeltaEntry>().ToList().AsReadOnly();
        var deltas = entries.Select(e => new StoredDelta
        {
            Id = e.Id ?? Guid.NewGuid().ToString(),
            ClientId = e.ClientId,
            Timestamp = e.Timestamp.HasValue ? new DateTimeOffset(e.Timestamp.Value).ToUnixTimeMilliseconds() : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = e.Value ?? JsonDocument.Parse("{}").RootElement,
            VectorClock = e.VectorClock != null ? VectorClock.FromDict(e.VectorClock) : new VectorClock()
        }).ToList().AsReadOnly();

        if (since != null)
        {
            var filtered = deltas.Where(d => !d.VectorClock.HappensBefore(since) && !d.VectorClock.Equals(since)).ToList().AsReadOnly();
            return filtered;
        }

        return deltas;
    }

}
