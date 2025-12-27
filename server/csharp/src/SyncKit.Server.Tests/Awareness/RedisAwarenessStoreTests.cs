using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using StackExchange.Redis;
using SyncKit.Server.Awareness;
using SyncKit.Server.Configuration;
using Xunit;

namespace SyncKit.Server.Tests.Awareness;

public class RedisAwarenessStoreTests
{
    private readonly Mock<IConnectionMultiplexer> _mockConn = new();
    private readonly Mock<IDatabase> _mockDb = new();

    private IOptions<SyncKitConfig> CreateOptions(int timeoutMs = 30000)
    {
        return Options.Create(new SyncKitConfig { AwarenessTimeoutMs = timeoutMs, RedisUrl = "localhost:6379" });
    }

    public RedisAwarenessStoreTests()
    {
        _mockConn.Setup(c => c.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(_mockDb.Object);
    }

    [Fact]
    public async Task SetAsync_RejectsStaleUpdate()
    {
        var existing = new AwarenessEntry { DocumentId = "doc1", ClientId = "client1", Clock = 5, ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 10000, State = SyncKit.Server.Awareness.AwarenessState.Create("client1", null, 5) };
        var existingJson = JsonSerializer.Serialize(existing, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

        _mockDb.Setup(db => db.HashGetAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>())).ReturnsAsync(existingJson);

        var store = new RedisAwarenessStore(new NullLogger<RedisAwarenessStore>(), CreateOptions(), _mockConn.Object);

        var result = await store.SetAsync("doc1", "client1", SyncKit.Server.Awareness.AwarenessState.Create("client1", null, 4), 4);

        Assert.False(result);

        // Ensure no write attempted when stale
        _mockDb.Verify(db => db.HashSetAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()), Times.Never);
    }

    [Fact]
    public async Task SetAsync_AppliesUpdate_WhenClockIsGreater()
    {
        // No existing entry
        _mockDb.Setup(db => db.HashGetAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>())).ReturnsAsync(RedisValue.Null);

        // Transaction execute returns true
        var tranMock = new Mock<ITransaction>();
        tranMock.Setup(t => t.ExecuteAsync(It.IsAny<CommandFlags>())).ReturnsAsync(true);

        _mockDb.Setup(db => db.CreateTransaction(It.IsAny<object>())).Returns(tranMock.Object);

        // Make HashSetAsync and SortedSetAddAsync be recorded
        tranMock.Setup(t => t.HashSetAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>())).ReturnsAsync(true);
        tranMock.Setup(t => t.SortedSetAddAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<double>(), It.IsAny<CommandFlags>())).ReturnsAsync(true);
        tranMock.Setup(t => t.SetAddAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>())).ReturnsAsync(true);

        var store = new RedisAwarenessStore(new NullLogger<RedisAwarenessStore>(), CreateOptions(), _mockConn.Object);

        var applied = await store.SetAsync("doc1", "client1", SyncKit.Server.Awareness.AwarenessState.Create("client1", null, 1), 1);

        Assert.True(applied);
        // We expect a HashSet call on the transaction
        tranMock.Verify(t => t.HashSetAsync(It.IsAny<RedisKey>(), "client1", It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()), Times.Once);
    }

    [Fact]
    public async Task GetAllAsync_FiltersExpired()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var fresh = new AwarenessEntry { DocumentId = "doc1", ClientId = "a", Clock = 1, ExpiresAt = now + 10000, State = SyncKit.Server.Awareness.AwarenessState.Create("a", null, 1) };
        var expired = new AwarenessEntry { DocumentId = "doc1", ClientId = "b", Clock = 1, ExpiresAt = now - 1000, State = SyncKit.Server.Awareness.AwarenessState.Create("b", null, 1) };

        var list = new RedisValue[] { JsonSerializer.Serialize(fresh, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }), JsonSerializer.Serialize(expired, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }) };
        _mockDb.Setup(db => db.HashValuesAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>())).ReturnsAsync(list);

        var store = new RedisAwarenessStore(new NullLogger<RedisAwarenessStore>(), CreateOptions(), _mockConn.Object);

        var all = await store.GetAllAsync("doc1");
        Assert.Single(all);
        Assert.Equal("a", all[0].ClientId);
    }

    [Fact]
    public async Task RemoveAllForConnectionAsync_RemovesMatchingEntries()
    {
        // Setup docs set
        _mockDb.Setup(db => db.SetMembersAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>())).ReturnsAsync(new RedisValue[] { "doc1" });

        // HashGetAll returns one entry with key equal to connection id to be removed
        var entries = new HashEntry[] { new HashEntry("conn-1", JsonSerializer.Serialize(new AwarenessEntry { DocumentId = "doc1", ClientId = "conn-1", Clock = 1, ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 10000, State = SyncKit.Server.Awareness.AwarenessState.Create("conn-1", null, 1) })) };
        _mockDb.Setup(db => db.HashGetAllAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>())).ReturnsAsync(entries);

        _mockDb.Setup(db => db.HashDeleteAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>())).ReturnsAsync(true);
        _mockDb.Setup(db => db.SortedSetRemoveAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>())).ReturnsAsync(true);

        var store = new RedisAwarenessStore(new NullLogger<RedisAwarenessStore>(), CreateOptions(), _mockConn.Object);

        await store.RemoveAllForConnectionAsync("conn-1");

        _mockDb.Verify(db => db.HashDeleteAsync(It.IsAny<RedisKey>(), "conn-1", It.IsAny<CommandFlags>()), Times.Once);
        _mockDb.Verify(db => db.SortedSetRemoveAsync(It.IsAny<RedisKey>(), "conn-1", It.IsAny<CommandFlags>()), Times.Once);
    }
}
