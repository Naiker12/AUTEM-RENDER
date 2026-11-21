import os
import tempfile
from pathlib import Path
from typing import Any

import fal_client
import httpx

from autem_providers.base import (
    ProgressCb,
    ProviderInfo,
    ProviderKind,
    VideoProvider,
    VideoRequest,
    VideoResult,
    Where,
)


def _extract_video_url(result: dict[str, Any]) -> str:
    video = result.get("video")
    if isinstance(video, dict) and isinstance(video.get("url"), str):
        return str(video["url"])
    if isinstance(video, str) and video.startswith("http"):
        return video
    raise ValueError(f"No se encontró URL de video en respuesta de fal.ai: {list(result)}")


class FalVideoProvider(VideoProvider):
    def __init__(
        self,
        endpoint_id: str,
        label: str,
        est_cost_usd: float = 0.40,
        est_seconds: int = 60,
        notes: str = "",
    ) -> None:
        self.endpoint_id = endpoint_id
        self.info = ProviderInfo(
            id=f"fal.{endpoint_id}",
            label=label,
            kind=ProviderKind.VIDEO,
            where=Where.API,
            est_cost_usd=est_cost_usd,
            est_seconds=est_seconds,
            outputs=("mp4",),
            notes=notes,
        )

    def is_available(self) -> bool:
        return bool(os.getenv("FAL_KEY"))

    def run(self, req: VideoRequest, on_progress: ProgressCb) -> VideoResult:
        if not req.start_image_path or not Path(req.start_image_path).exists():
            raise ValueError("Se requiere una imagen inicial para generar video en fal.ai.")

        on_progress(0.10, "Subiendo cuadro inicial a fal.ai")
        arguments: dict[str, Any] = {
            "image_url": fal_client.upload_file(req.start_image_path),
            "prompt": f"{req.prompt}, camera motion: {req.camera_motion}",
            **req.extra,
        }
        if req.mode == "transition" and req.end_image_path and Path(req.end_image_path).exists():
            arguments["end_image_url"] = fal_client.upload_file(req.end_image_path)
        if req.seed is not None:
            arguments["seed"] = req.seed

        on_progress(0.30, f"Generando video ({req.seconds}s) en {self.info.label}")
        result: dict[str, Any] = fal_client.subscribe(
            self.endpoint_id,
            arguments=arguments,
            with_logs=False,
        )
        video_url = _extract_video_url(result)

        on_progress(0.85, "Descargando MP4")
        out_dir = Path(tempfile.mkdtemp(prefix="autem_fal_vid_"))
        out_path = out_dir / "video.mp4"
        with httpx.Client(timeout=180.0) as client:
            resp = client.get(video_url)
            resp.raise_for_status()
            out_path.write_bytes(resp.content)

        on_progress(1.0, "Video listo")
        return VideoResult(
            video_path=str(out_path),
            mime="video/mp4",
            ext="mp4",
            provider_id=self.info.id,
            cost_usd=self.info.est_cost_usd,
            seconds=req.seconds,
            raw_metadata=result,
        )
