using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using SyncKit.Server.Security;

namespace SyncKit.Server.Tests.Security;

/// <summary>
/// Tests for SecurityHeaderMiddleware verifying that all security headers
/// (CSP, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy)
/// are set on every response.
/// </summary>
public class SecurityHeaderMiddlewareTests
{
    /// <summary>
    /// Custom IHttpResponseFeature that captures and fires OnStarting callbacks,
    /// since DefaultHttpContext doesn't fire them through StartAsync in test contexts.
    /// </summary>
    private class TestHttpResponseFeature : IHttpResponseFeature
    {
        private readonly List<(Func<object, Task> Callback, object State)> _onStartingCallbacks = new();
        private readonly HeaderDictionary _headers = new();

        public int StatusCode { get; set; } = 200;
        public string? ReasonPhrase { get; set; }
        public IHeaderDictionary Headers { get => _headers; set { } }
        public Stream Body { get; set; } = new MemoryStream();
        public bool HasStarted { get; private set; }

        public void OnStarting(Func<object, Task> callback, object state)
        {
            _onStartingCallbacks.Add((callback, state));
        }

        public void OnCompleted(Func<object, Task> callback, object state) { }

        public async Task FireOnStartingAsync()
        {
            HasStarted = true;
            // Fire in reverse order (LIFO) like the real pipeline
            for (var i = _onStartingCallbacks.Count - 1; i >= 0; i--)
            {
                await _onStartingCallbacks[i].Callback(_onStartingCallbacks[i].State);
            }
        }
    }

    private static async Task<(HttpContext Context, TestHttpResponseFeature ResponseFeature)> InvokeMiddleware()
    {
        var responseFeature = new TestHttpResponseFeature();
        var features = new FeatureCollection();
        features.Set<IHttpResponseFeature>(responseFeature);
        features.Set<IHttpRequestFeature>(new HttpRequestFeature());

        var context = new DefaultHttpContext(features);
        var middleware = new SecurityHeaderMiddleware(_ => Task.CompletedTask);
        await middleware.InvokeAsync(context);
        await responseFeature.FireOnStartingAsync();
        return (context, responseFeature);
    }

    [Fact]
    public async Task InvokeAsync_SetsContentSecurityPolicyHeader()
    {
        var (_, response) = await InvokeMiddleware();

        Assert.True(response.Headers.ContainsKey("Content-Security-Policy"));
        var csp = response.Headers["Content-Security-Policy"].ToString();
        Assert.Contains("default-src 'self'", csp);
        Assert.Contains("script-src 'self' 'unsafe-inline' 'unsafe-eval'", csp);
        Assert.Contains("frame-ancestors 'none'", csp);
    }

    [Fact]
    public async Task InvokeAsync_SetsXContentTypeOptionsHeader()
    {
        var (_, response) = await InvokeMiddleware();
        Assert.Equal("nosniff", response.Headers["X-Content-Type-Options"].ToString());
    }

    [Fact]
    public async Task InvokeAsync_SetsXFrameOptionsHeader()
    {
        var (_, response) = await InvokeMiddleware();
        Assert.Equal("DENY", response.Headers["X-Frame-Options"].ToString());
    }

    [Fact]
    public async Task InvokeAsync_SetsXXssProtectionHeader()
    {
        var (_, response) = await InvokeMiddleware();
        Assert.Equal("1; mode=block", response.Headers["X-XSS-Protection"].ToString());
    }

    [Fact]
    public async Task InvokeAsync_SetsReferrerPolicyHeader()
    {
        var (_, response) = await InvokeMiddleware();
        Assert.Equal("strict-origin-when-cross-origin", response.Headers["Referrer-Policy"].ToString());
    }

    [Fact]
    public async Task InvokeAsync_CallsNextMiddleware()
    {
        var nextCalled = false;
        var middleware = new SecurityHeaderMiddleware(_ =>
        {
            nextCalled = true;
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(new DefaultHttpContext());

        Assert.True(nextCalled);
    }

    [Fact]
    public async Task InvokeAsync_AllFiveSecurityHeadersPresent()
    {
        var (_, response) = await InvokeMiddleware();

        var expectedHeaders = new[]
        {
            "Content-Security-Policy",
            "X-Content-Type-Options",
            "X-Frame-Options",
            "X-XSS-Protection",
            "Referrer-Policy"
        };

        foreach (var header in expectedHeaders)
        {
            Assert.True(response.Headers.ContainsKey(header), $"Missing header: {header}");
        }
    }
}
