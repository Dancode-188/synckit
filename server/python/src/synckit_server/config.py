"""
Server configuration
"""

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
