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
        if (obj == null)
            return null;
        return ToJsonElement(obj);
    }

    /// <summary>
    /// Gets a boolean property from a JsonElement.
    /// </summary>
    public static bool GetBool(JsonElement element, string propertyName)
    {
        return element.GetProperty(propertyName).GetBoolean();
    }

    /// <summary>
    /// Gets a string array property from a JsonElement.
    /// </summary>
    public static string[] GetStringArray(JsonElement element, string propertyName)
    {
        var prop = element.GetProperty(propertyName);
        return prop.EnumerateArray().Select(e => e.GetString()!).ToArray();
    }

    /// <summary>
    /// Checks if a JsonElement has a property.
    /// </summary>
    public static bool HasProperty(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out _);
    }

    /// <summary>
    /// Converts a generic object to a Dictionary for assertions.
    /// Useful when testing protocol messages that use object for flexibility.
    /// </summary>
    public static Dictionary<string, object>? AsDictionary(object? obj)
    {
        if (obj == null)
            return null;

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

    /// <summary>
    /// Gets a long value from a JsonElement by property name.
    /// </summary>
    public static long GetLong(JsonElement element, string propertyName)
    {
        return element.GetProperty(propertyName).GetInt64();
    }

    /// <summary>
    /// Gets a long value from a nullable JsonElement by property name.
    /// </summary>
    public static long GetLong(JsonElement? element, string propertyName)
    {
        if (!element.HasValue)
            throw new InvalidOperationException("JsonElement is null");
        return element.Value.GetProperty(propertyName).GetInt64();
    }

    /// <summary>
    /// Gets a string value from a JsonElement by property name.
    /// </summary>
    public static string? GetString(JsonElement element, string propertyName)
    {
        return element.GetProperty(propertyName).GetString();
    }
}
