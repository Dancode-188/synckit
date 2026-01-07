using System.Net;
using Serilog;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;
using SyncKit.Server.Health;
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
        // Lower values help avoid the macOS SocketAddress race condition
        serverOptions.Limits.MaxConcurrentConnections = 1000;
        serverOptions.Limits.MaxConcurrentUpgradedConnections = 1000;

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

    // Add Aspire service defaults when running under Aspire orchestration
    // This provides OpenTelemetry, service discovery, and resilience patterns
    var isAspireManaged = !string.IsNullOrEmpty(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);
    if (isAspireManaged)
    {
        builder.AddServiceDefaults();
        Log.Information("Running under Aspire orchestration - service defaults enabled");
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

    // Map Aspire default endpoints when running under orchestration
    if (isAspireManaged)
    {
        app.MapDefaultEndpoints();
    }

    // Attempt to connect storage provider and fail fast if necessary
    try
    {
        var storage = app.Services.GetRequiredService<IStorageAdapter>();
        await storage.ConnectAsync();
        Log.Information("Storage provider connected and validated");
    }
    catch (Exception ex)
    {
        Log.Fatal(ex, "Storage provider failed to connect or validate. Exiting.");
        return;
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

