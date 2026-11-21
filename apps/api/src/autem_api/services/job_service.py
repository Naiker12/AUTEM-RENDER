import asyncio
import tempfile
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from autem_api.config import ApiSettings
from autem_api.domain.entities import JobEntity
from autem_api.domain.enums import AssetKind, JobKind, JobStatus
from autem_api.domain.errors import (
    JobNotFoundError,
    ProviderUnavailableError,
    humanize_exception_message,
)
from autem_api.services.cost_service import CostService
from autem_api.services.image_preprocess import preprocess_image
from autem_api.services.mesh_postprocess import postprocess_mesh
from autem_api.storage.local import LocalAssetStore
from autem_api.storage.sqlite_store import SqliteStateStore
from autem_core.logging import get_logger
from autem_providers.base import ImageRenderRequest, ImageTo3DRequest, VideoRequest
from autem_providers.registry import (
    ImageProviderRegistry,
    ProviderRegistry,
    VideoProviderRegistry,
    load_default_order,
)

logger = get_logger("autem_api.job_service")

MESH_MIMES: dict[str, str] = {
    "glb": "model/gltf-binary",
    "obj": "text/plain",
    "stl": "model/stl",
}

EXPLORE_PRESETS: list[dict[str, str]] = [
    {
        "style": "photoreal",
        "material": "concrete",
        "lighting": "midday",
        "label": "Hormigón · Mediodía",
    },
    {
        "style": "photoreal",
        "material": "timber",
        "lighting": "golden_hour",
        "label": "Madera · Atardecer",
    },
    {
        "style": "photoreal",
        "material": "glass_steel",
        "lighting": "night",
        "label": "Vidrio · Noche",
    },
    {
        "style": "clay",
        "material": "stone",
        "lighting": "overcast",
        "label": "Maqueta Clay",
    },
]


