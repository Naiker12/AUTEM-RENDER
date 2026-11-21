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


class TripoDirectImageTo3DProvider(ImageTo3DProvider):
    """Official Tripo3D direct OpenAPI v2 adapter (requires TRIPO_API_KEY)."""

    BASE_URL = "https://api.tripo3d.ai/v2/openapi"

    def __init__(self, model_version: str = "v2.5-20250123") -> None:
        self.model_version = model_version
        self.info = ProviderInfo(
            id="tripo.direct",
            label="Tripo3D Directo (API oficial)",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.API,
            est_cost_usd=0.20,
            est_seconds=60,
            outputs=("glb", "obj", "stl"),
            notes="API oficial directa de Tripo3D (menor costo por modelo que intermediarios).",
        )

    def is_available(self) -> bool:
        return bool(os.getenv("TRIPO_API_KEY", "").strip())

    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        api_key = os.getenv("TRIPO_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("TRIPO_API_KEY no configurada.")
        if not req.image_paths:
            raise ValueError("Se requiere al menos una imagen para Tripo3D.")

        headers = {"Authorization": f"Bearer {api_key}"}
        image_path = Path(req.image_paths[0])

        with httpx.Client(timeout=120.0) as client:
            on_progress(0.10, "Subiendo imagen a Tripo3D")
            with image_path.open("rb") as fh:
                up = client.post(
                    f"{self.BASE_URL}/upload",
                    headers=headers,
                    files={"file": (image_path.name, fh, "image/png")},
                )
                up.raise_for_status()
                image_token = up.json()["data"]["image_token"]

            on_progress(0.25, "Creando tarea 3D en Tripo3D")
            create = client.post(
                f"{self.BASE_URL}/task",
                headers=headers,
                json={
                    "type": "image_to_model",
                    "model_version": self.model_version,
                    "file": {"type": "png", "file_token": image_token},
                    "texture": req.texture,
                    "pbr": True,
                },
            )
            create.raise_for_status()
            task_id = create.json()["data"]["task_id"]

            deadline = time.monotonic() + 300
            model_url: str | None = None
            raw_data: dict[str, Any] = {}
            while time.monotonic() < deadline:
                poll = client.get(f"{self.BASE_URL}/task/{task_id}", headers=headers)
                poll.raise_for_status()
                raw_data = poll.json().get("data", {})
                status = raw_data.get("status")
                progress = float(raw_data.get("progress", 50)) / 100.0
                on_progress(min(0.85, max(0.30, progress)), f"Tripo3D: {status}")
                if status == "success":
                    output = raw_data.get("output", {})
                    model_url = output.get("pbr_model") or output.get("model")
                    break
                if status in ("failed", "cancelled", "unknown"):
                    raise RuntimeError(f"Tripo3D falló: {raw_data}")
                time.sleep(2.5)

            if not model_url:
                raise TimeoutError("Tripo3D no devolvió URL de modelo GLB a tiempo.")

            on_progress(0.90, "Descargando GLB de Tripo3D")
            dl = client.get(model_url)
            dl.raise_for_status()
            out_dir = Path(tempfile.mkdtemp(prefix="autem_tripo_"))
            mesh_path = out_dir / "tripo_model.glb"
            mesh_path.write_bytes(dl.content)

        return ImageTo3DResult(
            mesh_path=str(mesh_path),
            provider_id=self.info.id,
            cost_usd=self.info.est_cost_usd,
            raw_metadata=raw_data,
        )
