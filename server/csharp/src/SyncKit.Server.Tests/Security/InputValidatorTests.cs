using SyncKit.Server.Security;

namespace SyncKit.Server.Tests.Security;

/// <summary>
/// Tests for InputValidator covering document ID validation, field path validation,
/// and edge cases such as path traversal, null bytes, oversized input, and special characters.
/// </summary>
public class InputValidatorTests
{
    // --- IsValidDocumentId ---

    [Theory]
    [InlineData("doc-1")]
    [InlineData("my_document")]
    [InlineData("project:task:123")]
    [InlineData("ABC123")]
    [InlineData("a")]
    [InlineData("doc-with-dashes")]
    [InlineData("doc_with_underscores")]
    [InlineData("mixed:Case-id_123")]
    public void IsValidDocumentId_ValidIds_ReturnsTrue(string id)
    {
        Assert.True(InputValidator.IsValidDocumentId(id));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("../etc/passwd")]
    [InlineData("doc with spaces")]
    [InlineData("doc/slash")]
    [InlineData("doc\\backslash")]
    [InlineData("doc<script>")]
    [InlineData("doc&id")]
    [InlineData("doc=id")]
    [InlineData("doc?id")]
    [InlineData("doc#id")]
    [InlineData("doc@id")]
    [InlineData("doc!id")]
    [InlineData("doc%id")]
    [InlineData("doc\0null")]
    public void IsValidDocumentId_InvalidIds_ReturnsFalse(string? id)
    {
        Assert.False(InputValidator.IsValidDocumentId(id));
    }

    [Fact]
    public void IsValidDocumentId_MaxLength_ReturnsTrue()
    {
        var id = new string('a', 256);
        Assert.True(InputValidator.IsValidDocumentId(id));
    }

    [Fact]
    public void IsValidDocumentId_ExceedsMaxLength_ReturnsFalse()
    {
        var id = new string('a', 257);
        Assert.False(InputValidator.IsValidDocumentId(id));
    }

    // --- IsValidFieldPath ---

    [Theory]
    [InlineData("fieldName")]
    [InlineData("nested.field.path")]
    [InlineData("field-with-dashes")]
    [InlineData("field_with_underscores")]
    public void IsValidFieldPath_ValidPaths_ReturnsTrue(string path)
    {
        Assert.True(InputValidator.IsValidFieldPath(path));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("..")]
    [InlineData("../etc/passwd")]
    [InlineData("field/../../etc/passwd")]
    [InlineData("field\0name")]
    public void IsValidFieldPath_InvalidPaths_ReturnsFalse(string? path)
    {
        Assert.False(InputValidator.IsValidFieldPath(path));
    }

    // --- GetValidationError ---

    [Fact]
    public void GetValidationError_ValidId_ReturnsNull()
    {
        Assert.Null(InputValidator.GetValidationError("valid-doc-id"));
    }

    [Fact]
    public void GetValidationError_NullId_ReturnsError()
    {
        var error = InputValidator.GetValidationError(null);
        Assert.Equal("Invalid document ID", error);
    }

    [Fact]
    public void GetValidationError_EmptyId_ReturnsError()
    {
        var error = InputValidator.GetValidationError("");
        Assert.Equal("Invalid document ID", error);
    }

    [Fact]
    public void GetValidationError_TooLongId_ReturnsError()
    {
        var error = InputValidator.GetValidationError(new string('x', 257));
        Assert.Equal("Document ID too long", error);
    }

    [Fact]
    public void GetValidationError_InvalidChars_ReturnsError()
    {
        var error = InputValidator.GetValidationError("../etc/passwd");
        Assert.Equal("Document ID contains invalid characters", error);
    }

    [Fact]
    public void GetValidationError_SpacesInId_ReturnsError()
    {
        var error = InputValidator.GetValidationError("doc with spaces");
        Assert.Equal("Document ID contains invalid characters", error);
    }
}
