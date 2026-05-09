from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """앱 설정."""

    # Database
    database_url: str = "postgresql+asyncpg://timelapse:timelapse123@db:5432/study_timelapse"

    # App
    secret_key: str = "change-me"
    debug: bool = False

    # CORS
    cors_origins: str = "*"

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

    # Debug (stage only) — ALLOW_DEBUG_SUBSCRIPTION=1 설정 시 debug 라우터 등록
    allow_debug_subscription: bool = False

    # RevenueCat (Phase 2) — 미설정 시 webhook 라우터 미등록, verify/sync 503 응답
    revenuecat_api_key: str = ""
    revenuecat_webhook_auth_token: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
