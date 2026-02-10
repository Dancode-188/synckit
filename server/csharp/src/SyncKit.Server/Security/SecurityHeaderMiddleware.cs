namespace SyncKit.Server.Security;

/// <summary>
/// ASP.NET Core middleware that adds security headers to all responses.
/// Mirrors the TypeScript server's getCSPHeaders() in server/typescript/src/security/middleware.ts.
/// </summary>
public class SecurityHeaderMiddleware
{
    private readonly RequestDelegate _next;

    private static readonly string ContentSecurityPolicy = string.Join("; ",
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' wss: ws:",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests");

    public SecurityHeaderMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;

            if (!headers.ContainsKey("Content-Security-Policy"))
                headers["Content-Security-Policy"] = ContentSecurityPolicy;
            if (!headers.ContainsKey("X-Content-Type-Options"))
                headers["X-Content-Type-Options"] = "nosniff";
            if (!headers.ContainsKey("X-Frame-Options"))
                headers["X-Frame-Options"] = "DENY";
            if (!headers.ContainsKey("X-XSS-Protection"))
                headers["X-XSS-Protection"] = "1; mode=block";
            if (!headers.ContainsKey("Referrer-Policy"))
                headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

            return Task.CompletedTask;
        });

        await _next(context);
    }
}
