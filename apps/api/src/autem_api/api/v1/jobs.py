import json
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from autem_api.deps import get_cost_service, get_job_service
from autem_api.domain.entities import JobEntity
from autem_api.domain.errors import JobNotFoundError, ProviderUnavailableError
from autem_api.services.cost_service import CostService, DailyCostLimitError
from autem_api.services.job_service import JobService

router = APIRouter(prefix="/jobs", tags=["jobs"])
JobServiceDep = Annotated[JobService, Depends(get_job_service)]
CostServiceDep = Annotated[CostService, Depends(get_cost_service)]


class CreateImageTo3DJobRequest(BaseModel):
    asset_ids: list[str] = Field(default_factory=list, max_length=4)
    image_paths: list[str] = Field(default_factory=list)
    provider_id: str = Field(default="auto")
    seed: int | None = Field(default=None)
    target_height_m: float | None = Field(default=None, gt=0.1, le=500.0)
    export_formats: list[str] = Field(default_factory=lambda: ["glb", "obj", "stl"])
    extra: dict[str, Any] = Field(default_factory=dict)


class CompareImageTo3DRequest(BaseModel):
    asset_ids: list[str] = Field(default_factory=list, max_length=4)
    image_paths: list[str] = Field(default_factory=list)
    provider_ids: list[str] = Field(min_length=2, max_length=4)
    seed: int | None = Field(default=42)
    target_height_m: float | None = Field(default=None, gt=0.1, le=500.0)


class CreateRenderJobRequest(BaseModel):
    asset_id: str | None = Field(default=None)
    prompt: str = Field(default="Modern architectural house, photorealistic, crisp details")
    style: str = Field(default="photoreal")
    material: str = Field(default="concrete")
    lighting: str = Field(default="midday")
    resolution: str = Field(default="2k")
    strength: float = Field(default=0.65, ge=0.1, le=1.0)
    provider_id: str = Field(default="auto")
    seed: int | None = Field(default=None)


class ExploreRenderRequest(BaseModel):
    asset_id: str | None = Field(default=None)
    prompt: str = Field(default="Modern architectural house")
    provider_id: str = Field(default="auto")
    seed: int | None = Field(default=42)


class UpscaleJobRequest(BaseModel):
    asset_id: str
    scale: int = Field(default=2, ge=2, le=4)
    provider_id: str = Field(default="auto")


class VideoAnimateRequest(BaseModel):
    asset_id: str | None = Field(default=None)
    prompt: str = Field(default="Smooth architectural camera push-in, crisp daylight")
    camera_motion: str = Field(default="push_in")
    seconds: int = Field(default=5, ge=3, le=8)
    provider_id: str = Field(default="auto")
    seed: int | None = Field(default=None)


class VideoTransitionRequest(BaseModel):
    start_asset_id: str | None = Field(default=None)
    end_asset_id: str | None = Field(default=None)
    prompt: str = Field(default="Cinematic architectural transition between two lighting moods")
    seconds: int = Field(default=5, ge=3, le=8)
    provider_id: str = Field(default="auto")
    seed: int | None = Field(default=None)


class JobOut(BaseModel):
    id: str
    kind: str
    provider_id: str
    status: str
    progress: float
    message: str
    params: dict[str, Any]
    input_asset_ids: list[str]
    output_assets: dict[str, str]
    output_mesh_path: str | None
    mesh_stats: dict[str, Any] | None
    cost_usd: float | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    @classmethod
    def from_entity(cls, job: JobEntity) -> "JobOut":
        return cls(
            id=job.id,
            kind=job.kind.value,
            provider_id=job.provider_id,
            status=job.status.value,
            progress=job.progress,
            message=job.message,
            params=job.params,
            input_asset_ids=job.input_asset_ids,
            output_assets=job.output_assets,
            output_mesh_path=job.output_mesh_path,
            mesh_stats=job.mesh_stats,
            cost_usd=job.cost_usd,
            error=job.error,
            created_at=job.created_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
        )


@router.get("", response_model=list[JobOut])
def list_jobs(service: JobServiceDep) -> list[JobOut]:
    return [JobOut.from_entity(job) for job in service.list_jobs()]


@router.get("/cost/summary")
def get_cost_summary(cost_service: CostServiceDep) -> dict[str, Any]:
    return cost_service.summary()


@router.get("/cost/ledger")
def get_cost_ledger(cost_service: CostServiceDep) -> dict[str, Any]:
    return cost_service.ledger()


