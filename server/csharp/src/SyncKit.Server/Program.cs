using Serilog;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;
using SyncKit.Server.Health;
using SyncKit.Server.WebSockets;

// Bootstrap logger for startup errors
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    Log.Information("Starting SyncKit server...");

    var builder = WebApplication.CreateBuilder(args);

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

    // Add auth services
    builder.Services.AddSyncKitAuth();

    // Add health check services
    builder.Services.AddSyncKitHealthChecks();

    // Add WebSocket services
    builder.Services.AddSyncKitWebSockets();

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

