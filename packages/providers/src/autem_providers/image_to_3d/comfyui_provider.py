import os
from pathlib import Path

from autem_providers.base import (
    ImageTo3DProvider,
    ImageTo3DRequest,
    ImageTo3DResult,
    ProgressCb,
    ProviderInfo,
    ProviderKind,
    Where,
)
from autem_providers.comfyui_client import ComfyUIClient


class ComfyUIImageTo3DProvider(ImageTo3DProvider):
    """Local ComfyUI TRELLIS.2 Image-to-3D provider (:8188)."""

    def __init__(
        self,
        base_url: str | None = None,
        workflow_path: Path = Path("workflows/trellis2_image_to_3d.json"),
    ) -> None:
        self.base_url = (base_url or os.getenv("COMFYUI_URL") or "http://localhost:8188").rstrip(
            "/"
        )
        self.workflow_path = workflow_path
        self.info = ProviderInfo(
            id="comfyui.trellis2",
            label="TRELLIS.2 Local (ComfyUI)",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.LOCAL,
            est_cost_usd=0.0,
            est_seconds=60,
            outputs=("glb", "obj", "stl"),
            notes=(
                "Corre localmente en tu GPU vía ComfyUI (:8188) "
                "con workflows/trellis2_image_to_3d.json."
            ),
        )

    def _client(self) -> ComfyUIClient:
        url = (os.getenv("COMFYUI_URL") or self.base_url).rstrip("/")
        return ComfyUIClient(url)

    def is_available(self) -> bool:
        return self._client().is_healthy() and self.workflow_path.exists()

    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        if not req.image_paths:
            raise ValueError("Se requiere al menos una imagen real para TRELLIS.2.")
        client = self._client()
        on_progress(0.10, "Subiendo imagen a ComfyUI local")
        uploaded_name = client.upload_image(Path(req.image_paths[0]))
        mesh_path = client.run_workflow(
            workflow_path=self.workflow_path,
            replacements={
                "IMAGE_NAME": uploaded_name,
                "SEED": req.seed if req.seed is not None else 42,
            },
            on_progress=on_progress,
            expected_exts=(".glb", ".gltf", ".obj"),
        )
        on_progress(0.90, "Malla 3D recibida desde ComfyUI")
        return ImageTo3DResult(
            mesh_path=str(mesh_path),
            provider_id=self.info.id,
            cost_usd=0.0,
            raw_metadata={"comfyui_url": client.base_url, "workflow": str(self.workflow_path)},
        )
