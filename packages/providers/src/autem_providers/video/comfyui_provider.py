import os
from pathlib import Path

from autem_providers.base import (
    ProgressCb,
    ProviderInfo,
    ProviderKind,
    VideoProvider,
    VideoRequest,
    VideoResult,
    Where,
)
from autem_providers.comfyui_client import ComfyUIClient


class ComfyUIVideoProvider(VideoProvider):
    """Local ComfyUI video provider for Wan 2.2 (animate) and LTX-2.5 (FLF2V transition)."""

    def __init__(
        self,
        provider_id: str,
        label: str,
        notes: str,
        workflow_path: Path,
        base_url: str | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("COMFYUI_URL") or "http://localhost:8188").rstrip(
            "/"
        )
        self.workflow_path = workflow_path
        self.info = ProviderInfo(
            id=provider_id,
            label=label,
            kind=ProviderKind.VIDEO,
            where=Where.LOCAL,
            est_cost_usd=0.0,
            est_seconds=90,
            outputs=("mp4",),
            notes=notes,
        )

    def _client(self) -> ComfyUIClient:
        url = (os.getenv("COMFYUI_URL") or self.base_url).rstrip("/")
        return ComfyUIClient(url)

    def is_available(self) -> bool:
        return self._client().is_healthy() and self.workflow_path.exists()

    def run(self, req: VideoRequest, on_progress: ProgressCb) -> VideoResult:
        if not req.start_image_path or not Path(req.start_image_path).exists():
            raise ValueError("Se requiere una imagen inicial para generar video en ComfyUI.")
        client = self._client()
        on_progress(0.10, "Subiendo cuadro(s) a ComfyUI local")
        start_name = client.upload_image(Path(req.start_image_path))
        end_name = ""
        if req.end_image_path and Path(req.end_image_path).exists():
            end_name = client.upload_image(Path(req.end_image_path))

        out_path = client.run_workflow(
            workflow_path=self.workflow_path,
            replacements={
                "START_IMAGE": start_name,
                "END_IMAGE": end_name,
                "PROMPT": f"{req.prompt}, camera motion: {req.camera_motion}",
                "SECONDS": req.seconds,
                "SEED": req.seed if req.seed is not None else 42,
            },
            on_progress=on_progress,
            expected_exts=(".mp4", ".webm"),
            timeout_seconds=600,
        )
        ext = out_path.suffix.lstrip(".").lower() or "mp4"
        mime = "video/webm" if ext == "webm" else "video/mp4"
        on_progress(1.0, "Video local completado")
        return VideoResult(
            video_path=str(out_path),
            mime=mime,
            ext=ext,
            provider_id=self.info.id,
            cost_usd=0.0,
            seconds=req.seconds,
            raw_metadata={"comfyui_url": client.base_url},
        )
