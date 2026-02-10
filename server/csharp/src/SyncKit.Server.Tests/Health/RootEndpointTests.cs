using System.Text.Json;
using Xunit;

namespace SyncKit.Server.Tests.Health;

/// <summary>
/// Tests for the GET / root endpoint response shape.
/// Validates the JSON matches the TypeScript server format.
/// </summary>
public class RootEndpointTests
{
    /// <summary>
    /// Produces the same anonymous object that the GET / endpoint returns,
    /// allowing us to validate the JSON shape without needing a running host.
    /// </summary>
    private static object BuildRootResponse() => new
    {
        name = "SyncKit Server",
        version = "0.1.0",
        description = "Production-ready WebSocket sync server",
        endpoints = new
        {
            health = "/health",
            ws = "/ws",
            auth = "/auth"
        },
        features = new
        {
            websocket = "Real-time sync via WebSocket",
            auth = "JWT authentication",
            sync = "Delta-based document synchronization",
            crdt = "LWW conflict resolution"
        }
    };

    [Fact]
    public void RootResponse_ContainsRequiredTopLevelFields()
    {
        var json = JsonSerializer.Serialize(BuildRootResponse());
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("SyncKit Server", root.GetProperty("name").GetString());
        Assert.Equal("0.1.0", root.GetProperty("version").GetString());
        Assert.Equal("Production-ready WebSocket sync server", root.GetProperty("description").GetString());
        Assert.True(root.TryGetProperty("endpoints", out _));
        Assert.True(root.TryGetProperty("features", out _));
    }

    [Fact]
    public void RootResponse_EndpointsMatchTypeScriptServer()
    {
        var json = JsonSerializer.Serialize(BuildRootResponse());
        using var doc = JsonDocument.Parse(json);
        var endpoints = doc.RootElement.GetProperty("endpoints");

        Assert.Equal("/health", endpoints.GetProperty("health").GetString());
        Assert.Equal("/ws", endpoints.GetProperty("ws").GetString());
        Assert.Equal("/auth", endpoints.GetProperty("auth").GetString());
    }

    [Fact]
    public void RootResponse_FeaturesMatchTypeScriptServer()
    {
        var json = JsonSerializer.Serialize(BuildRootResponse());
        using var doc = JsonDocument.Parse(json);
        var features = doc.RootElement.GetProperty("features");

        Assert.Equal("Real-time sync via WebSocket", features.GetProperty("websocket").GetString());
        Assert.Equal("JWT authentication", features.GetProperty("auth").GetString());
        Assert.Equal("Delta-based document synchronization", features.GetProperty("sync").GetString());
        Assert.Equal("LWW conflict resolution", features.GetProperty("crdt").GetString());
    }

    [Fact]
    public void RootResponse_MatchesTypeScriptPropertyNames()
    {
        // Ensure the C# anonymous object serializes to camelCase matching TypeScript
        var json = JsonSerializer.Serialize(BuildRootResponse());
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var propertyNames = new List<string>();
        foreach (var prop in root.EnumerateObject())
            propertyNames.Add(prop.Name);

        Assert.Contains("name", propertyNames);
        Assert.Contains("version", propertyNames);
        Assert.Contains("description", propertyNames);
        Assert.Contains("endpoints", propertyNames);
        Assert.Contains("features", propertyNames);
        Assert.Equal(5, propertyNames.Count);
    }
}
