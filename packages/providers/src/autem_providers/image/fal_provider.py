import os
import tempfile
from pathlib import Path
from typing import Any

import fal_client
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


def _build_arch_prompt(req: ImageRenderRequest) -> str:
    style_map = {
        "photoreal": (
            "photorealistic architectural photography, sharp glass reflections, natural shadows"
        ),
        "clay": (
            "architectural clay model render, matte off-white plaster, soft studio occlusion"
        ),
        "linework": (
            "clean architectural ink linework drawing on warm paper, precise perspective lines"
        ),
    }
    lighting_map = {
        "midday": "bright midday sunlight, crisp shadows, clear sky",
        "golden_hour": "warm golden hour sunset lighting, long dramatic shadows, glowing interior",
        "night": "architectural night photography, deep twilight sky, warm interior lighting",
        "overcast": "soft overcast diffused daylight, balanced exposure",
    }
    style_desc = style_map.get(req.style, style_map["photoreal"])
    light_desc = lighting_map.get(req.lighting, lighting_map["midday"])
    return f"{req.prompt}. {style_desc}. Primary material: {req.material}. Lighting: {light_desc}."


def _extract_image_url(result: dict[str, Any]) -> str:
    images = result.get("images")
    if isinstance(images, list) and images and isinstance(images[0], dict):
        url = images[0].get("url")
        if isinstance(url, str):
            return url
    image = result.get("image")
    if isinstance(image, dict) and isinstance(image.get("url"), str):
        return str(image["url"])
    raise ValueError(f"No se encontró URL de imagen en respuesta de fal.ai: {list(result)}")


class FalImageProvider(ImageProvider):
    def __init__(
        self,
        endpoint_id: str,
        label: str,
        kind: ProviderKind = ProviderKind.RENDER,
        est_cost_usd: float = 0.04,
        est_seconds: int = 18,
        notes: str = "",
    ) -> None:
        self.endpoint_id = endpoint_id
        self.info = ProviderInfo(
            id=f"fal.{endpoint_id}",
            label=label,
            kind=kind,
            where=Where.API,
            est_cost_usd=est_cost_usd,
            est_seconds=est_seconds,
            outputs=("png",),
            notes=notes,
        )

    def is_available(self) -> bool:
        return bool(os.getenv("FAL_KEY"))

    def run(self, req: ImageRenderRequest, on_progress: ProgressCb) -> ImageRenderResult:
        arguments: dict[str, Any] = {**req.extra}
        has_image = bool(req.image_path and Path(req.image_path).exists())
        if has_image and req.image_path:
            on_progress(0.10, "Subiendo imagen base a fal.ai")
            arguments["image_url"] = fal_client.upload_file(req.image_path)
        elif "image-to-image" in self.endpoint_id or self.info.kind == ProviderKind.UPSCALE:
            raise ValueError(
                f"{self.info.label} requiere una imagen base subida. "
                "Sube un boceto/foto o selecciona Flux Pro 1.1 Ultra."
            )

        if self.info.kind == ProviderKind.RENDER:
            arguments["prompt"] = _build_arch_prompt(req)
            arguments.setdefault("strength", req.strength)
            if req.seed is not None:
                arguments["seed"] = req.seed
        elif req.upscale_factor:
            arguments.setdefault("scale_factor", req.upscale_factor)

        on_progress(0.35, f"Generando en {self.info.label}")
        result: dict[str, Any] = fal_client.subscribe(
            self.endpoint_id,
            arguments=arguments,
            with_logs=False,
        )
        img_url = _extract_image_url(result)

        on_progress(0.85, "Descargando imagen generada")
        out_dir = Path(tempfile.mkdtemp(prefix="autem_fal_img_"))
        out_path = out_dir / "render.png"
        with httpx.Client(timeout=120.0) as client:
            resp = client.get(img_url)
            resp.raise_for_status()
            out_path.write_bytes(resp.content)

        with Image.open(out_path) as im:
            width, height = im.size

        on_progress(1.0, "Completado")
        return ImageRenderResult(
            image_path=str(out_path),
            provider_id=self.info.id,
            cost_usd=self.info.est_cost_usd,
            width=width,
            height=height,
            raw_metadata=result,
        )
