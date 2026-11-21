from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from autem_api.deps import (
    get_image_provider_registry,
    get_provider_registry,
    get_video_provider_registry,
)
from autem_providers.registry import ImageProviderRegistry, ProviderRegistry, VideoProviderRegistry

router = APIRouter(prefix="/providers", tags=["providers"])
RegistryDep = Annotated[ProviderRegistry, Depends(get_provider_registry)]
ImageRegistryDep = Annotated[ImageProviderRegistry, Depends(get_image_provider_registry)]
VideoRegistryDep = Annotated[VideoProviderRegistry, Depends(get_video_provider_registry)]


class ProviderOut(BaseModel):
    id: str
    label: str
    kind: str
    where: str
    available: bool
    est_cost_usd: float | None
    est_seconds: int
    outputs: list[str]
    notes: str


@router.get("", response_model=list[ProviderOut])
def list_providers(
    registry: RegistryDep,
    image_registry: ImageRegistryDep,
    video_registry: VideoRegistryDep,
    kind: Annotated[str | None, Query()] = None,
    only_available: Annotated[bool, Query()] = False,
) -> list[ProviderOut]:
    combined = [*registry.all_info(), *image_registry.all_info(), *video_registry.all_info()]
    results: list[ProviderOut] = []
    for info, available in combined:
        if kind and info.kind.value != kind:
            continue
        if only_available and not available:
            continue
        results.append(
            ProviderOut(
                id=info.id,
                label=info.label,
                kind=info.kind.value,
                where=info.where.value,
                available=available,
                est_cost_usd=info.est_cost_usd,
                est_seconds=info.est_seconds,
                outputs=list(info.outputs),
                notes=info.notes,
            )
        )
    return results
