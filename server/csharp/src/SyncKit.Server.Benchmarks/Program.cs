using BenchmarkDotNet.Running;
using SyncKit.Server.Benchmarks;

BenchmarkSwitcher.FromAssembly(typeof(JwtBenchmarks).Assembly).Run(args);
