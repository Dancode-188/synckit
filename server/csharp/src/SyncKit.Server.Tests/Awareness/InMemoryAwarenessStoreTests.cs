using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SyncKit.Server.Awareness;
using SyncKit.Server.Configuration;
using Moq;

namespace SyncKit.Server.Tests.Awareness;

public class InMemoryAwarenessStoreTests
{
    private readonly InMemoryAwarenessStore _store;

    public InMemoryAwarenessStoreTests()
    {
        var config = Options.Create(new SyncKitConfig { AwarenessTimeoutMs = 30000 });
        var logger = new Mock<ILogger<InMemoryAwarenessStore>>().Object;
        _store = new InMemoryAwarenessStore(config, logger);
    }

    [Fact]
    public async Task SetAndGetAsync_ShouldStoreEntry()
    {
        var docId = "doc-1";
        var clientId = "client-1";

        var state = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 1 } }), 1);

        var applied = await _store.SetAsync(docId, clientId, state, 1);
        Assert.True(applied);

        var saved = await _store.GetAsync(docId, clientId);
        Assert.NotNull(saved);
        Assert.Equal(clientId, saved!.ClientId);
        Assert.Equal(1, saved.Clock);
    }

    [Fact]
    public async Task SetAsync_ShouldRejectStaleUpdates()
    {
        var docId = "doc-2";
        var clientId = "client-2";

        var state1 = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 1 } }), 5);
        var state2 = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 2 } }), 3);

        var applied1 = await _store.SetAsync(docId, clientId, state1, 5);
        Assert.True(applied1);

        var applied2 = await _store.SetAsync(docId, clientId, state2, 3);
        Assert.False(applied2);

        var saved = await _store.GetAsync(docId, clientId);
        Assert.Equal(5, saved!.Clock);
    }

    [Fact]
    public async Task PruneExpiredAsync_ShouldRemoveExpiredEntries()
    {
        var config = Options.Create(new SyncKitConfig { AwarenessTimeoutMs = 0 });
        var logger = new Mock<ILogger<InMemoryAwarenessStore>>().Object;
        var quickStore = new InMemoryAwarenessStore(config, logger);

        var docId = "doc-3";
        var clientId = "client-3";

        var state = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 1 } }), 1);

        var applied = await quickStore.SetAsync(docId, clientId, state, 1);
        Assert.True(applied);

        // Entry should be expired immediately
        var expired = await quickStore.GetExpiredAsync();
        Assert.Single(expired);

        await quickStore.PruneExpiredAsync();

        var saved = await quickStore.GetAsync(docId, clientId);
        Assert.Null(saved);
    }

    [Fact]
    public async Task RemoveAllForConnectionAsync_ShouldRemoveAllEntriesForConnection()
    {
        var docA = "doc-a";
        var docB = "doc-b";
        var clientId = "conn-xyz";

        var stateA = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 1 } }), 1);
        var stateB = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 2 } }), 1);

        await _store.SetAsync(docA, clientId, stateA, 1);
        await _store.SetAsync(docB, clientId, stateB, 1);

        var savedA = await _store.GetAsync(docA, clientId);
        var savedB = await _store.GetAsync(docB, clientId);

        Assert.NotNull(savedA);
        Assert.NotNull(savedB);

        await _store.RemoveAllForConnectionAsync(clientId);

        var removedA = await _store.GetAsync(docA, clientId);
        var removedB = await _store.GetAsync(docB, clientId);

        Assert.Null(removedA);
        Assert.Null(removedB);
    }
}
