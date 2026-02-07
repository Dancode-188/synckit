using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Services;
using SyncKit.Server.WebSockets.Protocol.Messages;
using Xunit;

namespace SyncKit.Server.Tests.Services;

/// <summary>
/// Tests for the MessagePool service.
/// Verifies object pooling behavior for message types.
/// </summary>
public class MessagePoolTests
{
    private readonly Mock<ILogger<MessagePool>> _mockLogger;
    private readonly MessagePool _pool;

    public MessagePoolTests()
    {
        _mockLogger = new Mock<ILogger<MessagePool>>();
        _pool = new MessagePool(_mockLogger.Object);
    }

    #region AckMessage Tests

    [Fact]
    public void RentAckMessage_ReturnsValidMessage()
    {
        // Arrange
        var messageId = "test-message-123";

        // Act
        var message = _pool.RentAckMessage(messageId);

        // Assert
        Assert.NotNull(message);
        Assert.Equal(messageId, message.MessageId);
        Assert.NotEmpty(message.Id);
        Assert.True(message.Timestamp > 0);
    }

    [Fact]
    public void RentAckMessage_EachCallReturnsNewId()
    {
        // Arrange & Act
        var message1 = _pool.RentAckMessage("msg1");
        var message2 = _pool.RentAckMessage("msg2");

        // Assert
        Assert.NotEqual(message1.Id, message2.Id);
    }

    [Fact]
    public void ReturnAckMessage_DoesNotThrow()
    {
        // Arrange
        var message = _pool.RentAckMessage("test");

        // Act & Assert (should not throw)
        _pool.ReturnAckMessage(message);
    }

    [Fact]
    public void ReturnAckMessage_NullDoesNotThrow()
    {
        // Act & Assert (should not throw)
        _pool.ReturnAckMessage(null!);
    }

    #endregion

    #region ErrorMessage Tests

    [Fact]
    public void RentErrorMessage_ReturnsValidMessage()
    {
        // Arrange
        var error = "Test error message";

        // Act
        var message = _pool.RentErrorMessage(error);

        // Assert
        Assert.NotNull(message);
        Assert.Equal(error, message.Error);
        Assert.NotEmpty(message.Id);
        Assert.True(message.Timestamp > 0);
        Assert.Null(message.Details);
    }

    [Fact]
    public void ReturnErrorMessage_DoesNotThrow()
    {
        // Arrange
        var message = _pool.RentErrorMessage("error");

        // Act & Assert
        _pool.ReturnErrorMessage(message);
    }

    #endregion

    #region PongMessage Tests

    [Fact]
    public void RentPongMessage_ReturnsValidMessage()
    {
        // Act
        var message = _pool.RentPongMessage();

        // Assert
        Assert.NotNull(message);
        Assert.NotEmpty(message.Id);
        Assert.True(message.Timestamp > 0);
    }

    [Fact]
    public void RentPongMessage_EachCallReturnsNewId()
    {
        // Act
        var message1 = _pool.RentPongMessage();
        var message2 = _pool.RentPongMessage();

        // Assert
        Assert.NotEqual(message1.Id, message2.Id);
    }

    [Fact]
    public void ReturnPongMessage_DoesNotThrow()
    {
        // Arrange
        var message = _pool.RentPongMessage();

        // Act & Assert
        _pool.ReturnPongMessage(message);
    }

    #endregion

    #region VectorClock Dictionary Tests

    [Fact]
    public void RentVectorClock_ReturnsEmptyDictionary()
    {
        // Act
        var dict = _pool.RentVectorClock();

        // Assert
        Assert.NotNull(dict);
        Assert.Empty(dict);
    }

    [Fact]
    public void RentVectorClock_WithSource_CopiesData()
    {
        // Arrange
        var source = new Dictionary<string, long>
        {
            ["client1"] = 5,
            ["client2"] = 10
        };

        // Act
        var dict = _pool.RentVectorClock(source);

        // Assert
        Assert.Equal(2, dict.Count);
        Assert.Equal(5, dict["client1"]);
        Assert.Equal(10, dict["client2"]);
    }

