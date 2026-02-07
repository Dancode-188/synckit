using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SyncKit.Server.Auth;

namespace SyncKit.Server.Controllers.Auth;

/// <summary>
/// REST authentication endpoints matching the TypeScript server implementation.
/// Provides login, token refresh, user info, and token verification endpoints.
/// </summary>
[ApiController]
[Route("auth")]
public class AuthController : ControllerBase
{
    private readonly IJwtGenerator _jwtGenerator;
    private readonly IJwtValidator _jwtValidator;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IJwtGenerator jwtGenerator,
        IJwtValidator jwtValidator,
        ILogger<AuthController> logger)
    {
        _jwtGenerator = jwtGenerator ?? throw new ArgumentNullException(nameof(jwtGenerator));
        _jwtValidator = jwtValidator ?? throw new ArgumentNullException(nameof(jwtValidator));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Login endpoint - generates access and refresh tokens.
    /// NOTE: This is a demo implementation. In production, this would:
    /// 1. Validate credentials against a database
    /// 2. Hash/verify passwords
    /// 3. Lookup user permissions from storage
    /// </summary>
    /// <param name="request">Login request containing user credentials and permissions.</param>
    /// <returns>Access token, refresh token, and user information.</returns>
    [HttpPost("login")]
    [AllowAnonymous]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest(new ErrorResponse { Error = "Email required" });
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new ErrorResponse { Error = "Password required" });
        }

        // Demo auth - accept any email/password
        // In production: validate against database

        // Generate user ID (in production: from database)
        var userId = $"user-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";

        // Create permissions (in production: from database)
        var permissions = request.Permissions != null
            ? new DocumentPermissions
            {
                CanRead = request.Permissions.CanRead ?? Array.Empty<string>(),
                CanWrite = request.Permissions.CanWrite ?? Array.Empty<string>(),
                IsAdmin = request.Permissions.IsAdmin
            }
            : new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),
                CanWrite = Array.Empty<string>(),
                IsAdmin = false
            };

        // Generate tokens
        var (accessToken, refreshToken) = _jwtGenerator.GenerateTokenPair(
            userId,
            request.Email,
            permissions);

        _logger.LogInformation("User {Email} logged in as {UserId}", request.Email, userId);

        return Ok(new LoginResponse
        {
            UserId = userId,
            Email = request.Email,
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            Permissions = permissions
        });
    }

    /// <summary>
    /// Refresh endpoint - generates a new access token using a refresh token.
    /// </summary>
    /// <param name="request">Refresh request containing the refresh token.</param>
    /// <returns>New access token and refresh token.</returns>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public IActionResult Refresh([FromBody] RefreshRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            return BadRequest(new ErrorResponse { Error = "Refresh token required" });
        }

        // Verify refresh token
        var payload = _jwtValidator.Validate(request.RefreshToken);

        if (payload == null)
        {
            return Unauthorized(new ErrorResponse { Error = "Invalid or expired refresh token" });
        }

        // In production: lookup user from database
        // For demo: recreate with same permissions
        var (accessToken, refreshToken) = _jwtGenerator.GenerateTokenPair(
            payload.UserId,
            payload.Email,
            payload.Permissions);

        _logger.LogInformation("Token refreshed for user {UserId}", payload.UserId);

        return Ok(new RefreshResponse
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken
        });
    }

    /// <summary>
    /// Get current user information from the provided access token.
    /// </summary>
    /// <returns>User ID, email, and permissions.</returns>
    [HttpGet("me")]
    [AllowAnonymous]
    public IActionResult Me()
    {
        // Extract token from Authorization header
        var authHeader = HttpContext.Request.Headers.Authorization.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(authHeader))
        {
            return Unauthorized(new ErrorResponse { Error = "No token provided" });
        }

        // Remove "Bearer " prefix if present
        var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? authHeader.Substring(7)
            : authHeader;

        // Validate token
        var payload = _jwtValidator.Validate(token);
        if (payload == null)
        {
            return Unauthorized(new ErrorResponse { Error = "Invalid token" });
        }

        return Ok(new MeResponse
        {
            UserId = payload.UserId,
            Email = payload.Email,
            Permissions = payload.Permissions
        });
    }

    /// <summary>
    /// Verify if a token is valid and not expired.
    /// </summary>
    /// <param name="request">Verify request containing the token to validate.</param>
    /// <returns>Validation result with user ID and expiration time if valid.</returns>
    [HttpPost("verify")]
    [AllowAnonymous]
    public IActionResult Verify([FromBody] VerifyRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            return BadRequest(new ErrorResponse { Error = "Token required" });
        }

        var payload = _jwtValidator.Validate(request.Token);

        if (payload == null)
        {
            return Ok(new VerifyResponse
            {
                Valid = false,
                UserId = null,
                ExpiresAt = null
            });
        }

        return Ok(new VerifyResponse
        {
            Valid = true,
            UserId = payload.UserId,
            ExpiresAt = payload.Exp
        });
    }
}
