from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """앱 설정."""

    # Database
    database_url: str = "postgresql+asyncpg://timelapse:timelapse123@db:5432/study_timelapse"

    # App
    secret_key: str = "change-me"
    debug: bool = False

    # Upload
    upload_dir: str = "/code/uploads"
    max_upload_size_mb: int = 2048

    # CORS
    cors_origins: str = "http://localhost:5173"

    # JWT
    jwt_secret_key: str = "jwt-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # Google OAuth
    google_client_id: str = ""

    # Apple OAuth
    apple_client_id: str = "com.focustimelapse.app"
    apple_team_id: str = ""

    model_config = {"env_file": ".env"}


settings = Settings()
