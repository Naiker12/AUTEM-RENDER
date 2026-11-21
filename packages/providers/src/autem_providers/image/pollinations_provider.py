import tempfile
import urllib.parse
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


class PollinationsImageProvider(ImageProvider):
    """Real free-to-use Flux image generation via Pollinations.ai (no API key, $0.00)."""

    def __init__(self) -> None:
        self.info = ProviderInfo(
            id="pollinations.flux",
            label="Pollinations Flux (Gratis · Sin API Key)",
            kind=ProviderKind.RENDER,
            where=Where.API,
            est_cost_usd=0.0,
            est_seconds=12,
            outputs=("png",),
            notes=(
                "Generación arquitectónica real con Flux a costo $0 "
                "sin necesidad de tarjeta ni clave."
            ),
        )

    def is_available(self) -> bool:
        return True

    def run(self, req: ImageRenderRequest, on_progress: ProgressCb) -> ImageRenderResult:
        prompt = _build_arch_prompt(req)
        encoded = urllib.parse.quote(prompt)
        seed_q = f"&seed={req.seed}" if req.seed is not None else ""
        url = (
            f"https://image.pollinations.ai/prompt/{encoded}"
            f"?model=flux&width=1024&height=768&nologo=true{seed_q}"
        )

        on_progress(0.25, "Generando render gratis en Pollinations Flux")
        with httpx.Client(timeout=90.0, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()

        out_dir = Path(tempfile.mkdtemp(prefix="autem_poll_"))
        out_path = out_dir / "render.png"
        out_path.write_bytes(resp.content)

        with Image.open(out_path) as im:
            im.convert("RGB").save(out_path, format="PNG")
            width, height = im.size

        on_progress(1.0, "Render gratis completado")
        return ImageRenderResult(
            image_path=str(out_path),
            provider_id=self.info.id,
            cost_usd=0.0,
            width=width,
            height=height,
            raw_metadata={"provider": "pollinations.ai", "free": True},
        )
