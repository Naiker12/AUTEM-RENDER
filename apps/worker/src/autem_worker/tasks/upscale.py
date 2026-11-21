from typing import Any

from autem_core.logging import get_logger
from autem_providers.base import ImageRenderRequest
from autem_providers.registry import build_default_image_registry
from autem_worker.celery_app import celery_app

logger = get_logger("autem_worker.tasks.upscale")


@celery_app.task(name="autem_worker.tasks.upscale.run_upscale")
def run_upscale(
    job_id: str,
    order: list[str],
    image_path: str,
    scale: int = 2,
) -> dict[str, Any]:
    """Execute an upscale job via the image provider registry."""
    registry = build_default_image_registry()

    def on_progress(progress: float, message: str) -> None:
        logger.info("worker.upscale.progress", job_id=job_id, progress=progress, message=message)

    req = ImageRenderRequest(
        image_path=image_path,
        prompt="High-resolution architectural upscale",
        upscale_factor=scale,
    )
    result = registry.run_with_fallback(order, req, on_progress)
    return {
        "job_id": job_id,
        "provider_id": result.provider_id,
        "image_path": result.image_path,
        "width": result.width,
        "height": result.height,
        "cost_usd": result.cost_usd,
    }
