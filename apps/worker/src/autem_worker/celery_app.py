from celery import Celery

from autem_core.config import get_core_settings
from autem_core.logging import configure_logging

settings = get_core_settings()
configure_logging(settings.autem_log_level)

celery_app = Celery(
    "autem_worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "autem_worker.tasks.image_to_3d",
        "autem_worker.tasks.render",
        "autem_worker.tasks.upscale",
        "autem_worker.tasks.video",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
)

import autem_worker.tasks.image_to_3d  # noqa: E402, F401
import autem_worker.tasks.render  # noqa: E402, F401
import autem_worker.tasks.upscale  # noqa: E402, F401
import autem_worker.tasks.video  # noqa: E402, F401
