using System;
using System.Threading.Tasks;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using StackExchange.Redis;
using Xunit;

namespace SyncKit.Server.Tests.Health;

[Trait("Category","Integration")]
public class RedisHealthCheckTests : IAsyncLifetime
{
    private readonly TestcontainersContainer _redisContainer;
    private bool _dockerUnavailable = false;

    public RedisHealthCheckTests()
    {
        _redisContainer = new TestcontainersBuilder<TestcontainersContainer>()
            .WithImage("redis:7-alpine")
            .WithCleanUp(true)
            .WithName("synckit-test-redis-health")
            .WithPortBinding(6379, true)
            .Build();
    }

    public async Task InitializeAsync()
    {
        try
        {
            await _redisContainer.StartAsync();
        }
        catch (Exception ex)
        {
            _dockerUnavailable = true;
            Console.WriteLine($"Skipping Redis health tests - docker not available: {ex.Message}");
        }
    }

    public async Task DisposeAsync()
    {
        if (_dockerUnavailable) return;

        try
        {
            await _redisContainer.StopAsync();
            await _redisContainer.DisposeAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error disposing Redis container: {ex.Message}");
        }
    }

    [Fact]
    public async Task RedisHealthCheck_ReturnsHealthy_WhenRedisAvailable()
    {
        if (_dockerUnavailable) return;

        var host = _redisContainer.Hostname;
        var port = _redisContainer.GetMappedPublicPort(6379);
        var endpoint = $"{host}:{port}";

        var conn = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions { EndPoints = { endpoint }, AbortOnConnectFail = false, ConnectRetry = 3 });

        var check = new SyncKit.Server.Health.RedisHealthCheck(conn);

        var res = await check.CheckHealthAsync(new HealthCheckContext());

        Assert.Equal(HealthStatus.Healthy, res.Status);
        Assert.Contains("latency", res.Description?.ToLowerInvariant());

        await conn.CloseAsync();
        conn.Dispose();
    }

    [Fact]
    public async Task RedisHealthCheck_ReturnsUnhealthy_WhenConnectionFails()
    {
        var check = new SyncKit.Server.Health.RedisHealthCheck("doesnotexist:6379");
        var res = await check.CheckHealthAsync(new HealthCheckContext());
        Assert.Equal(HealthStatus.Unhealthy, res.Status);
    }
}
