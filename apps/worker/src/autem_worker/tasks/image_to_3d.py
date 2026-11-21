from typing import Any

from autem_core.logging import get_logger
from autem_providers.base import ImageTo3DRequest
from autem_providers.registry import build_default_image_to_3d_registry
from autem_worker.celery_app import celery_app

logger = get_logger("autem_worker.tasks.image_to_3d")


@celery_app.task(name="autem_worker.tasks.image_to_3d.run_image_to_3d")
def run_image_to_3d(
    job_id: str,
    order: list[str],
    image_paths: list[str],
    seed: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute an Image-to-3D job using the provider registry with automatic fallback."""
    registry = build_default_image_to_3d_registry()

    def on_progress(progress: float, message: str) -> None:
        logger.info("worker.progress", job_id=job_id, progress=progress, message=message)

    req = ImageTo3DRequest(image_paths=image_paths, seed=seed, extra=extra or {})
    result = registry.run_with_fallback(order, req, on_progress)
    return {
        "job_id": job_id,
        "provider_id": result.provider_id,
        "mesh_path": result.mesh_path,
        "cost_usd": result.cost_usd,
        "raw_metadata": result.raw_metadata,
    }
