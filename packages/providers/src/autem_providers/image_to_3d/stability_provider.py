import os
import tempfile
from pathlib import Path

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


class StabilitySF3DProvider(ImageTo3DProvider):
    """Stability AI Stable Fast 3D (~$0.04/model, ~3s response, requires STABILITY_API_KEY)."""

    ENDPOINT = "https://api.stability.ai/v2beta/3d/stable-fast-3d"

    def __init__(self) -> None:
        self.info = ProviderInfo(
            id="stability.sf3d",
            label="Stability Stable Fast 3D",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.API,
            est_cost_usd=0.05,
            est_seconds=5,
            outputs=("glb", "obj", "stl"),
            notes="Ultra rápido (~5s) y económico (~$0.05/modelo) vía Stability AI.",
        )

    def is_available(self) -> bool:
        return bool(os.getenv("STABILITY_API_KEY", "").strip())

    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        api_key = os.getenv("STABILITY_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("STABILITY_API_KEY no configurada.")
        if not req.image_paths:
            raise ValueError("Se requiere al menos una imagen para Stability SF3D.")

        image_path = Path(req.image_paths[0])
        on_progress(0.25, "Generando GLB en Stability SF3D")

        with (
            httpx.Client(timeout=120.0) as client,
            image_path.open("rb") as fh,
        ):
            resp = client.post(
                self.ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"image": (image_path.name, fh, "image/png")},
                data={"texture_resolution": "1024", "remesh": "quad"},
            )
            resp.raise_for_status()
            out_dir = Path(tempfile.mkdtemp(prefix="autem_sf3d_"))
            mesh_path = out_dir / "sf3d_model.glb"
            mesh_path.write_bytes(resp.content)

        on_progress(0.90, "GLB recibido de Stability AI")
        return ImageTo3DResult(
            mesh_path=str(mesh_path),
            provider_id=self.info.id,
            cost_usd=self.info.est_cost_usd,
            raw_metadata={"endpoint": self.ENDPOINT},
        )
