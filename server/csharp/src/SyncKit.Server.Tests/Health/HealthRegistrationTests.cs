using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using SyncKit.Server.Configuration;
using Xunit;

namespace SyncKit.Server.Tests.Health;

public class HealthRegistrationTests
{
    [Fact]
    public void AddSyncKitHealthChecks_RegistersPostgresAndRedis_WhenConfigured()
    {
        var services = new ServiceCollection();

        // Provide SyncKit config with both DatabaseUrl and RedisUrl
        var config = new SyncKitConfig { DatabaseUrl = "Host=localhost;Database=postgres", RedisUrl = "localhost:6379" };
        services.Configure<SyncKitConfig>(opts =>
        {
            opts.DatabaseUrl = config.DatabaseUrl;
            opts.RedisUrl = config.RedisUrl;
        });

        // Build an IConfiguration containing SyncKit section values and call registration
        var inMemoryConfig = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SyncKit:DatabaseUrl"] = config.DatabaseUrl,
                ["SyncKit:RedisUrl"] = config.RedisUrl
            })
            .Build();

        services.AddSyncKitHealthChecks(inMemoryConfig);

        // Build provider and inspect health check registrations
        var provider = services.BuildServiceProvider();
        var opts = provider.GetRequiredService<IOptions<HealthCheckServiceOptions>>();

        var names = opts.Value.Registrations.Select(r => r.Name).ToList();

        // The readiness and liveness checks are always registered; ensure postgres and redis were registered conditionally
        Assert.Contains("postgresql", names);
        Assert.Contains("redis", names);
    }
}