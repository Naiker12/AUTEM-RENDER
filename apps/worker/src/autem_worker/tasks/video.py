from typing import Any

from autem_core.logging import get_logger
from autem_providers.base import VideoRequest
from autem_providers.registry import build_default_video_registry
from autem_worker.celery_app import celery_app

logger = get_logger("autem_worker.tasks.video")


@celery_app.task(name="autem_worker.tasks.video.run_video")
def run_video(
    job_id: str,
    order: list[str],
    mode: str = "animate",
    start_image_path: str | None = None,
    end_image_path: str | None = None,
    prompt: str = "Smooth architectural camera motion",
    camera_motion: str = "push_in",
    seconds: int = 5,
    seed: int | None = None,
) -> dict[str, Any]:
    """Execute an animate or FLF2V transition video job via the video provider registry."""
    registry = build_default_video_registry()

    def on_progress(progress: float, message: str) -> None:
        logger.info("worker.video.progress", job_id=job_id, progress=progress, message=message)

    req = VideoRequest(
        mode=mode,
        start_image_path=start_image_path,
        end_image_path=end_image_path,
        prompt=prompt,
        camera_motion=camera_motion,
        seconds=seconds,
        seed=seed,
    )
    result = registry.run_with_fallback(order, req, on_progress)
    return {
        "job_id": job_id,
        "provider_id": result.provider_id,
        "video_path": result.video_path,
        "mime": result.mime,
        "ext": result.ext,
        "seconds": result.seconds,
        "cost_usd": result.cost_usd,
    }
