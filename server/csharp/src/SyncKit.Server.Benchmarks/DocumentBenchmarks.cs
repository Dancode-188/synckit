using System.Text.Json;
using BenchmarkDotNet.Attributes;
using SyncKit.Server.Sync;

namespace SyncKit.Server.Benchmarks;

[MemoryDiagnoser]
public class DocumentBenchmarks
{
    private Document _smallDoc = null!;
    private Document _largeDoc = null!;
    private StoredDelta _newDelta = null!;
    private List<StoredDelta> _oneKDeltas = null!;
    private List<StoredDelta> _tenKDeltas = null!;

    [GlobalSetup]
    public void Setup()
    {
        _smallDoc = CreateDocumentWithDeltas("small-doc", 100);
        _largeDoc = CreateDocumentWithDeltas("large-doc", 1000);

        _newDelta = CreateDelta("new-client", 1, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            "{\"newField\":\"newValue\"}");

        _oneKDeltas = CreateDeltaList(1000);
        _tenKDeltas = CreateDeltaList(10000);
    }

    private static Document CreateDocumentWithDeltas(string docId, int deltaCount)
    {
        var doc = new Document(docId);
        for (int i = 0; i < deltaCount; i++)
        {
            var delta = CreateDelta($"client-{i % 10}", i + 1, 1000000 + i,
                $"{{\"field{i}\":\"value{i}\"}}");
            doc.AddDelta(delta);
        }
        return doc;
    }

    private static List<StoredDelta> CreateDeltaList(int count)
    {
        var deltas = new List<StoredDelta>(count);
        for (int i = 0; i < count; i++)
        {
            deltas.Add(CreateDelta($"client-{i % 10}", i + 1, 1000000 + i,
                $"{{\"field{i}\":\"value{i}\"}}"));
        }
        return deltas;
    }

    private static StoredDelta CreateDelta(string clientId, long clockValue, long timestamp, string jsonData)
    {
        return new StoredDelta
        {
            Id = Guid.NewGuid().ToString(),
            ClientId = clientId,
            Timestamp = timestamp,
            Data = JsonDocument.Parse(jsonData).RootElement,
            VectorClock = new VectorClock(new Dictionary<string, long> { { clientId, clockValue } })
        };
    }

    [Benchmark]
    public void AddDelta_ToSmallDocument()
    {
        _smallDoc.AddDelta(_newDelta);
    }

    [Benchmark]
    public void AddDelta_ToLargeDocument()
    {
        _largeDoc.AddDelta(_newDelta);
    }

    [Benchmark]
    public Dictionary<string, object?> BuildState_SmallDocument()
    {
        return _smallDoc.BuildState();
    }

    [Benchmark]
    public Dictionary<string, object?> BuildState_LargeDocument()
    {
        return _largeDoc.BuildState();
    }

    [Benchmark]
    public Document BuildFromDeltas_1K()
    {
        var doc = new Document("bench-1k");
        foreach (var delta in _oneKDeltas)
        {
            doc.AddDelta(delta);
        }
        return doc;
    }

    [Benchmark]
    public Document BuildFromDeltas_10K()
    {
        var doc = new Document("bench-10k");
        foreach (var delta in _tenKDeltas)
        {
            doc.AddDelta(delta);
        }
        return doc;
    }

    [Benchmark]
    public Document ConstructFromExistingDeltas_1K()
    {
        return new Document("bench-1k", new VectorClock(), _oneKDeltas);
    }

    [Benchmark]
    public Dictionary<string, object?> LwwResolution_1K()
    {
        var doc = new Document("lww-1k", new VectorClock(), _oneKDeltas);
        return doc.BuildState();
    }

    [Benchmark]
    public Dictionary<string, object?> LwwResolution_10K()
    {
        var doc = new Document("lww-10k", new VectorClock(), _tenKDeltas);
        return doc.BuildState();
    }

    [Benchmark]
    public StoredDelta AddDeltaWithIncrementedClock()
    {
        var doc = new Document("bench-incr");
        return doc.AddDeltaWithIncrementedClock("client-1",
            JsonDocument.Parse("{\"field\":\"value\"}").RootElement);
    }

    [Benchmark]
    public IReadOnlyList<StoredDelta> GetDeltasSince_SmallDoc()
    {
        var since = new VectorClock(new Dictionary<string, long> { { "client-0", 5 } });
        return _smallDoc.GetDeltasSince(since);
    }

    [Benchmark]
    public IReadOnlyList<StoredDelta> GetDeltasSince_LargeDoc()
    {
        var since = new VectorClock(new Dictionary<string, long> { { "client-0", 5 } });
        return _largeDoc.GetDeltasSince(since);
    }
}
