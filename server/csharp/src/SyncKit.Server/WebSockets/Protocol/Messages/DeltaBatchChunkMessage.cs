using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Chunked transfer of a large delta batch. Used when a delta batch
/// exceeds the maximum message size and must be split across multiple messages.
/// </summary>
public class DeltaBatchChunkMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.DeltaBatchChunk;

    /// <summary>
    /// Unique ID for this chunk set — all chunks in a batch share the same ID.
    /// </summary>
    [JsonPropertyName("chunkId")]
    public required string ChunkId { get; set; }

    /// <summary>
    /// Total number of chunks in this batch.
    /// </summary>
    [JsonPropertyName("totalChunks")]
    public required int TotalChunks { get; set; }

    /// <summary>
    /// Zero-based index of this chunk within the batch.
    /// </summary>
    [JsonPropertyName("chunkIndex")]
    public required int ChunkIndex { get; set; }

    /// <summary>
    /// Base64-encoded chunk data.
    /// </summary>
    [JsonPropertyName("data")]
    public required string Data { get; set; }
}
