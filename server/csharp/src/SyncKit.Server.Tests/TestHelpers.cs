using System.Text.Json;

namespace SyncKit.Server.Tests;

/// <summary>
/// Helper methods for unit tests.
/// </summary>
public static class TestHelpers
{
    /// <summary>
    /// Converts an object to a JsonElement for use in protocol messages.
    /// </summary>
    public static JsonElement ToJsonElement(object obj)
    {
        var json = JsonSerializer.Serialize(obj);
        return JsonDocument.Parse(json).RootElement;
    }

    /// <summary>
    /// Converts an object to a nullable JsonElement for use in protocol messages.
    /// </summary>
    public static JsonElement? ToNullableJsonElement(object? obj)
    {
        if (obj == null) return null;
        return ToJsonElement(obj);
    }

    /// <summary>
    /// Converts a generic object to a Dictionary for assertions.
    /// Useful when testing protocol messages that use object for flexibility.
    /// </summary>
    public static Dictionary<string, object>? AsDictionary(object? obj)
    {
        if (obj == null) return null;

        // If it's already a dictionary, return it
        if (obj is Dictionary<string, object> dict)
            return dict;

        // Otherwise, serialize and deserialize to get a dictionary
        var json = JsonSerializer.Serialize(obj);
        return JsonSerializer.Deserialize<Dictionary<string, object>>(json);
    }

    /// <summary>
    /// Gets a value from a JsonElement by property name.
    /// </summary>
    public static JsonElement? GetProperty(JsonElement? element, string propertyName)
    {
        if (element == null || !element.HasValue)
            return null;

        if (element.Value.TryGetProperty(propertyName, out var property))
            return property;

        return null;
    }
}
