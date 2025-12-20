using Serilog;
using SyncKit.Server.Configuration;

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

    // Add SyncKit configuration with environment variable support and validation
    builder.Services.AddSyncKitConfiguration(builder.Configuration);

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

    // Health check endpoint
    app.MapGet("/health", () => Results.Ok(new { status = "healthy" }))
        .WithName("HealthCheck")
        .WithDescription("Health check endpoint for the SyncKit server");

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

