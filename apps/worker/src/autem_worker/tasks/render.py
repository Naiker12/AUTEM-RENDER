from typing import Any

from autem_core.logging import get_logger
from autem_providers.base import ImageRenderRequest
from autem_providers.registry import build_default_image_registry
from autem_worker.celery_app import celery_app

logger = get_logger("autem_worker.tasks.render")


@celery_app.task(name="autem_worker.tasks.render.run_render")
def run_render(
    job_id: str,
    order: list[str],
    prompt: str,
    image_path: str | None = None,
    style: str = "photoreal",
    material: str = "concrete",
    lighting: str = "midday",
    resolution: str = "2k",
    strength: float = 0.65,
    seed: int | None = None,
) -> dict[str, Any]:
    """Execute an architectural render job via the image provider registry."""
    registry = build_default_image_registry()

    def on_progress(progress: float, message: str) -> None:
        logger.info("worker.render.progress", job_id=job_id, progress=progress, message=message)

    req = ImageRenderRequest(
        image_path=image_path,
        prompt=prompt,
        style=style,
        material=material,
        lighting=lighting,
        resolution=resolution,
        strength=strength,
        seed=seed,
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
