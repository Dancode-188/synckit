using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;
using SyncKit.Server.Controllers.Auth;
using Xunit;

namespace SyncKit.Server.Tests.Controllers;

/// <summary>
/// Unit tests for AuthController REST endpoints.
/// Validates login, refresh, me, and verify endpoint behavior.
/// </summary>
public class AuthControllerTests
{
    private const string TestSecret = "test-secret-key-at-least-32-chars-long-for-hs256";

    private readonly AuthController _controller;
    private readonly IJwtGenerator _jwtGenerator;
    private readonly IJwtValidator _jwtValidator;

    public AuthControllerTests()
    {
        var config = Options.Create(new SyncKitConfig
        {
            JwtSecret = TestSecret,
            JwtExpiresIn = "24h",
            JwtRefreshExpiresIn = "7d"
        });

        _jwtGenerator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        _jwtValidator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);
        _controller = new AuthController(
            _jwtGenerator,
            _jwtValidator,
            NullLogger<AuthController>.Instance);
    }

    #region Login Tests

    [Fact]
    public void Login_ValidRequest_ReturnsOkWithTokens()
    {
        // Arrange
        var request = new LoginRequest
        {
            Email = "test@example.com",
            Password = "password123"
        };

        // Act
        var result = _controller.Login(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<LoginResponse>(okResult.Value);

        Assert.NotNull(response.AccessToken);
        Assert.NotNull(response.RefreshToken);
        Assert.NotNull(response.UserId);
        Assert.Equal("test@example.com", response.Email);
        Assert.NotNull(response.Permissions);

        // Verify tokens are valid
        var accessPayload = _jwtValidator.Validate(response.AccessToken);
        Assert.NotNull(accessPayload);
        Assert.Equal(response.UserId, accessPayload!.UserId);

        var refreshPayload = _jwtValidator.Validate(response.RefreshToken);
        Assert.NotNull(refreshPayload);
    }

    [Fact]
    public void Login_WithCustomPermissions_ReturnsTokensWithPermissions()
    {
        // Arrange
        var request = new LoginRequest
        {
            Email = "user@example.com",
            Password = "password",
            Permissions = new PermissionsInput
            {
                CanRead = new[] { "doc-1", "doc-2" },
                CanWrite = new[] { "doc-1" },
                IsAdmin = false
            }
        };

        // Act
        var result = _controller.Login(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<LoginResponse>(okResult.Value);

        Assert.Equal(2, response.Permissions.CanRead.Length);
        Assert.Contains("doc-1", response.Permissions.CanRead);
        Assert.Contains("doc-2", response.Permissions.CanRead);
        Assert.Single(response.Permissions.CanWrite);
        Assert.Contains("doc-1", response.Permissions.CanWrite);
        Assert.False(response.Permissions.IsAdmin);
    }

    [Fact]
    public void Login_WithAdminPermissions_ReturnsAdminToken()
    {
        // Arrange
        var request = new LoginRequest
        {
            Email = "admin@example.com",
            Password = "admin123",
            Permissions = new PermissionsInput
            {
                IsAdmin = true
            }
        };

        // Act
        var result = _controller.Login(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<LoginResponse>(okResult.Value);

        Assert.True(response.Permissions.IsAdmin);
    }

    [Fact]
    public void Login_MissingEmail_ReturnsBadRequest()
    {
        // Arrange
        var request = new LoginRequest
        {
            Email = "",
            Password = "password123"
        };

        // Act
        var result = _controller.Login(request);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        var error = Assert.IsType<ErrorResponse>(badRequestResult.Value);
        Assert.Equal("Email required", error.Error);
    }

    [Fact]
    public void Login_MissingPassword_ReturnsBadRequest()
    {
        // Arrange
        var request = new LoginRequest
        {
            Email = "test@example.com",
            Password = ""
        };

        // Act
        var result = _controller.Login(request);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        var error = Assert.IsType<ErrorResponse>(badRequestResult.Value);
        Assert.Equal("Password required", error.Error);
    }

    #endregion

    #region Refresh Tests

    [Fact]
    public void Refresh_ValidRefreshToken_ReturnsNewTokens()
    {
        // Arrange
        var userId = "user-123";
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1" },
            CanWrite = new[] { "doc-1" },
            IsAdmin = false
        };

        var (_, refreshToken) = _jwtGenerator.GenerateTokenPair(userId, "test@example.com", permissions);

        var request = new RefreshRequest
        {
            RefreshToken = refreshToken
        };

        // Act
        var result = _controller.Refresh(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<RefreshResponse>(okResult.Value);

        Assert.NotNull(response.AccessToken);
        Assert.NotNull(response.RefreshToken);

        // Verify new tokens are valid
        var payload = _jwtValidator.Validate(response.AccessToken);
        Assert.NotNull(payload);
        Assert.Equal(userId, payload!.UserId);
    }

    [Fact]
    public void Refresh_InvalidToken_ReturnsUnauthorized()
    {
        // Arrange
        var request = new RefreshRequest
        {
            RefreshToken = "invalid-token"
        };

        // Act
        var result = _controller.Refresh(request);

        // Assert
        var unauthorizedResult = Assert.IsType<UnauthorizedObjectResult>(result);
        var error = Assert.IsType<ErrorResponse>(unauthorizedResult.Value);
        Assert.Equal("Invalid or expired refresh token", error.Error);
    }

    [Fact]
    public void Refresh_MissingToken_ReturnsBadRequest()
    {
        // Arrange
        var request = new RefreshRequest
        {
            RefreshToken = ""
        };

        // Act
        var result = _controller.Refresh(request);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        var error = Assert.IsType<ErrorResponse>(badRequestResult.Value);
        Assert.Equal("Refresh token required", error.Error);
    }

    #endregion

    #region Me Tests

    [Fact]
    public void Me_ValidToken_ReturnsUserInfo()
    {
        // Arrange
        var userId = "user-456";
        var email = "user@example.com";
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1", "doc-2" },
            CanWrite = new[] { "doc-1" },
            IsAdmin = false
        };

        var accessToken = _jwtGenerator.GenerateAccessToken(userId, email, permissions);

        // Set up HttpContext with Authorization header
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };
        _controller.HttpContext.Request.Headers.Authorization = $"Bearer {accessToken}";

        // Act
        var result = _controller.Me();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<MeResponse>(okResult.Value);

        Assert.Equal(userId, response.UserId);
        Assert.Equal(email, response.Email);
        Assert.Equal(2, response.Permissions.CanRead.Length);
        Assert.Single(response.Permissions.CanWrite);
        Assert.False(response.Permissions.IsAdmin);
    }

    [Fact]
    public void Me_TokenWithoutBearerPrefix_ReturnsUserInfo()
    {
        // Arrange
        var accessToken = _jwtGenerator.GenerateAccessToken(
            "user-789",
            "test@example.com",
            new DocumentPermissions { IsAdmin = true });

        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };
        _controller.HttpContext.Request.Headers.Authorization = accessToken;

        // Act
        var result = _controller.Me();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<MeResponse>(okResult.Value);

        Assert.Equal("user-789", response.UserId);
        Assert.True(response.Permissions.IsAdmin);
    }

    [Fact]
    public void Me_NoToken_ReturnsUnauthorized()
    {
        // Arrange
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        // Act
        var result = _controller.Me();

        // Assert
        var unauthorizedResult = Assert.IsType<UnauthorizedObjectResult>(result);
        var error = Assert.IsType<ErrorResponse>(unauthorizedResult.Value);
        Assert.Equal("No token provided", error.Error);
    }

    [Fact]
    public void Me_InvalidToken_ReturnsUnauthorized()
    {
        // Arrange
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };
        _controller.HttpContext.Request.Headers.Authorization = "Bearer invalid-token";

        // Act
        var result = _controller.Me();

        // Assert
        var unauthorizedResult = Assert.IsType<UnauthorizedObjectResult>(result);
        var error = Assert.IsType<ErrorResponse>(unauthorizedResult.Value);
        Assert.Equal("Invalid token", error.Error);
    }

    #endregion

    #region Verify Tests

    [Fact]
    public void Verify_ValidToken_ReturnsValidResponse()
    {
        // Arrange
        var userId = "user-999";
        var permissions = new DocumentPermissions();
        var accessToken = _jwtGenerator.GenerateAccessToken(userId, null, permissions);

        var request = new VerifyRequest
        {
            Token = accessToken
        };

        // Act
        var result = _controller.Verify(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<VerifyResponse>(okResult.Value);

        Assert.True(response.Valid);
        Assert.Equal(userId, response.UserId);
        Assert.NotNull(response.ExpiresAt);
        Assert.True(response.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeSeconds());
    }

    [Fact]
    public void Verify_InvalidToken_ReturnsInvalidResponse()
    {
        // Arrange
        var request = new VerifyRequest
        {
            Token = "invalid-token-xyz"
        };

        // Act
        var result = _controller.Verify(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<VerifyResponse>(okResult.Value);

        Assert.False(response.Valid);
        Assert.Null(response.UserId);
        Assert.Null(response.ExpiresAt);
    }

    [Fact]
    public void Verify_MissingToken_ReturnsBadRequest()
    {
        // Arrange
        var request = new VerifyRequest
        {
            Token = ""
        };

        // Act
        var result = _controller.Verify(request);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        var error = Assert.IsType<ErrorResponse>(badRequestResult.Value);
        Assert.Equal("Token required", error.Error);
    }

    #endregion

    #region Integration Tests

    [Fact]
    public void LoginAndRefreshFlow_CompleteCycle_WorksCorrectly()
    {
        // 1. Login
        var loginRequest = new LoginRequest
        {
            Email = "flow@example.com",
            Password = "password"
        };

        var loginResult = _controller.Login(loginRequest);
        var loginResponse = (LoginResponse)((OkObjectResult)loginResult).Value!;

        // 2. Use access token in /me
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };
        _controller.HttpContext.Request.Headers.Authorization = $"Bearer {loginResponse.AccessToken}";

        var meResult = _controller.Me();
        var meResponse = (MeResponse)((OkObjectResult)meResult).Value!;

        Assert.Equal(loginResponse.UserId, meResponse.UserId);
        Assert.Equal(loginResponse.Email, meResponse.Email);

        // 3. Refresh token
        var refreshRequest = new RefreshRequest
        {
            RefreshToken = loginResponse.RefreshToken
        };

        var refreshResult = _controller.Refresh(refreshRequest);
        var refreshResponse = (RefreshResponse)((OkObjectResult)refreshResult).Value!;

        Assert.NotNull(refreshResponse.AccessToken);
        Assert.NotNull(refreshResponse.RefreshToken);

        // 4. Verify new access token
        var verifyRequest = new VerifyRequest
        {
            Token = refreshResponse.AccessToken
        };

        var verifyResult = _controller.Verify(verifyRequest);
        var verifyResponse = (VerifyResponse)((OkObjectResult)verifyResult).Value!;

        Assert.True(verifyResponse.Valid);
        Assert.Equal(loginResponse.UserId, verifyResponse.UserId);
    }

    #endregion
}
