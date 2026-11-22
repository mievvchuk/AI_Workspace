from functools import lru_cache
import os
from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOCAL_ORIGIN = "http://localhost:5173"


def normalize_database_url(url: str) -> str:
    """Neon/Vercel hand out postgres://...?sslmode=require; SQLAlchemy's asyncpg driver wants
    postgresql+asyncpg:// and takes TLS through connect_args, not libpq query parameters."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    if url.startswith("postgresql+asyncpg://") and "?" in url:
        base, query = url.split("?", 1)
        kept = [p for p in query.split("&") if p.split("=", 1)[0] not in {"sslmode", "channel_binding"}]
        url = base + ("?" + "&".join(kept) if kept else "")
    return url

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    environment: Literal["development", "production", "test"] = "development"
    database_url: str = f"sqlite+aiosqlite:///{(BASE_DIR / 'data' / 'workspace.db').as_posix()}"
    upload_dir: Path = BASE_DIR / "data" / "uploads"
    frontend_origin: str = LOCAL_ORIGIN
    # Public origin the browser uses for /api (Vite proxies /api in dev, so cookies share one origin)
    public_api_url: str = LOCAL_ORIGIN
    # Built frontend (frontend/dist) served by this app in production; unset in development.
    static_dir: Path | None = None

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

    @model_validator(mode="after")
    def _hosted_origin(self) -> "Settings":
        # The service's own https URL is the origin for both the app and /api, so the Google
        # redirect URI and the CORS origin follow the real domain unless set explicitly.
        external = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
        if not external and os.environ.get("VERCEL"):
            # Production uses the stable project domain; previews use their own deployment URL.
            host = os.environ.get("VERCEL_PROJECT_PRODUCTION_URL") if os.environ.get("VERCEL_ENV") == "production" else None
            host = host or os.environ.get("VERCEL_URL", "")
            external = f"https://{host}" if host else ""
            self.cookie_secure = True
            if self.max_upload_mb > 4:
                self.max_upload_mb = 4  # Vercel Functions reject request bodies over 4.5 MB
            if self.upload_dir == BASE_DIR / "data" / "uploads":
                self.upload_dir = Path("/tmp/uploads")  # the only writable path on Vercel
        if external:
            if self.public_api_url == LOCAL_ORIGIN:
                self.public_api_url = external
            if self.frontend_origin == LOCAL_ORIGIN:
                self.frontend_origin = external
        self.database_url = normalize_database_url(self.database_url)
        return self

    @property
    def serverless(self) -> bool:
        """Vercel Functions: no persistent disk, no work after the response, many short-lived instances."""
        return bool(os.environ.get("VERCEL"))

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def ai_configured(self) -> bool:
        return self.ai_provider == "mock" or bool(self.nvidia_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()

