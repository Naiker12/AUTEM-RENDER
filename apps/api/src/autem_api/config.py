from functools import lru_cache

from autem_core.config import CoreSettings


class ApiSettings(CoreSettings):
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"
    # En desarrollo sin Docker/Redis, ejecuta el pipeline en background local.
    # Cambia a false cuando levantes Redis + Celery worker.
    autem_inline_jobs: bool = True
    # Auth JWT y cifrado de API keys (activa autem_require_auth=true en producción)
    autem_require_auth: bool = False
    jwt_secret: str = "change-me-in-production-autem-render-secret-key-32bytes"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 días
    storage_backend: str = "local"  # "local" | "s3"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_api_settings() -> ApiSettings:
    return ApiSettings()
