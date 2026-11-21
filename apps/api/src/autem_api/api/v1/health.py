from fastapi import APIRouter

from autem_api.config import get_api_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str | bool]:
    settings = get_api_settings()
    return {
        "status": "ok",
        "service": "autem-api",
        "env": settings.autem_env,
        "inline_jobs": settings.autem_inline_jobs,
    }