@router.post("/image-to-3d", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def create_image_to_3d_job(
    payload: CreateImageTo3DJobRequest,
    service: JobServiceDep,
) -> JobOut:
    try:
        job = service.create_image_to_3d_job(
            asset_ids=payload.asset_ids,
            image_paths=payload.image_paths,
            provider_id=payload.provider_id,
            seed=payload.seed,
            target_height_m=payload.target_height_m,
            export_formats=payload.export_formats,
            extra=payload.extra,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except DailyCostLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)
        ) from exc
    return JobOut.from_entity(job)


@router.post(
    "/image-to-3d/compare",
    response_model=list[JobOut],
    status_code=status.HTTP_202_ACCEPTED,
)
def compare_image_to_3d_jobs(
    payload: CompareImageTo3DRequest,
    service: JobServiceDep,
) -> list[JobOut]:
    try:
        jobs = service.compare_image_to_3d_jobs(
            provider_ids=payload.provider_ids,
            asset_ids=payload.asset_ids,
            image_paths=payload.image_paths,
            seed=payload.seed,
            target_height_m=payload.target_height_m,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except DailyCostLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)
        ) from exc
    return [JobOut.from_entity(job) for job in jobs]


@router.post("/render", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def create_render_job(
    payload: CreateRenderJobRequest,
    service: JobServiceDep,
) -> JobOut:
    try:
        job = service.create_render_job(
            asset_id=payload.asset_id,
            prompt=payload.prompt,
            style=payload.style,
            material=payload.material,
            lighting=payload.lighting,
            resolution=payload.resolution,
            strength=payload.strength,
            provider_id=payload.provider_id,
            seed=payload.seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except DailyCostLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)
        ) from exc
    return JobOut.from_entity(job)


@router.post("/render/explore", response_model=list[JobOut], status_code=status.HTTP_202_ACCEPTED)
def explore_renders(
    payload: ExploreRenderRequest,
    service: JobServiceDep,
) -> list[JobOut]:
    try:
        jobs = service.create_explore_jobs(
            asset_id=payload.asset_id,
            prompt=payload.prompt,
            provider_id=payload.provider_id,
            seed=payload.seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except DailyCostLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)
        ) from exc
    return [JobOut.from_entity(job) for job in jobs]


@router.post("/upscale", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def create_upscale_job(
    payload: UpscaleJobRequest,
    service: JobServiceDep,
) -> JobOut:
    try:
        job = service.create_upscale_job(
            asset_id=payload.asset_id,
            scale=payload.scale,
            provider_id=payload.provider_id,
        )
    except JobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except DailyCostLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)
        ) from exc
    return JobOut.from_entity(job)


@router.post("/video/animate", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def create_video_animate_job(
    payload: VideoAnimateRequest,
    service: JobServiceDep,
) -> JobOut:
    try:
        job = service.create_video_job(
            mode="animate",
            start_asset_id=payload.asset_id,
            prompt=payload.prompt,
            camera_motion=payload.camera_motion,
            seconds=payload.seconds,
            provider_id=payload.provider_id,
            seed=payload.seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except DailyCostLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)
        ) from exc
    return JobOut.from_entity(job)


@router.post("/video/transition", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def create_video_transition_job(
    payload: VideoTransitionRequest,
    service: JobServiceDep,
) -> JobOut:
    try:
        job = service.create_video_job(
            mode="transition",
            start_asset_id=payload.start_asset_id,
            end_asset_id=payload.end_asset_id,
            prompt=payload.prompt,
            seconds=payload.seconds,
            provider_id=payload.provider_id,
            seed=payload.seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except DailyCostLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)
        ) from exc
    return JobOut.from_entity(job)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, service: JobServiceDep) -> JobOut:
    try:
        return JobOut.from_entity(service.get_job(job_id))
    except JobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{job_id}/cancel", response_model=JobOut)
def cancel_job(job_id: str, service: JobServiceDep) -> JobOut:
    try:
        return JobOut.from_entity(service.cancel_job(job_id))
    except JobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{job_id}/events")
async def stream_job_events(
    job_id: str,
    service: JobServiceDep,
) -> StreamingResponse:
    try:
        service.get_job(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    async def event_generator() -> AsyncIterator[str]:
        async for job in service.stream_job_events(job_id):
            data = JobOut.from_entity(job).model_dump(mode="json")
            yield f"data: {json.dumps(data)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
