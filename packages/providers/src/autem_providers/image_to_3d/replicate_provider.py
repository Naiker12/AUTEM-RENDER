import base64
import os
import tempfile
import time
from pathlib import Path
from typing import Any

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


class ReplicateImageTo3DProvider(ImageTo3DProvider):
    """Replicate API adapter for TRELLIS Image-to-3D (requires REPLICATE_API_TOKEN)."""

    def __init__(self, model_slug: str = "firtoz/trellis") -> None:
        self.model_slug = model_slug
        self.info = ProviderInfo(
            id=f"replicate.{model_slug}",
            label="TRELLIS (Replicate)",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.API,
            est_cost_usd=0.25,
            est_seconds=70,
            outputs=("glb", "obj", "stl"),
            notes="Ejecuta TRELLIS multi-vista en Replicate usando REPLICATE_API_TOKEN.",
        )

    def is_available(self) -> bool:
        return bool(os.getenv("REPLICATE_API_TOKEN", "").strip())

    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        token = os.getenv("REPLICATE_API_TOKEN", "").strip()
        if not token:
            raise RuntimeError("REPLICATE_API_TOKEN no configurado.")
        if not req.image_paths:
            raise ValueError("Se requiere al menos una imagen para Replicate.")

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        data_uris = [
            f"data:image/png;base64,{base64.b64encode(Path(p).read_bytes()).decode('ascii')}"
            for p in req.image_paths
        ]

        with httpx.Client(timeout=120.0) as client:
            on_progress(0.15, "Enviando predicción a Replicate")
            resp = client.post(
                f"https://api.replicate.com/v1/models/{self.model_slug}/predictions",
                headers=headers,
                json={"input": {"images": data_uris, "generate_model": True}},
            )
            resp.raise_for_status()
            pred = resp.json()
            poll_url = pred["urls"]["get"]

            deadline = time.monotonic() + 300
            glb_url: str | None = None
            while time.monotonic() < deadline:
                poll = client.get(poll_url, headers=headers)
                poll.raise_for_status()
                pred = poll.json()
                status = pred.get("status")
                on_progress(0.55, f"Replicate: {status}")
                if status == "succeeded":
                    out: Any = pred.get("output")
                    if isinstance(out, dict):
                        glb_url = out.get("model_file") or out.get("glb")
                    elif isinstance(out, str):
                        glb_url = out
                    break
                if status in ("failed", "canceled"):
                    raise RuntimeError(f"Replicate falló: {pred.get('error')}")
                time.sleep(2.5)

            if not glb_url:
                raise TimeoutError("Replicate no devolvió archivo GLB.")

            on_progress(0.90, "Descargando GLB desde Replicate")
            dl = client.get(glb_url)
            dl.raise_for_status()
            out_dir = Path(tempfile.mkdtemp(prefix="autem_rep_"))
            mesh_path = out_dir / "replicate_model.glb"
            mesh_path.write_bytes(dl.content)

        return ImageTo3DResult(
            mesh_path=str(mesh_path),
            provider_id=self.info.id,
            cost_usd=self.info.est_cost_usd,
            raw_metadata=pred,
        )
