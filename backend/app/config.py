from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    environment: Literal["development", "production", "test"] = "development"
    database_url: str = f"sqlite+aiosqlite:///{(BASE_DIR / 'data' / 'workspace.db').as_posix()}"
    upload_dir: Path = BASE_DIR / "data" / "uploads"
    frontend_origin: str = "http://localhost:5173"
    # Public origin the browser uses for /api (Vite proxies /api in dev, so cookies share one origin)
    public_api_url: str = "http://localhost:5173"

    # Auth
    session_ttl_days: int = 30
    cookie_secure: bool = False
    google_client_id: str = ""
    google_client_secret: str = ""

    # AI. "mock" is only for automated tests / explicitly labelled local demo.
    ai_provider: Literal["nvidia", "mock"] = "nvidia"
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    default_model: str = "nvidia/nemotron-3.5-super-vl-120b-a12b"
    ai_timeout_seconds: float = 120.0
    user_daily_token_limit: int = 500_000

    # Limits
    max_upload_mb: int = 20
    ai_event_retention_days: int = 30
    rate_limit_per_minute: int = 30

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def ai_configured(self) -> bool:
        return self.ai_provider == "mock" or bool(self.nvidia_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()

