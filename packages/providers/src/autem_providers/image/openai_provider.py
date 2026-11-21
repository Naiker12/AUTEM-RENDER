import base64
import os
import tempfile
from pathlib import Path
from typing import Any

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


class OpenAIImageProvider(ImageProvider):
    """Official OpenAI Image API adapter (gpt-image-1, requires OPENAI_API_KEY)."""

    def __init__(self, model: str = "gpt-image-1") -> None:
        self.model = model
        self.info = ProviderInfo(
            id=f"openai.{model}",
            label="OpenAI gpt-image-1",
            kind=ProviderKind.RENDER,
            where=Where.API,
            est_cost_usd=0.06,
            est_seconds=20,
            outputs=("png",),
            notes="Render y edición arquitectónica fotorrealista vía OpenAI API.",
        )

    def is_available(self) -> bool:
        return bool(os.getenv("OPENAI_API_KEY", "").strip())

    def run(self, req: ImageRenderRequest, on_progress: ProgressCb) -> ImageRenderResult:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY no configurada.")

        prompt = _build_arch_prompt(req)
        headers = {"Authorization": f"Bearer {api_key}"}

        with httpx.Client(timeout=180.0) as client:
            if req.image_path and Path(req.image_path).exists():
                on_progress(0.25, "Editando imagen base en OpenAI gpt-image-1")
                img_path = Path(req.image_path)
                with img_path.open("rb") as fh:
                    resp = client.post(
                        "https://api.openai.com/v1/images/edits",
                        headers=headers,
                        files={"image": (img_path.name, fh, "image/png")},
                        data={"model": self.model, "prompt": prompt, "size": "1536x1024"},
                    )
            else:
                on_progress(0.25, "Generando render en OpenAI gpt-image-1")
                resp = client.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={**headers, "Content-Type": "application/json"},
                    json={"model": self.model, "prompt": prompt, "size": "1536x1024"},
                )

            resp.raise_for_status()
            payload: dict[str, Any] = resp.json()
            item = payload["data"][0]

            out_dir = Path(tempfile.mkdtemp(prefix="autem_oai_"))
            out_path = out_dir / "render.png"
            if "b64_json" in item:
                out_path.write_bytes(base64.b64decode(item["b64_json"]))
            elif "url" in item:
                dl = client.get(item["url"])
                dl.raise_for_status()
                out_path.write_bytes(dl.content)
            else:
                raise ValueError("Respuesta inesperada de OpenAI Images API.")

        with Image.open(out_path) as im:
            width, height = im.size

        on_progress(1.0, "Render completado")
        return ImageRenderResult(
            image_path=str(out_path),
            provider_id=self.info.id,
            cost_usd=self.info.est_cost_usd,
            width=width,
            height=height,
            raw_metadata={"model": self.model},
        )
