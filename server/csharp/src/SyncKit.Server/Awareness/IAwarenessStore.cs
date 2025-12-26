using System.Collections.Generic;
using System.Threading.Tasks;

namespace SyncKit.Server.Awareness;

public interface IAwarenessStore
{
    Task<AwarenessEntry?> GetAsync(string documentId, string clientId);
    Task<IReadOnlyList<AwarenessEntry>> GetAllAsync(string documentId);
    /// <summary>
    /// Store or update an awareness entry. Returns true if the update was applied,
    /// false if rejected (e.g., stale clock).
    /// </summary>
    Task<bool> SetAsync(string documentId, string clientId, AwarenessState state, long clock);
    Task RemoveAsync(string documentId, string clientId);
    Task RemoveAllForConnectionAsync(string connectionId);
    Task<IReadOnlyList<AwarenessEntry>> GetExpiredAsync();
    Task PruneExpiredAsync();
}
