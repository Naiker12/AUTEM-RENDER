from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]


class CoreSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    autem_env: str = "development"
    autem_log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://autem:autem_dev_password@localhost:5432/autem_render"
    redis_url: str = "redis://localhost:6379/0"

    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "autem-assets"
    s3_region: str = "us-east-1"

    fal_key: str | None = None
    comfyui_url: str = "http://localhost:8188"
    daily_cost_limit_usd: float = 5.0
    providers_config_path: Path = REPO_ROOT / "config" / "providers.yaml"


@lru_cache(maxsize=1)
def get_core_settings() -> CoreSettings:
    return CoreSettings()
