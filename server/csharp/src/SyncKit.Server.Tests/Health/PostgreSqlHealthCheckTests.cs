using System;
using System.Threading.Tasks;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Xunit;

namespace SyncKit.Server.Tests.Health;

[Trait("Category","Integration")]
public class PostgreSqlHealthCheckTests : IAsyncLifetime
{
    private readonly TestcontainersContainer _postgresContainer;
    private bool _dockerUnavailable = false;

    public PostgreSqlHealthCheckTests()
    {
        _postgresContainer = new TestcontainersBuilder<TestcontainersContainer>()
            .WithImage("postgres:15")
            .WithCleanUp(true)
            .WithName("synckit-test-postgres")
            .WithEnvironment("POSTGRES_USER", "synckit")
            .WithEnvironment("POSTGRES_PASSWORD", "synckit_test")
            .WithEnvironment("POSTGRES_DB", "synckit_test")
            .WithPortBinding(54320, 5432)
            .Build();
    }

    public async Task InitializeAsync()
    {
        try
        {
            await _postgresContainer.StartAsync();
        }
        catch (Exception ex)
        {
            _dockerUnavailable = true;
            Console.WriteLine($"Skipping Postgres health tests - docker not available: {ex.Message}");
        }
    }

    public async Task DisposeAsync()
    {
        if (_dockerUnavailable) return;

        try
        {
            await _postgresContainer.StopAsync();
            await _postgresContainer.DisposeAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error disposing Postgres container: {ex.Message}");
        }
    }

    [Fact]
    public async Task PostgresHealthCheck_ReturnsHealthy_WhenPostgresAvailable()
    {
        if (_dockerUnavailable) return;

        var host = _postgresContainer.Hostname;
        var port = _postgresContainer.GetMappedPublicPort(5432);
        var connStr = $"Host={host};Port={port};Username=synckit;Password=synckit_test;Database=synckit_test";

        var check = new SyncKit.Server.Health.PostgreSqlHealthCheck(connStr);

        var res = await check.CheckHealthAsync(new HealthCheckContext());

        Assert.Equal(HealthStatus.Healthy, res.Status);
    }

    [Fact]
    public async Task PostgresHealthCheck_ReturnsUnhealthy_WhenConnectionFails()
    {
        var check = new SyncKit.Server.Health.PostgreSqlHealthCheck("Host=doesnotexist;Port=5432;Username=x;Password=x;Database=x");
        var res = await check.CheckHealthAsync(new HealthCheckContext());
        Assert.Equal(HealthStatus.Unhealthy, res.Status);
    }
}
