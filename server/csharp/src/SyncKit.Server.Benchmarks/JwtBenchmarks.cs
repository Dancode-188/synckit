using System.Text.Json;
using BenchmarkDotNet.Attributes;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Benchmarks;

[MemoryDiagnoser]
public class JwtBenchmarks
{
    private JwtGenerator _generator = null!;
    private JwtValidator _validator = null!;
    private string _preGeneratedToken = null!;
    private DocumentPermissions _permissions = null!;

    [GlobalSetup]
    public void Setup()
    {
        var config = Options.Create(new SyncKitConfig
        {
            JwtSecret = "benchmark-secret-key-that-is-at-least-32-bytes-long",
            JwtIssuer = "synckit-benchmark",
            JwtAudience = "synckit-benchmark",
            JwtExpiresIn = "60m"
        });

        _generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        _validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);
        _permissions = new DocumentPermissions
        {
            CanRead = ["doc-1", "doc-2", "doc-3"],
            CanWrite = ["doc-1"],
            IsAdmin = false
        };

        _preGeneratedToken = _generator.GenerateAccessToken("user-bench", "bench@test.com", _permissions);
    }

    [Benchmark]
    public string JwtGeneration_SingleToken()
    {
        return _generator.GenerateAccessToken("user-bench", "bench@test.com", _permissions);
    }

    [Benchmark]
    public void JwtGeneration_1000Tokens()
    {
        for (int i = 0; i < 1000; i++)
        {
            _generator.GenerateAccessToken($"user-{i}", $"user{i}@test.com", _permissions);
        }
    }

    [Benchmark]
    public TokenPayload? JwtVerification_SingleToken()
    {
        return _validator.Validate(_preGeneratedToken);
    }

    [Benchmark]
    public void JwtVerification_1000Tokens()
    {
        for (int i = 0; i < 1000; i++)
        {
            _validator.Validate(_preGeneratedToken);
        }
    }

    [Benchmark]
    public (string, string) JwtTokenPairGeneration()
    {
        return _generator.GenerateTokenPair("user-bench", "bench@test.com", _permissions);
    }
}
