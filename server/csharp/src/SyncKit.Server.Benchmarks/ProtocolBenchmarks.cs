using System.Text;
using System.Text.Json;
using BenchmarkDotNet.Attributes;
using Microsoft.Extensions.Logging.Abstractions;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Benchmarks;

[MemoryDiagnoser]
public class ProtocolBenchmarks
{
    private BinaryProtocolHandler _binaryHandler = null!;
    private JsonProtocolHandler _jsonHandler = null!;
    private DeltaMessage _deltaMessage = null!;
    private SubscribeMessage _subscribeMessage = null!;
    private ReadOnlyMemory<byte> _serializedBinaryDelta;
    private ReadOnlyMemory<byte> _serializedJsonDelta;

    [GlobalSetup]
    public void Setup()
    {
        _binaryHandler = new BinaryProtocolHandler(NullLogger<BinaryProtocolHandler>.Instance);
        _jsonHandler = new JsonProtocolHandler(NullLogger<JsonProtocolHandler>.Instance);

        _deltaMessage = new DeltaMessage
        {
            Id = Guid.NewGuid().ToString(),
            DocumentId = "doc-benchmark-123",
            Delta = JsonDocument.Parse("{\"field1\":\"value1\",\"field2\":42,\"nested\":{\"a\":true}}").RootElement,
            VectorClock = new Dictionary<string, long>
            {
                { "client-1", 5 },
                { "client-2", 3 },
                { "client-3", 1 }
            }
        };

        _subscribeMessage = new SubscribeMessage
        {
            Id = Guid.NewGuid().ToString(),
            DocumentId = "doc-benchmark-123"
        };

        _serializedBinaryDelta = _binaryHandler.Serialize(_deltaMessage);
        _serializedJsonDelta = _jsonHandler.Serialize(_deltaMessage);
    }

    [Benchmark]
    public ReadOnlyMemory<byte> BinarySerialization_Delta()
    {
        return _binaryHandler.Serialize(_deltaMessage);
    }

    [Benchmark]
    public IMessage? BinaryDeserialization_Delta()
    {
        return _binaryHandler.Parse(_serializedBinaryDelta);
    }

    [Benchmark]
    public ReadOnlyMemory<byte> JsonSerialization_Delta()
    {
        return _jsonHandler.Serialize(_deltaMessage);
    }

    [Benchmark]
    public IMessage? JsonDeserialization_Delta()
    {
        return _jsonHandler.Parse(_serializedJsonDelta);
    }

    [Benchmark]
    public ReadOnlyMemory<byte> BinarySerialization_Subscribe()
    {
        return _binaryHandler.Serialize(_subscribeMessage);
    }

    [Benchmark]
    public ReadOnlyMemory<byte> JsonSerialization_Subscribe()
    {
        return _jsonHandler.Serialize(_subscribeMessage);
    }

    [Benchmark]
    public void BinaryRoundTrip_1000Messages()
    {
        for (int i = 0; i < 1000; i++)
        {
            var bytes = _binaryHandler.Serialize(_deltaMessage);
            _binaryHandler.Parse(bytes);
        }
    }

    [Benchmark]
    public void JsonRoundTrip_1000Messages()
    {
        for (int i = 0; i < 1000; i++)
        {
            var bytes = _jsonHandler.Serialize(_deltaMessage);
            _jsonHandler.Parse(bytes);
        }
    }
}
