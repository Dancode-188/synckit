using BenchmarkDotNet.Attributes;
using SyncKit.Server.Sync;

namespace SyncKit.Server.Benchmarks;

[MemoryDiagnoser]
public class VectorClockBenchmarks
{
    private VectorClock _smallClock = null!;
    private VectorClock _mediumClock = null!;
    private VectorClock _largeClock = null!;
    private VectorClock _smallClock2 = null!;
    private VectorClock _mediumClock2 = null!;
    private VectorClock _largeClock2 = null!;

    [GlobalSetup]
    public void Setup()
    {
        _smallClock = CreateClock(3);
        _mediumClock = CreateClock(20);
        _largeClock = CreateClock(100);

        _smallClock2 = CreateClock(3, offset: 1);
        _mediumClock2 = CreateClock(20, offset: 1);
        _largeClock2 = CreateClock(100, offset: 1);
    }

    private static VectorClock CreateClock(int size, int offset = 0)
    {
        var entries = new Dictionary<string, long>();
        for (int i = 0; i < size; i++)
        {
            entries[$"client-{i}"] = i + 1 + offset;
        }
        return new VectorClock(entries);
    }

    [Benchmark]
    public VectorClock Increment_SmallClock()
    {
        return _smallClock.Increment("client-0");
    }

    [Benchmark]
    public VectorClock Increment_LargeClock()
    {
        return _largeClock.Increment("client-0");
    }

    [Benchmark]
    public VectorClock Merge_SmallClocks()
    {
        return _smallClock.Merge(_smallClock2);
    }

    [Benchmark]
    public VectorClock Merge_MediumClocks()
    {
        return _mediumClock.Merge(_mediumClock2);
    }

    [Benchmark]
    public VectorClock Merge_LargeClocks()
    {
        return _largeClock.Merge(_largeClock2);
    }

    [Benchmark]
    public bool HappensBefore_SmallClocks()
    {
        return _smallClock.HappensBefore(_smallClock2);
    }

    [Benchmark]
    public bool HappensBefore_LargeClocks()
    {
        return _largeClock.HappensBefore(_largeClock2);
    }

    [Benchmark]
    public bool IsConcurrent_SmallClocks()
    {
        return _smallClock.IsConcurrent(_smallClock2);
    }

    [Benchmark]
    public bool IsConcurrent_LargeClocks()
    {
        return _largeClock.IsConcurrent(_largeClock2);
    }

    [Benchmark]
    public long Get_ExistingEntry()
    {
        return _largeClock.Get("client-50");
    }

    [Benchmark]
    public long Get_MissingEntry()
    {
        return _largeClock.Get("client-nonexistent");
    }

    [Benchmark]
    public Dictionary<string, long> ToDict_LargeClock()
    {
        return _largeClock.ToDict();
    }
}
