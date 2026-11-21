from functools import lru_cache

from autem_api.config import get_api_settings
from autem_api.services.cost_service import CostService
from autem_api.services.job_service import JobService
from autem_api.services.scene_service import SceneService
from autem_api.storage.local import LocalAssetStore
from autem_api.storage.sqlite_store import SqliteStateStore
from autem_providers.registry import (
    ImageProviderRegistry,
    ProviderRegistry,
    VideoProviderRegistry,
    build_default_image_registry,
    build_default_image_to_3d_registry,
    build_default_video_registry,
)


@lru_cache(maxsize=1)
def get_state_store() -> SqliteStateStore:
    return SqliteStateStore()


@lru_cache(maxsize=1)
def get_provider_registry() -> ProviderRegistry:
    return build_default_image_to_3d_registry()


@lru_cache(maxsize=1)
def get_image_provider_registry() -> ImageProviderRegistry:
    return build_default_image_registry()


@lru_cache(maxsize=1)
def get_video_provider_registry() -> VideoProviderRegistry:
    return build_default_video_registry()


@lru_cache(maxsize=1)
def get_asset_store() -> LocalAssetStore:
    return LocalAssetStore(db=get_state_store())


@lru_cache(maxsize=1)
def get_cost_service() -> CostService:
    settings = get_api_settings()
    return CostService(daily_limit_usd=settings.daily_cost_limit_usd, db=get_state_store())


@lru_cache(maxsize=1)
def get_job_service() -> JobService:
    return JobService(
        settings=get_api_settings(),
        registry=get_provider_registry(),
        image_registry=get_image_provider_registry(),
        video_registry=get_video_provider_registry(),
        asset_store=get_asset_store(),
        cost_service=get_cost_service(),
        db=get_state_store(),
    )


@lru_cache(maxsize=1)
def get_scene_service() -> SceneService:
    return SceneService(
        asset_store=get_asset_store(),
        job_service=get_job_service(),
        db=get_state_store(),
    )
