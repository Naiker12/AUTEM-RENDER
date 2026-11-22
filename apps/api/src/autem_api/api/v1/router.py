from fastapi import APIRouter

from autem_api.api.v1 import assets, health, jobs, projects, providers, scenes, settings

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(assets.router)
api_router.include_router(providers.router)
api_router.include_router(jobs.router)
api_router.include_router(projects.router)
api_router.include_router(scenes.router)
api_router.include_router(scenes.share_router)
api_router.include_router(settings.router)
