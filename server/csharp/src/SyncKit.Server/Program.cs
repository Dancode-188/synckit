using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Serilog;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;
using SyncKit.Server.Health;
using SyncKit.Server.Security;
using SyncKit.Server.WebSockets;
using SyncKit.Server.Storage;

// Bootstrap logger for startup errors
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    Log.Information("Starting SyncKit server...");

    var builder = WebApplication.CreateBuilder(args);

    // URL binding precedence (highest to lowest):
    // 1. SYNCKIT_SERVER_URL env var (SyncKit-specific, for test harness compatibility)
    // 2. --urls CLI argument (standard ASP.NET Core)
    // 3. ASPNETCORE_URLS env var (standard ASP.NET Core)
    // 4. Kestrel configuration in appsettings.json
    // 5. launchSettings.json (development only)
    // 6. Default: http://localhost:8080
    var syncKitServerUrl = Environment.GetEnvironmentVariable("SYNCKIT_SERVER_URL");

    // Configure Kestrel for high-connection scenarios
    // This addresses a known .NET runtime bug on macOS (dotnet/runtime#47020)
    // where burst connections can cause SocketAddress validation errors
    builder.WebHost.ConfigureKestrel((context, serverOptions) =>
    {
        // Parse URL for port binding
        int port = 8080;
        IPAddress address = IPAddress.Any;

        if (!string.IsNullOrEmpty(syncKitServerUrl))
        {
            var httpUrl = syncKitServerUrl
                .Replace("ws://", "http://")
                .Replace("wss://", "https://");
            if (httpUrl.EndsWith("/ws"))
                httpUrl = httpUrl[..^3];

            if (Uri.TryCreate(httpUrl, UriKind.Absolute, out var uri))
            {
                port = uri.Port > 0 ? uri.Port : 8080;
                if (uri.Host == "localhost" || uri.Host == "127.0.0.1")
                    address = IPAddress.Loopback;
            }
            Log.Information("Using SYNCKIT_SERVER_URL: {Url} (port: {Port})", httpUrl, port);
        }

        serverOptions.Listen(address, port, listenOptions =>
        {
            // Configure socket options to mitigate macOS socket accept race condition
            // See: dotnet/runtime#47020
            listenOptions.UseConnectionLogging();
        });

        // Limit concurrent connections to prevent overwhelming socket accept
        // Higher values for performance testing; macOS may hit socket race condition
        // See: dotnet/runtime#47020
        serverOptions.Limits.MaxConcurrentConnections = 50000; // TODO: An environment variable should take precedence over this hardcoded limit
        serverOptions.Limits.MaxConcurrentUpgradedConnections = 50000; // TODO: An environment variable should take precedence over this hardcoded limit

        // Set reasonable request timeouts
        serverOptions.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(30);
        serverOptions.Limits.KeepAliveTimeout = TimeSpan.FromMinutes(2);
    });

    // Add global exception handler for unhandled socket exceptions
    // This helps survive the macOS socket accept race condition
    AppDomain.CurrentDomain.UnhandledException += (sender, args) =>
    {
        var ex = args.ExceptionObject as Exception;
        if (ex?.Message.Contains("SocketAddress") == true)
        {
            Log.Warning(ex, "Socket accept race condition detected (macOS issue). Server continuing...");
            // Note: IsTerminating will be true, so we can't actually prevent the crash
            // This logging helps diagnose the issue
        }
        else
        {
            Log.Fatal(ex, "Unhandled exception in AppDomain");
        }
    };

    if (!string.IsNullOrEmpty(syncKitServerUrl))
    {
        var httpUrl = syncKitServerUrl
            .Replace("ws://", "http://")
            .Replace("wss://", "https://");
        if (httpUrl.EndsWith("/ws"))
            httpUrl = httpUrl[..^3];
        Log.Information("Using SYNCKIT_SERVER_URL: {Url}", httpUrl);
    }


    // Configure Serilog from appsettings.json
    builder.Host.UseSerilog((context, services, configuration) => configuration
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .Enrich.WithMachineName()
        .Enrich.WithThreadId());

    // Add services to the container
    builder.Services.AddOpenApi();

    // Add controller services
    builder.Services.AddControllers();

    // Add SyncKit configuration with environment variable support and validation
    builder.Services.AddSyncKitConfiguration(builder.Configuration);

    // Register storage provider (in-memory or postgres)
    // Register storage, awareness, and optional pub/sub based on configuration
    builder.Services.AddSyncKitStorage(builder.Configuration);

    // Add auth services
    builder.Services.AddSyncKitAuth();

    // Add CORS policy
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("SyncKitCorsPolicy", policy =>
        {
            var syncKitConfig = builder.Configuration.GetSection(SyncKitConfig.SectionName).Get<SyncKitConfig>();
            var origins = syncKitConfig?.CorsAllowedOrigins ?? ["*"];

            if (origins.Length == 1 && origins[0] == "*")
            {
                policy.AllowAnyOrigin()
                      .AllowAnyMethod()
                      .AllowAnyHeader();
            }
            else
            {
                policy.WithOrigins(origins)
                      .AllowAnyMethod()
                      .AllowAnyHeader()
                      .AllowCredentials();
            }
        });
    });

    // Add rate limiting
    builder.Services.AddRateLimiter(options =>
    {
        var syncKitConfig = builder.Configuration.GetSection(SyncKitConfig.SectionName).Get<SyncKitConfig>();
        var permitLimit = syncKitConfig?.RateLimitPerMinute ?? 100;

        options.AddFixedWindowLimiter("fixed", limiterOptions =>
        {
            limiterOptions.PermitLimit = permitLimit;
            limiterOptions.Window = TimeSpan.FromMinutes(1);
            limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            limiterOptions.QueueLimit = 0;
        });

        options.OnRejected = async (context, cancellationToken) =>
        {
            context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            await context.HttpContext.Response.WriteAsync("Rate limit exceeded. Try again later.", cancellationToken);
        };

        options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = permitLimit,
                    Window = TimeSpan.FromMinutes(1),
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    QueueLimit = 0
                }));
    });

    // Add health check services
    builder.Services.AddSyncKitHealthChecks(builder.Configuration);

    // Add WebSocket services
    builder.Services.AddSyncKitWebSockets();

    // Background cleanup service for expired awareness entries
    builder.Services.AddHostedService<SyncKit.Server.Awareness.AwarenessCleanupService>();

    var app = builder.Build();

    // Add Serilog request logging
    app.UseSerilogRequestLogging(options =>
    {
        options.MessageTemplate = "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.0000} ms";
        options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
        {
            diagnosticContext.Set("RequestHost", httpContext.Request.Host.Value);
            diagnosticContext.Set("UserAgent", httpContext.Request.Headers.UserAgent.ToString());
        };
    });

    // Security headers (CSP, X-Frame-Options, etc.)
    app.UseMiddleware<SecurityHeaderMiddleware>();

    // CORS
    app.UseCors("SyncKitCorsPolicy");

    // Rate limiting
    app.UseRateLimiter();

    // Configure the HTTP request pipeline
    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
    }

    // Map controller endpoints (including /auth routes)
    app.MapControllers();

    // Map health check endpoints (matches TypeScript server + Kubernetes probes)
    app.MapSyncKitHealthEndpoints();

    // Enable WebSocket support with SyncKit middleware
    app.UseSyncKitWebSockets();


    // Attempt to connect storage provider; FallbackStorageAdapter handles degradation
    var storage = app.Services.GetRequiredService<IStorageAdapter>();
    await storage.ConnectAsync();
    if (storage is FallbackStorageAdapter fallback && fallback.IsUsingFallback)
    {
        Log.Warning("Storage provider unavailable — running with in-memory storage (data will not persist across restarts)");
    }
    else
    {
        Log.Information("Storage provider connected and validated");
    }

    // Mark server as ready to accept traffic
    SyncKitReadinessHealthCheck.SetReady(true);

    Log.Information("SyncKit server started successfully");
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "SyncKit server terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