    [Fact]
    public void ReturnVectorClock_ClearsDictionary()
    {
        // Arrange
        var dict = _pool.RentVectorClock();
        dict["client1"] = 42;

        // Act
        _pool.ReturnVectorClock(dict);

        // Then rent again - it should be cleared
        var newDict = _pool.RentVectorClock();

        // Assert
        Assert.Empty(newDict);
    }

    [Fact]
    public void ReturnVectorClock_NullDoesNotThrow()
    {
        // Act & Assert
        _pool.ReturnVectorClock(null);
    }

    #endregion

    #region Delta Dictionary Tests

    [Fact]
    public void RentDeltaDictionary_ReturnsEmptyDictionary()
    {
        // Act
        var dict = _pool.RentDeltaDictionary();

        // Assert
        Assert.NotNull(dict);
        Assert.Empty(dict);
    }

    [Fact]
    public void ReturnDeltaDictionary_ClearsDictionary()
    {
        // Arrange
        var dict = _pool.RentDeltaDictionary();
        dict["field1"] = "value1";
        dict["field2"] = 42;

        // Act
        _pool.ReturnDeltaDictionary(dict);

        // Then rent again
        var newDict = _pool.RentDeltaDictionary();

        // Assert
        Assert.Empty(newDict);
    }

    [Fact]
    public void ReturnDeltaDictionary_NullDoesNotThrow()
    {
        // Act & Assert
        _pool.ReturnDeltaDictionary(null);
    }

    #endregion

    #region Statistics Tests

    [Fact]
    public void GetStatistics_TracksRentOperations()
    {
        // Arrange
        _pool.RentAckMessage("test1");
        _pool.RentAckMessage("test2");
        _pool.RentErrorMessage("error");
        _pool.RentPongMessage();
        _pool.RentVectorClock();
        _pool.RentDeltaDictionary();

        // Act
        var stats = _pool.GetStatistics();

        // Assert
        Assert.Equal(2, stats.AckMessagesRented);
        Assert.Equal(1, stats.ErrorMessagesRented);
        Assert.Equal(1, stats.PongMessagesRented);
        Assert.Equal(1, stats.VectorClocksRented);
        Assert.Equal(1, stats.DeltaDictionariesRented);
    }

    [Fact]
    public void GetStatistics_TracksReturnOperations()
    {
        // Arrange
        var ack = _pool.RentAckMessage("test");
        var error = _pool.RentErrorMessage("error");
        var pong = _pool.RentPongMessage();
        var vc = _pool.RentVectorClock();
        var delta = _pool.RentDeltaDictionary();

        _pool.ReturnAckMessage(ack);
        _pool.ReturnErrorMessage(error);
        _pool.ReturnPongMessage(pong);
        _pool.ReturnVectorClock(vc);
        _pool.ReturnDeltaDictionary(delta);

        // Act
        var stats = _pool.GetStatistics();

        // Assert
        Assert.Equal(1, stats.AckMessagesReturned);
        Assert.Equal(1, stats.ErrorMessagesReturned);
        Assert.Equal(1, stats.PongMessagesReturned);
        Assert.Equal(1, stats.VectorClocksReturned);
        Assert.Equal(1, stats.DeltaDictionariesReturned);
    }

    [Fact]
    public void GetStatistics_TotalActive_CalculatesCorrectly()
    {
        // Arrange
        _pool.RentAckMessage("test1");
        _pool.RentAckMessage("test2");
        var ack3 = _pool.RentAckMessage("test3");
        _pool.ReturnAckMessage(ack3);

        // Act
        var stats = _pool.GetStatistics();

        // Assert
        Assert.Equal(2, stats.TotalActive); // 3 rented, 1 returned = 2 active
    }

    #endregion

    #region Disposal Tests

    [Fact]
    public void Dispose_CalledMultipleTimes_DoesNotThrow()
    {
        // Arrange
        var pool = new MessagePool(_mockLogger.Object);

        // Act & Assert
        pool.Dispose();
        pool.Dispose(); // Should not throw
    }

