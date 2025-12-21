using Microsoft.Extensions.DependencyInjection;

namespace SyncKit.Server.Auth;

/// <summary>
/// DI helpers for authentication services.
/// </summary>
public static class AuthExtensions
{
    public static IServiceCollection AddSyncKitAuth(this IServiceCollection services)
    {
        services.AddSingleton<IJwtValidator, JwtValidator>();
        services.AddSingleton<IApiKeyValidator, ApiKeyValidator>();
        return services;
    }
}
