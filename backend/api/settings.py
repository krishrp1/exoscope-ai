"""Runtime configuration, read from environment variables or a .env file."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="EXOSCOPE_", env_file=(".env", "backend/.env"), extra="ignore")

    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,https://exoscope-ai.vercel.app"
    # Vercel preview deployments; CORSMiddleware does not understand "*.vercel.app" in cors_origins.
    cors_origin_regex: str = r"https://exoscope-ai[a-z0-9-]*\.vercel\.app"
    # Free hosting cannot retrain; set EXOSCOPE_TRAINING_ENABLED=false there so visitors cannot overwrite the model.
    training_enabled: bool = True
    max_upload_mb: float = 10.0
    max_upload_rows: int = 500_000
    max_batch_size: int = 25
    predict_per_minute: int = 20  # per client IP, POST /api/predict*
    max_inline_points: int = 500_000
    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
