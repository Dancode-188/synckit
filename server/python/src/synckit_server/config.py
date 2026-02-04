"""
Server configuration
"""

import warnings
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Server configuration settings"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Server
    host: str = "0.0.0.0"
    port: int = 8080
    environment: str = "development"

    # Authentication
    jwt_secret: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, v: str, info) -> str:
        """Validate JWT secret meets security requirements"""
        if len(v) < 32:
            # Warn in development, but don't fail
            warnings.warn(
                "JWT secret should be at least 32 characters for security. "
                "This is required in production.",
                UserWarning,
            )
        return v

    # Database (optional)
    database_url: str | None = None
    database_pool_min: int = 2
    database_pool_max: int = 10

    # Redis (optional)
    redis_url: str | None = None
    redis_channel_prefix: str = "synckit"

    # CORS
    cors_origins: list[str] = ["*"]


settings = Settings()
