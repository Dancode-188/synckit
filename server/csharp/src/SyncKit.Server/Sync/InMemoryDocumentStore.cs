using System;
using Microsoft.Extensions.Logging;
using SyncKit.Server.Storage;

namespace SyncKit.Server.Sync;

/// <summary>
/// Compatibility wrapper for the legacy type name `InMemoryDocumentStore`.
/// This class delegates to the new `InMemoryStorageAdapter` implementation.
/// Marked obsolete to encourage migration to `IStorageAdapter`.
/// </summary>
[Obsolete("Use InMemoryStorageAdapter (IStorageAdapter) instead")]
public class InMemoryDocumentStore : InMemoryStorageAdapter
{
    public InMemoryDocumentStore(ILogger<InMemoryDocumentStore> logger)
        : base(new LoggerAdapter(logger))
    {
    }
}

/// <summary>
/// Minimal adapter that adapts ILogger<T> instances to a non-generic ILogger
/// so that the storage implementation can be used from both the old and new wrappers.
/// </summary>
internal class LoggerAdapter : ILogger
{
    private readonly ILogger _inner;

    public LoggerAdapter(ILogger inner)
    {
        _inner = inner;
    }

    IDisposable? ILogger.BeginScope<TState>(TState state) => _inner.BeginScope(state);
    public bool IsEnabled(LogLevel logLevel) => _inner.IsEnabled(logLevel);
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        => _inner.Log(logLevel, eventId, state, exception, formatter);
}

