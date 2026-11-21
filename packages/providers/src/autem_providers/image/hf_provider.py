import os
import tempfile
from pathlib import Path

import httpx
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
from autem_providers.image.fal_provider import _build_arch_prompt


class HuggingFaceImageProvider(ImageProvider):
    """Hugging Face Free Inference API (FLUX.1-schnell, free account HF_TOKEN)."""

    MODEL_URL = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell"

    def __init__(self) -> None:
        self.info = ProviderInfo(
            id="hf.flux-schnell",
            label="Hugging Face FLUX.1-schnell (Gratis)",
            kind=ProviderKind.RENDER,
            where=Where.API,
            est_cost_usd=0.0,
            est_seconds=10,
            outputs=("png",),
            notes="Plan gratuito de Hugging Face Inference usando HF_TOKEN sin tarjeta.",
        )

    def is_available(self) -> bool:
        return bool(os.getenv("HF_TOKEN", "").strip())

    def run(self, req: ImageRenderRequest, on_progress: ProgressCb) -> ImageRenderResult:
        token = os.getenv("HF_TOKEN", "").strip()
        if not token:
            raise RuntimeError("HF_TOKEN no configurado.")

        prompt = _build_arch_prompt(req)
        on_progress(0.25, "Generando en Hugging Face FLUX.1-schnell (Gratis)")

        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                self.MODEL_URL,
                headers={"Authorization": f"Bearer {token}"},
                json={"inputs": prompt},
            )
            resp.raise_for_status()

        out_dir = Path(tempfile.mkdtemp(prefix="autem_hf_"))
        out_path = out_dir / "render.png"
        out_path.write_bytes(resp.content)

        with Image.open(out_path) as im:
            im.convert("RGB").save(out_path, format="PNG")
            width, height = im.size

        on_progress(1.0, "Render completado")
        return ImageRenderResult(
            image_path=str(out_path),
            provider_id=self.info.id,
            cost_usd=0.0,
            width=width,
            height=height,
            raw_metadata={"model": "FLUX.1-schnell", "free": True},
        )
