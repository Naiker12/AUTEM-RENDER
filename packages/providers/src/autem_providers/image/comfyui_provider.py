import os
from pathlib import Path

from PIL import Image

from autem_providers.base import (
    ImageProvider,
    ImageRenderRequest,
    ImageRenderResult,
    ProgressCb,
    ProviderInfo,
    ProviderKind,
    Where,
)
from autem_providers.comfyui_client import ComfyUIClient
from autem_providers.image.fal_provider import _build_arch_prompt


class ComfyUIImageProvider(ImageProvider):
    """Local ComfyUI adapter (:8188) executing workflows/render_img2img.json."""

    def __init__(
        self,
        base_url: str | None = None,
        workflow_path: Path = Path("workflows/render_img2img.json"),
    ) -> None:
        self.base_url = (base_url or os.getenv("COMFYUI_URL") or "http://localhost:8188").rstrip(
            "/"
        )
        self.workflow_path = workflow_path
        self.info = ProviderInfo(
            id="comfyui.render",
            label="ComfyUI Local (ControlNet / Flux)",
            kind=ProviderKind.RENDER,
            where=Where.LOCAL,
            est_cost_usd=0.0,
            est_seconds=25,
            outputs=("png",),
            notes="Ejecuta workflows/render_img2img.json en ComfyUI local (:8188).",
        )

    def _client(self) -> ComfyUIClient:
        url = (os.getenv("COMFYUI_URL") or self.base_url).rstrip("/")
        return ComfyUIClient(url)

    def is_available(self) -> bool:
        return self._client().is_healthy() and self.workflow_path.exists()

    def run(self, req: ImageRenderRequest, on_progress: ProgressCb) -> ImageRenderResult:
        client = self._client()
        uploaded_name = ""
        if req.image_path and Path(req.image_path).exists():
            on_progress(0.10, "Subiendo imagen a ComfyUI local")
            uploaded_name = client.upload_image(Path(req.image_path))

        out_path = client.run_workflow(
            workflow_path=self.workflow_path,
            replacements={
                "IMAGE_NAME": uploaded_name,
                "PROMPT": _build_arch_prompt(req),
                "SEED": req.seed if req.seed is not None else 42,
                "STRENGTH": req.strength,
            },
            on_progress=on_progress,
            expected_exts=(".png", ".jpg", ".jpeg", ".webp"),
        )
        with Image.open(out_path) as im:
            width, height = im.size
        on_progress(1.0, "Render local completado")
        return ImageRenderResult(
            image_path=str(out_path),
            provider_id=self.info.id,
            cost_usd=0.0,
            width=width,
            height=height,
            raw_metadata={"comfyui_url": client.base_url},
        )
