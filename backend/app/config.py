from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """앱 설정."""

    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/study_timelapse"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 30
    debug: bool = False

    model_config = {"env_file": ".env"}


settings = Settings()
