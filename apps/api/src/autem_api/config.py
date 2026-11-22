from functools import lru_cache

from autem_core.config import CoreSettings


class ApiSettings(CoreSettings):
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"
    # En modo local de un solo usuario, ejecuta el pipeline en background con tope de concurrencia.
    autem_inline_jobs: bool = True
    # Token opcional para uso remoto (túnel / GPU remota). Vacío = modo local sin login.
    autem_access_token: str = ""
    storage_backend: str = "local"  # "local" | "s3"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_api_settings() -> ApiSettings:
    return ApiSettings()
