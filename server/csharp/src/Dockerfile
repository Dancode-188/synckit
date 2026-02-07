# =============================================================================
# SyncKit .NET Server - Multi-stage Dockerfile
# =============================================================================
# Build: docker build -t synckit-server .
# Run:   docker run -p 8080:8080 -e JWT_SECRET=your-secret synckit-server
#
# Build arguments:
#   --build-arg VARIANT=alpine  - Use Alpine-based image (smaller, ~100MB)
#   --build-arg VARIANT=debian  - Use Debian-based image (default, ~380MB)
# =============================================================================

# Build argument for image variant
ARG VARIANT=alpine

# -----------------------------------------------------------------------------
# Build stage - Uses full SDK for compilation
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0-preview-alpine AS build
WORKDIR /src

# Copy solution and project files first for better layer caching
COPY SyncKit.Server.sln .
COPY Directory.Build.props .
COPY SyncKit.Server/SyncKit.Server.csproj SyncKit.Server/
COPY SyncKit.Server.Tests/SyncKit.Server.Tests.csproj SyncKit.Server.Tests/

# Restore dependencies (cached unless project files change)
RUN dotnet restore SyncKit.Server.sln

# Copy source code
COPY SyncKit.Server/ SyncKit.Server/
COPY SyncKit.Server.Tests/ SyncKit.Server.Tests/

# Build and publish release version
WORKDIR /src/SyncKit.Server
RUN dotnet publish -c Release -o /app/publish --no-restore \
    /p:UseAppHost=false \
    /p:PublishTrimmed=false

# -----------------------------------------------------------------------------
# Runtime stage (Alpine) - Minimal runtime image (~100MB)
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview-alpine AS runtime-alpine
WORKDIR /app

# Install curl for health checks (Alpine uses apk)
RUN apk add --no-cache curl

# Create non-root user for security
RUN adduser -D -u 1001 appuser

# Copy published application
COPY --from=build /app/publish .

# Set ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Configure ASP.NET Core
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

# Expose port
EXPOSE 8080

# Health check - verifies the application is responding
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Entry point
ENTRYPOINT ["dotnet", "SyncKit.Server.dll"]

# -----------------------------------------------------------------------------
# Runtime stage (Debian) - Full runtime image (~380MB)
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS runtime-debian
WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd --uid 1001 --create-home appuser

# Copy published application
COPY --from=build /app/publish .

# Set ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Configure ASP.NET Core
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

# Expose port
EXPOSE 8080

# Health check - verifies the application is responding
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Entry point
ENTRYPOINT ["dotnet", "SyncKit.Server.dll"]

# -----------------------------------------------------------------------------
# Final stage - Select runtime based on VARIANT arg
# -----------------------------------------------------------------------------
FROM runtime-${VARIANT} AS runtime
