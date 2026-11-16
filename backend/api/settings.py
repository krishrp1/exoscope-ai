"""Runtime configuration, read from environment variables or a .env file."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="EXOSCOPE_", env_file=(".env", "backend/.env"), extra="ignore")

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    max_upload_mb: float = 10.0
    max_upload_rows: int = 500_000
    max_batch_size: int = 25
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
