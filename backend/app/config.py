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

    model_config = {"env_file": ".env"}


settings = Settings()