    [Fact]
    public void RentAckMessage_AfterDispose_ThrowsObjectDisposedException()
    {
        // Arrange
        var pool = new MessagePool(_mockLogger.Object);
        pool.Dispose();

        // Act & Assert
        Assert.Throws<ObjectDisposedException>(() => pool.RentAckMessage("test"));
    }

    [Fact]
    public void RentErrorMessage_AfterDispose_ThrowsObjectDisposedException()
    {
        // Arrange
        var pool = new MessagePool(_mockLogger.Object);
        pool.Dispose();

        // Act & Assert
        Assert.Throws<ObjectDisposedException>(() => pool.RentErrorMessage("error"));
    }

    [Fact]
    public void RentPongMessage_AfterDispose_ThrowsObjectDisposedException()
    {
        // Arrange
        var pool = new MessagePool(_mockLogger.Object);
        pool.Dispose();

        // Act & Assert
        Assert.Throws<ObjectDisposedException>(() => pool.RentPongMessage());
    }

    [Fact]
    public void RentVectorClock_AfterDispose_ThrowsObjectDisposedException()
    {
        // Arrange
        var pool = new MessagePool(_mockLogger.Object);
        pool.Dispose();

        // Act & Assert
        Assert.Throws<ObjectDisposedException>(() => pool.RentVectorClock());
    }

    [Fact]
    public void RentDeltaDictionary_AfterDispose_ThrowsObjectDisposedException()
    {
        // Arrange
        var pool = new MessagePool(_mockLogger.Object);
        pool.Dispose();

        // Act & Assert
        Assert.Throws<ObjectDisposedException>(() => pool.RentDeltaDictionary());
    }

    [Fact]
    public void ReturnAckMessage_AfterDispose_DoesNotThrow()
    {
        // Arrange
        var pool = new MessagePool(_mockLogger.Object);
        var message = pool.RentAckMessage("test");
        pool.Dispose();

        // Act & Assert (should not throw - graceful handling)
        pool.ReturnAckMessage(message);
    }

    #endregion

    #region Pooling Behavior Tests

    [Fact]
    public void Pool_ReusesObjects_AfterReturn()
    {
        // Note: This test verifies the pooling behavior by checking that
        // returned objects may be reused. The actual object reuse depends
        // on pool implementation details.

        // Arrange - rent and return many objects to prime the pool
        var messages = new List<AckMessage>();
        for (int i = 0; i < 10; i++)
        {
            messages.Add(_pool.RentAckMessage($"msg-{i}"));
        }
        foreach (var msg in messages)
        {
            _pool.ReturnAckMessage(msg);
        }

        // Act - rent again
        var stats = _pool.GetStatistics();

        // Assert - all rented and returned should be tracked
        Assert.Equal(10, stats.AckMessagesRented);
        Assert.Equal(10, stats.AckMessagesReturned);
    }

    [Fact]
    public async Task Pool_ThreadSafe_ConcurrentRentAndReturn()
    {
        // Arrange
        var tasks = new List<Task>();
        var exceptions = new System.Collections.Concurrent.ConcurrentBag<Exception>();

        // Act - concurrent rent/return operations
        for (int i = 0; i < 100; i++)
        {
            tasks.Add(Task.Run(async () =>
            {
                try
                {
                    var ack = _pool.RentAckMessage($"msg-{Thread.CurrentThread.ManagedThreadId}");
                    await Task.Delay(1); // Simulate work
                    _pool.ReturnAckMessage(ack);

                    var vc = _pool.RentVectorClock();
                    vc["client"] = 1;
                    _pool.ReturnVectorClock(vc);
                }
                catch (Exception ex)
                {
                    exceptions.Add(ex);
                }
            }));
        }

        await Task.WhenAll(tasks);

        // Assert
        Assert.Empty(exceptions);

        var stats = _pool.GetStatistics();
        Assert.Equal(100, stats.AckMessagesRented);
        Assert.Equal(100, stats.AckMessagesReturned);
        Assert.Equal(100, stats.VectorClocksRented);
        Assert.Equal(100, stats.VectorClocksReturned);
    }

    #endregion
}
