using System.Data;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.Storage;
using Xunit;

namespace SyncKit.Server.Tests.Unit.Storage;

public class SchemaValidatorTests
{
    [Fact]
    public async Task ValidateSchemaAsync_ReturnsTrue_WhenAllTablesExist()
    {
        // Arrange
        var mockConn = new Mock<IDbConnection>();
        var mockCmd = new Mock<IDbCommand>();

        mockConn.Setup(c => c.CreateCommand()).Returns(mockCmd.Object);
        mockCmd.SetupProperty(c => c.CommandText);
        mockCmd.Setup(c => c.ExecuteScalar()).Returns(4); // four tables found

        var validator = new SchemaValidator(async ct => mockConn.Object, new NullLogger<SchemaValidator>());

        // Act
        var result = await validator.ValidateSchemaAsync();

        // Assert
        Assert.True(result);
    }

    [Fact]
    public async Task ValidateSchemaAsync_ReturnsFalse_WhenTablesMissing()
    {
        var mockConn = new Mock<IDbConnection>();
        var mockCmd = new Mock<IDbCommand>();

        mockConn.Setup(c => c.CreateCommand()).Returns(mockCmd.Object);
        mockCmd.SetupProperty(c => c.CommandText);
        mockCmd.Setup(c => c.ExecuteScalar()).Returns(2); // only 2 tables found

        var validator = new SchemaValidator(async ct => mockConn.Object, new NullLogger<SchemaValidator>());

        var result = await validator.ValidateSchemaAsync();

        Assert.False(result);
    }

    [Fact]
    public async Task ValidateSchemaAsync_ReturnsFalse_OnException()
    {
        var mockConn = new Mock<IDbConnection>();
        mockConn.Setup(c => c.CreateCommand()).Throws(new Exception("boom"));

        var validator = new SchemaValidator(async ct => mockConn.Object, new NullLogger<SchemaValidator>());

        var result = await validator.ValidateSchemaAsync();

        Assert.False(result);
    }
}
