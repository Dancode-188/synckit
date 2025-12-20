using SyncKit.Server.Configuration;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddOpenApi();

// Add SyncKit configuration with environment variable support and validation
builder.Services.AddSyncKitConfiguration(builder.Configuration);

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }))
    .WithName("HealthCheck")
    .WithDescription("Health check endpoint for the SyncKit server");

app.Run();

