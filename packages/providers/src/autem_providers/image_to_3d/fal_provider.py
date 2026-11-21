import os
import tempfile
from pathlib import Path
from typing import Any

import fal_client
import httpx

from autem_providers.base import (
    ImageTo3DProvider,
    ImageTo3DRequest,
    ImageTo3DResult,
    ProgressCb,
    ProviderInfo,
    ProviderKind,
    Where,
)


def _extract_glb_url(result: dict[str, Any]) -> str:
    """Handle common fal.ai 3D output schemas (model_mesh, glb, mesh, base_model)."""
    for key in ("model_mesh", "glb", "mesh", "base_model", "pbr_model"):
        value = result.get(key)
        if isinstance(value, dict) and isinstance(value.get("url"), str):
            return str(value["url"])
        if isinstance(value, str) and value.startswith("http"):
            return value
    raise ValueError(f"No se encontró URL de malla GLB en la respuesta de fal.ai: {list(result)}")


class FalImageTo3DProvider(ImageTo3DProvider):
    def __init__(
        self,
        endpoint_id: str,
        label: str,
        est_cost_usd: float,
        est_seconds: int = 90,
        notes: str = "",
    ) -> None:
        self.endpoint_id = endpoint_id
        self.info = ProviderInfo(
            id=f"fal.{endpoint_id}",
            label=label,
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.API,
            est_cost_usd=est_cost_usd,
            est_seconds=est_seconds,
            outputs=("glb", "obj", "stl"),
            notes=notes,
        )

    def is_available(self) -> bool:
        return bool(os.getenv("FAL_KEY"))

    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        if not req.image_paths:
            raise ValueError("Se requiere al menos una imagen para ImageTo3D.")

        on_progress(0.05, f"Subiendo {len(req.image_paths)} vista(s) a fal.ai")
        uploaded_urls = [fal_client.upload_file(path) for path in req.image_paths]

        arguments: dict[str, Any] = {"image_url": uploaded_urls[0], **req.extra}
        if len(uploaded_urls) > 1:
            arguments["image_urls"] = uploaded_urls
        if req.seed is not None:
            arguments["seed"] = req.seed

        on_progress(0.20, f"Generando modelo 3D en {self.info.label}")
        result: dict[str, Any] = fal_client.subscribe(
            self.endpoint_id,
            arguments=arguments,
            with_logs=False,
        )

        glb_url = _extract_glb_url(result)
        on_progress(0.80, "Descargando malla GLB")

        out_dir = Path(tempfile.mkdtemp(prefix="autem_fal_"))
        mesh_path = out_dir / "model.glb"
        with httpx.Client(timeout=120.0) as client:
            response = client.get(glb_url)
            response.raise_for_status()
            mesh_path.write_bytes(response.content)

        on_progress(0.90, "Malla descargada")
        return ImageTo3DResult(
            mesh_path=str(mesh_path),
            provider_id=self.info.id,
            cost_usd=self.info.est_cost_usd,
            raw_metadata=result,
        )
