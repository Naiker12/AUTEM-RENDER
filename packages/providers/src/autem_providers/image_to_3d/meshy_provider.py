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


class MeshyDirectImageTo3DProvider(ImageTo3DProvider):
    """Official Meshy OpenAPI v1 Image-to-3D adapter (requires MESHY_API_KEY)."""

    BASE_URL = "https://api.meshy.ai/openapi/v1/image-to-3d"

    def __init__(self, ai_model: str = "meshy-5") -> None:
        self.ai_model = ai_model
        self.info = ProviderInfo(
            id="meshy.direct",
            label="Meshy Directo (API oficial)",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.API,
            est_cost_usd=0.35,
            est_seconds=90,
            outputs=("glb", "obj", "stl"),
            notes="API oficial directa de Meshy (PBR + topología limpia).",
        )

    def is_available(self) -> bool:
        return bool(os.getenv("MESHY_API_KEY", "").strip())

    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        api_key = os.getenv("MESHY_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("MESHY_API_KEY no configurada.")
        if not req.image_paths:
            raise ValueError("Se requiere al menos una imagen para Meshy.")

        headers = {"Authorization": f"Bearer {api_key}"}
        raw_bytes = Path(req.image_paths[0]).read_bytes()
        data_uri = f"data:image/png;base64,{base64.b64encode(raw_bytes).decode('ascii')}"

        with httpx.Client(timeout=120.0) as client:
            on_progress(0.15, "Enviando imagen a Meshy")
            create = client.post(
                self.BASE_URL,
                headers=headers,
                json={
                    "image_url": data_uri,
                    "ai_model": self.ai_model,
                    "should_texture": req.texture,
                    "enable_pbr": True,
                },
            )
            create.raise_for_status()
            task_id = create.json()["result"]

            deadline = time.monotonic() + 360
            glb_url: str | None = None
            raw_data: dict[str, Any] = {}
            while time.monotonic() < deadline:
                poll = client.get(f"{self.BASE_URL}/{task_id}", headers=headers)
                poll.raise_for_status()
                raw_data = poll.json()
                status = raw_data.get("status")
                progress = float(raw_data.get("progress", 50)) / 100.0
                on_progress(min(0.85, max(0.25, progress)), f"Meshy: {status}")
                if status == "SUCCEEDED":
                    glb_url = raw_data.get("model_urls", {}).get("glb")
                    break
                if status in ("FAILED", "CANCELED"):
                    raise RuntimeError(f"Meshy falló: {raw_data}")
                time.sleep(3.0)

            if not glb_url:
                raise TimeoutError("Meshy no devolvió URL de modelo GLB a tiempo.")

            on_progress(0.90, "Descargando GLB de Meshy")
            dl = client.get(glb_url)
            dl.raise_for_status()
            out_dir = Path(tempfile.mkdtemp(prefix="autem_meshy_"))
            mesh_path = out_dir / "meshy_model.glb"
            mesh_path.write_bytes(dl.content)

        return ImageTo3DResult(
            mesh_path=str(mesh_path),
            provider_id=self.info.id,
            cost_usd=self.info.est_cost_usd,
            raw_metadata=raw_data,
        )