class JobService:
    """Orchestrates Image-to-3D, Render, Explore, and Upscale jobs."""

    def __init__(
        self,
        settings: ApiSettings,
        registry: ProviderRegistry,
        image_registry: ImageProviderRegistry,
        video_registry: VideoProviderRegistry,
        asset_store: LocalAssetStore,
        cost_service: CostService,
        db: SqliteStateStore | None = None,
    ) -> None:
        self._settings = settings
        self._registry = registry
        self._image_registry = image_registry
        self._video_registry = video_registry
        self._asset_store = asset_store
        self._cost_service = cost_service
        self._db = db or SqliteStateStore()
        self._jobs: dict[str, JobEntity] = {}
        self._lock = threading.Lock()
        self._load_persisted_jobs()

    def _load_persisted_jobs(self) -> None:
        rows = self._db.fetchall("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200")
        for r in rows:
            entity = JobEntity(
                id=str(r["id"]),
                kind=JobKind(str(r["kind"])),
                provider_id=str(r["provider_id"]),
                status=JobStatus(str(r["status"])),
                progress=float(r["progress"]),
                message=str(r["message"]),
                params=self._db.loads(r.get("params_json"), {}),
                input_asset_ids=self._db.loads(r.get("input_asset_ids_json"), []),
                output_asset_ids=self._db.loads(r.get("output_asset_ids_json"), []),
                output_assets=self._db.loads(r.get("output_assets_json"), {}),
                output_mesh_path=r.get("output_mesh_path"),
                mesh_stats=self._db.loads(r.get("mesh_stats_json"), None),
                cost_usd=r.get("cost_usd"),
                error=r.get("error"),
                created_at=datetime.fromisoformat(str(r["created_at"])),
                started_at=(
                    datetime.fromisoformat(str(r["started_at"])) if r.get("started_at") else None
                ),
                finished_at=(
                    datetime.fromisoformat(str(r["finished_at"])) if r.get("finished_at") else None
                ),
            )
            self._jobs[entity.id] = entity

    def _persist_job(self, job: JobEntity) -> None:
        self._db.execute(
            """
            INSERT OR REPLACE INTO jobs (
                id, kind, provider_id, status, progress, message,
                params_json, input_asset_ids_json, output_asset_ids_json,
                output_assets_json, output_mesh_path, mesh_stats_json,
                cost_usd, error, created_at, started_at, finished_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job.id,
                job.kind.value,
                job.provider_id,
                job.status.value,
                job.progress,
                job.message,
                self._db.dumps(job.params),
                self._db.dumps(job.input_asset_ids),
                self._db.dumps(job.output_asset_ids),
                self._db.dumps(job.output_assets),
                job.output_mesh_path,
                self._db.dumps(job.mesh_stats) if job.mesh_stats is not None else None,
                job.cost_usd,
                job.error,
                job.created_at.isoformat(),
                job.started_at.isoformat() if job.started_at else None,
                job.finished_at.isoformat() if job.finished_at else None,
            ),
        )

    def list_jobs(self) -> list[JobEntity]:
        with self._lock:
            return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def get_job(self, job_id: str) -> JobEntity:
        with self._lock:
            job = self._jobs.get(job_id)
        if not job:
            raise JobNotFoundError(f"Job {job_id} no encontrado")
        return job

    def _resolve_input_paths(self, asset_ids: list[str], image_paths: list[str]) -> list[str]:
        resolved: list[str] = []
        for asset_id in asset_ids:
            record = self._asset_store.get(asset_id)
            if record is not None and record.path.exists():
                resolved.append(str(record.path))
        for raw_path in image_paths:
            candidate = Path(raw_path)
            if candidate.exists() and candidate.is_file():
                resolved.append(str(candidate))
        if not resolved:
            raise ValueError(
                "Debes subir al menos una imagen real (PNG, JPEG o WebP) antes de generar."
            )
        return resolved

    def _require_available_provider(
        self,
        order: list[str],
        category: str = "3d",
    ) -> float | None:
        reg: Any = (
            self._image_registry
            if category == "image"
            else self._video_registry
            if category == "video"
            else self._registry
        )
        for pid in order:
            provider = reg.get(pid)
            if provider and provider.is_available():
                return float(provider.info.est_cost_usd) if provider.info.est_cost_usd else 0.0
        raise ProviderUnavailableError(
            "No hay ningún provider configurado y activo para esta operación. "
            "Configura FAL_KEY en Configuración o inicia ComfyUI local."
        )

    def create_image_to_3d_job(
        self,
        asset_ids: list[str] | None = None,
        image_paths: list[str] | None = None,
        provider_id: str = "auto",
        seed: int | None = None,
        target_height_m: float | None = None,
        export_formats: list[str] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> JobEntity:
        job_id = str(uuid.uuid4())
        input_ids = list(asset_ids or [])
        resolved_paths = self._resolve_input_paths(input_ids, list(image_paths or []))
        formats = tuple(export_formats or ["glb", "obj", "stl"])

        order = (
            load_default_order(self._settings.providers_config_path, "image_to_3d")
            if provider_id == "auto"
            else [provider_id]
        )
        self._cost_service.check_budget(self._require_available_provider(order))

        job = JobEntity(
            id=job_id,
            kind=JobKind.IMAGE_TO_3D,
            provider_id=provider_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            message="En cola",
            input_asset_ids=input_ids,
            params={
                "image_paths": resolved_paths,
                "seed": seed,
                "target_height_m": target_height_m,
                "export_formats": list(formats),
                "order": order,
                **(extra or {}),
            },
        )
        with self._lock:
            self._jobs[job_id] = job
        self._persist_job(job)

        if self._settings.autem_inline_jobs:
            thread = threading.Thread(
                target=self._run_inline_image_to_3d,
                args=(job_id, order, resolved_paths, seed, target_height_m, formats, extra or {}),
                daemon=True,
            )
            thread.start()
        else:
            self._dispatch_to_celery(job_id, order, resolved_paths, seed, extra or {})

        return job

    def compare_image_to_3d_jobs(
        self,
        provider_ids: list[str],
        asset_ids: list[str] | None = None,
        image_paths: list[str] | None = None,
        seed: int | None = None,
        target_height_m: float | None = None,
    ) -> list[JobEntity]:
        jobs: list[JobEntity] = []
        for idx, pid in enumerate(provider_ids):
            job = self.create_image_to_3d_job(
                asset_ids=asset_ids,
                image_paths=image_paths,
                provider_id=pid,
                seed=(seed + idx) if seed is not None else (42 + idx),
                target_height_m=target_height_m,
            )
            jobs.append(job)
        return jobs

    def create_render_job(
        self,
        asset_id: str | None = None,
        prompt: str = "Modern architectural residence, sharp reflections",
        style: str = "photoreal",
        material: str = "concrete",
        lighting: str = "midday",
        resolution: str = "2k",
        strength: float = 0.65,
        provider_id: str = "auto",
        seed: int | None = None,
        label: str | None = None,
    ) -> JobEntity:
        job_id = str(uuid.uuid4())
        order = (
            load_default_order(self._settings.providers_config_path, "image")
            if provider_id == "auto"
            else [provider_id]
        )
        self._cost_service.check_budget(
            self._require_available_provider(order, category="image")
        )

        source_path: str | None = None
        input_ids: list[str] = []
        if asset_id:
            rec = self._asset_store.get(asset_id)
            if rec and rec.path.exists():
                source_path = str(rec.path)
                input_ids = [asset_id]

        req = ImageRenderRequest(
            image_path=source_path,
            prompt=prompt,
            style=style,
            material=material,
            lighting=lighting,
            resolution=resolution,
            strength=strength,
            seed=seed,
        )
        job = JobEntity(
            id=job_id,
            kind=JobKind.RENDER,
            provider_id=provider_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            message="En cola",
            input_asset_ids=input_ids,
            params={
                "prompt": prompt,
                "style": style,
                "material": material,
                "lighting": lighting,
                "resolution": resolution,
                "seed": seed,
                "label": label or f"{style} · {material} · {lighting}",
            },
        )
        with self._lock:
            self._jobs[job_id] = job
        self._persist_job(job)

        thread = threading.Thread(
            target=self._run_inline_image_job,
            args=(job_id, order, req),
            daemon=True,
        )
        thread.start()
        return job

    def create_explore_jobs(
        self,
        asset_id: str | None = None,
        prompt: str = "Modern architectural residence",
        provider_id: str = "auto",
        seed: int | None = 42,
    ) -> list[JobEntity]:
        jobs: list[JobEntity] = []
        for idx, preset in enumerate(EXPLORE_PRESETS):
            jobs.append(
                self.create_render_job(
                    asset_id=asset_id,
                    prompt=prompt,
                    style=preset["style"],
                    material=preset["material"],
                    lighting=preset["lighting"],
                    provider_id=provider_id,
                    seed=(seed + idx) if seed is not None else (42 + idx),
                    label=preset["label"],
                )
            )
        return jobs

    def create_upscale_job(
        self,
        asset_id: str,
        scale: int = 2,
        provider_id: str = "auto",
    ) -> JobEntity:
        rec = self._asset_store.get(asset_id)
        if not rec or not rec.path.exists():
            raise JobNotFoundError(f"Asset {asset_id} no encontrado para upscale")

        job_id = str(uuid.uuid4())
        order = (
            load_default_order(self._settings.providers_config_path, "upscale")
            if provider_id == "auto"
            else [provider_id]
        )
        self._cost_service.check_budget(
            self._require_available_provider(order, category="image")
        )

        req = ImageRenderRequest(
            image_path=str(rec.path),
            prompt="High-resolution architectural upscale",
            upscale_factor=scale,
        )
        job = JobEntity(
            id=job_id,
            kind=JobKind.UPSCALE,
            provider_id=provider_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            message="En cola (Upscale)",
            input_asset_ids=[asset_id],
            params={"scale": scale, "label": f"Upscale {scale}x"},
        )
        with self._lock:
            self._jobs[job_id] = job
        self._persist_job(job)

        thread = threading.Thread(
            target=self._run_inline_image_job,
            args=(job_id, order, req),
            daemon=True,
        )
        thread.start()
        return job

    def create_video_job(
        self,
        mode: str,
        start_asset_id: str | None = None,
        end_asset_id: str | None = None,
        prompt: str = "Smooth architectural camera motion, natural daylight",
        camera_motion: str = "push_in",
        seconds: int = 5,
        provider_id: str = "auto",
        seed: int | None = None,
    ) -> JobEntity:
        job_id = str(uuid.uuid4())
        order = (
            load_default_order(self._settings.providers_config_path, "video")
            if provider_id == "auto"
            else [provider_id]
        )
        self._cost_service.check_budget(
            self._require_available_provider(order, category="video")
        )

        input_ids: list[str] = []
        start_path: str | None = None
        end_path: str | None = None

        if start_asset_id:
            rec = self._asset_store.get(start_asset_id)
            if rec and rec.path.exists():
                start_path = str(rec.path)
                input_ids.append(start_asset_id)
        if end_asset_id:
            rec_end = self._asset_store.get(end_asset_id)
            if rec_end and rec_end.path.exists():
                end_path = str(rec_end.path)
                input_ids.append(end_asset_id)

        if not start_path:
            raise ValueError("Debes subir una imagen inicial real antes de generar video.")
        if mode == "transition" and not end_path:
            raise ValueError("El modo Transición requiere imagen inicial y final.")

        req = VideoRequest(
            mode=mode,
            start_image_path=start_path,
            end_image_path=end_path,
            prompt=prompt,
            camera_motion=camera_motion,
            seconds=seconds,
            seed=seed,
        )
        label = (
            f"Transición FLF2V ({seconds}s)"
            if mode == "transition"
            else f"Animar · {camera_motion} ({seconds}s)"
        )
        job = JobEntity(
            id=job_id,
            kind=JobKind.VIDEO,
            provider_id=provider_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            message="En cola (Video)",
            input_asset_ids=input_ids,
            params={
                "mode": mode,
                "prompt": prompt,
                "camera_motion": camera_motion,
                "seconds": seconds,
                "label": label,
            },
        )
        with self._lock:
            self._jobs[job_id] = job
        self._persist_job(job)

        thread = threading.Thread(
            target=self._run_inline_video_job,
            args=(job_id, order, req),
            daemon=True,
        )
        thread.start()
        return job

    def _run_inline_video_job(
        self,
        job_id: str,
        order: list[str],
        req: VideoRequest,
    ) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(UTC)
            job.message = "Iniciando generación de video..."

        def on_progress(progress: float, message: str) -> None:
            with self._lock:
                current = self._jobs[job_id]
                if current.status == JobStatus.CANCELED:
                    return
                current.progress = max(0.0, min(0.95, progress))
                current.message = message

        try:
            result = self._video_registry.run_with_fallback(order, req, on_progress)
            self._cost_service.record_cost(result.cost_usd)

            asset = self._asset_store.save_file(
                source_path=Path(result.video_path),
                filename=f"autem_video_{job_id[:8]}.{result.ext}",
                mime=result.mime,
                kind=AssetKind.VIDEO,
                meta={"job_id": job_id, "seconds": result.seconds, "mode": req.mode},
            )
            with self._lock:
                current = self._jobs[job_id]
                if current.status != JobStatus.CANCELED:
                    current.status = JobStatus.SUCCEEDED
                    current.progress = 1.0
                    current.message = f"Video listo ({result.seconds}s · {result.ext.upper()})"
                    current.provider_id = result.provider_id
                    current.output_assets = {result.ext: asset.id}
                    current.output_asset_ids = [asset.id]
                    current.cost_usd = result.cost_usd
                    current.finished_at = datetime.now(UTC)
            self._persist_job(current)
        except Exception as exc:
            logger.error("video_job.failed", job_id=job_id, error=str(exc))
            title, detail, _ = humanize_exception_message(str(exc))
            with self._lock:
                current = self._jobs[job_id]
                current.status = JobStatus.FAILED
                current.error = detail
                current.message = title
                current.finished_at = datetime.now(UTC)
            self._persist_job(current)

    def cancel_job(self, job_id: str) -> JobEntity:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                raise JobNotFoundError(f"Job {job_id} no encontrado")
            if job.status in (JobStatus.QUEUED, JobStatus.RUNNING):
                job.status = JobStatus.CANCELED
                job.message = "Cancelado por el usuario"
                job.finished_at = datetime.now(UTC)
            return job

    def _run_inline_image_job(
        self,
        job_id: str,
        order: list[str],
        req: ImageRenderRequest,
    ) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(UTC)
            job.message = "Iniciando render..."

        def on_progress(progress: float, message: str) -> None:
            with self._lock:
                current = self._jobs[job_id]
                if current.status == JobStatus.CANCELED:
                    return
                current.progress = max(0.0, min(0.95, progress))
                current.message = message

        try:
            result = self._image_registry.run_with_fallback(order, req, on_progress)
            self._cost_service.record_cost(result.cost_usd)

            asset = self._asset_store.save_file(
                source_path=Path(result.image_path),
                filename=f"autem_render_{job_id[:8]}.png",
                mime="image/png",
                kind=AssetKind.IMAGE,
                meta={"job_id": job_id, "width": result.width, "height": result.height},
            )
            with self._lock:
                current = self._jobs[job_id]
                if current.status != JobStatus.CANCELED:
                    current.status = JobStatus.SUCCEEDED
                    current.progress = 1.0
                    current.message = f"Listo ({result.width}×{result.height})"
                    current.provider_id = result.provider_id
                    current.output_assets = {"png": asset.id}
                    current.output_asset_ids = [asset.id]
                    current.cost_usd = result.cost_usd
                    current.finished_at = datetime.now(UTC)
            self._persist_job(current)
        except Exception as exc:
            logger.error("image_job.failed", job_id=job_id, error=str(exc))
            title, detail, _ = humanize_exception_message(str(exc))
            with self._lock:
                current = self._jobs[job_id]
                current.status = JobStatus.FAILED
                current.error = detail
                current.message = title
                current.finished_at = datetime.now(UTC)
            self._persist_job(current)

    def _run_inline_image_to_3d(
        self,
        job_id: str,
        order: list[str],
        image_paths: list[str],
        seed: int | None,
        target_height_m: float | None,
        export_formats: tuple[str, ...],
        extra: dict[str, Any],
    ) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(UTC)
            job.message = "Preprocesando imágenes..."

        def on_progress(progress: float, message: str) -> None:
            with self._lock:
                current = self._jobs[job_id]
                if current.status == JobStatus.CANCELED:
                    return
                current.progress = max(0.0, min(0.95, progress))
                current.message = message

        try:
            remove_bg = bool(extra.get("remove_bg", False))
            raw_face_limit = extra.get("polygon_limit") or extra.get("face_limit")
            face_limit = int(raw_face_limit) if isinstance(raw_face_limit, (int, float)) else None

            prepared_paths: list[str] = []
            for raw_path in image_paths:
                candidate = Path(raw_path)
                if candidate.exists() and candidate.is_file():
                    prepared_paths.append(str(preprocess_image(candidate, remove_bg=remove_bg)))
                else:
                    prepared_paths.append(raw_path)

            req = ImageTo3DRequest(
                image_paths=prepared_paths,
                texture=bool(extra.get("pbr", True)),
                face_limit=face_limit,
                seed=seed,
                extra=extra,
            )
            result = self._registry.run_with_fallback(order, req, on_progress)
            self._cost_service.record_cost(result.cost_usd)

            on_progress(0.92, "Postprocesando malla (escala, ejes y exportación)...")
            post_dir = Path(tempfile.mkdtemp(prefix=f"autem_post_{job_id[:8]}_"))
            post = postprocess_mesh(
                input_mesh_path=Path(result.mesh_path),
                output_dir=post_dir,
                target_height_m=target_height_m,
                face_limit=face_limit,
                formats=export_formats,
            )

            output_assets: dict[str, str] = {}
            output_asset_ids: list[str] = []
            for fmt, file_path in post.exports.items():
                asset = self._asset_store.save_file(
                    source_path=file_path,
                    filename=f"autem_{job_id[:8]}.{fmt}",
                    mime=MESH_MIMES.get(fmt, "application/octet-stream"),
                    kind=AssetKind.MESH,
                    meta={"job_id": job_id, "format": fmt, "provider_id": result.provider_id},
                )
                output_assets[fmt] = asset.id
                output_asset_ids.append(asset.id)

            with self._lock:
                current = self._jobs[job_id]
                if current.status != JobStatus.CANCELED:
                    current.status = JobStatus.SUCCEEDED
                    current.progress = 1.0
                    current.message = "Modelo 3D listo"
                    current.provider_id = result.provider_id
                    current.output_mesh_path = str(post.exports.get("glb", result.mesh_path))
                    current.output_assets = output_assets
                    current.output_asset_ids = output_asset_ids
                    current.mesh_stats = post.stats
                    current.cost_usd = result.cost_usd
                    current.finished_at = datetime.now(UTC)
            self._persist_job(current)
        except Exception as exc:
            logger.error("job.failed", job_id=job_id, error=str(exc))
            title, detail, _ = humanize_exception_message(str(exc))
            with self._lock:
                current = self._jobs[job_id]
                current.status = JobStatus.FAILED
                current.error = detail
                current.message = title
                current.finished_at = datetime.now(UTC)
            self._persist_job(current)

    def _dispatch_to_celery(
        self,
        job_id: str,
        order: list[str],
        image_paths: list[str],
        seed: int | None,
        extra: dict[str, Any],
    ) -> None:
        from celery import Celery

        celery = Celery("autem_api_client", broker=self._settings.redis_url)
        celery.send_task(
            "autem_worker.tasks.image_to_3d.run_image_to_3d",
            kwargs={
                "job_id": job_id,
                "order": order,
                "image_paths": image_paths,
                "seed": seed,
                "extra": extra,
            },
        )

    async def stream_job_events(self, job_id: str) -> Any:
        """Async generator yielding job snapshots until terminal status."""
        last_key: tuple[str, float, str] | None = None
        while True:
            job = self.get_job(job_id)
            key = (job.status.value, round(job.progress, 3), job.message)
            if key != last_key:
                last_key = key
                yield job
            if job.status in (JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELED):
                break
            await asyncio.sleep(0.2)
