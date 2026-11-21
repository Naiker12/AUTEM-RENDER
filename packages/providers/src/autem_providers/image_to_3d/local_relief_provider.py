import tempfile
import time
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageFilter

from autem_providers.base import (
    ImageTo3DProvider,
    ImageTo3DRequest,
    ImageTo3DResult,
    ProgressCb,
    ProviderInfo,
    ProviderKind,
    Where,
)


def _image_to_3d_relief_glb(image_path: Path, dest: Path, grid_size: int = 96) -> None:
    """Reconstruct a real solid 3D relief/extruded mesh directly from the uploaded image pixels."""
    with Image.open(image_path) as raw:
        rgb = raw.convert("RGB")
        # Preserve aspect ratio within grid_size
        w, h = rgb.size
        if w >= h:
            nx = grid_size
            ny = max(24, int(round(grid_size * (h / max(1, w)))))
        else:
            ny = grid_size
            nx = max(24, int(round(grid_size * (w / max(1, h)))))

        resized = rgb.resize((nx, ny), Image.Resampling.LANCZOS)
        gray = resized.convert("L").filter(ImageFilter.GaussianBlur(radius=0.8))

    colors_rgb = np.asarray(resized, dtype=np.uint8)  # (ny, nx, 3)
    lum = np.asarray(gray, dtype=np.float32) / 255.0  # (ny, nx)

    # Architectural contrast: dark lines/walls or bright masses pop as clean 3D depth relief
    # Combine luminance and local edge magnitude for crisp architectural structure
    gx = np.abs(np.diff(lum, axis=1, prepend=lum[:, :1]))
    gy = np.abs(np.diff(lum, axis=0, prepend=lum[:1, :]))
    edges = np.clip((gx + gy) * 2.5, 0.0, 1.0)
    height_map = 0.25 + (lum * 0.95) + (edges * 0.45)  # meters in raw scale

    # Build top surface + solid base slab vertices
    aspect_x = (nx / max(nx, ny)) * 6.0
    aspect_z = (ny / max(nx, ny)) * 6.0
    xs = np.linspace(-aspect_x / 2.0, aspect_x / 2.0, nx, dtype=np.float32)
    zs = np.linspace(-aspect_z / 2.0, aspect_z / 2.0, ny, dtype=np.float32)
    xx, zz = np.meshgrid(xs, zs)

    top_verts = np.stack([xx, height_map, zz], axis=-1).reshape(-1, 3)
    bot_verts = np.stack([xx, np.zeros_like(height_map), zz], axis=-1).reshape(-1, 3)
    verts = np.vstack([top_verts, bot_verts])

    # Vertex colors from actual image pixels (top) + dark slate base (bottom)
    alpha = np.full((ny * nx, 1), 255, dtype=np.uint8)
    top_colors = np.hstack([colors_rgb.reshape(-1, 3), alpha])
    bot_colors = np.tile(np.array([[36, 38, 44, 255]], dtype=np.uint8), (ny * nx, 1))
    v_colors = np.vstack([top_colors, bot_colors])

    # Vectorized quad-to-triangle indexing for top & bottom surfaces
    idx = np.arange(ny * nx, dtype=np.int32).reshape(ny, nx)
    v00 = idx[:-1, :-1].ravel()
    v01 = idx[:-1, 1:].ravel()
    v10 = idx[1:, :-1].ravel()
    v11 = idx[1:, 1:].ravel()

    top_f1 = np.stack([v00, v10, v01], axis=1)
    top_f2 = np.stack([v01, v10, v11], axis=1)

    offset = ny * nx
    bot_f1 = np.stack([v00 + offset, v01 + offset, v10 + offset], axis=1)
    bot_f2 = np.stack([v01 + offset, v11 + offset, v10 + offset], axis=1)

    # Side perimeter walls so the 3D model is watertight/solid
    side_faces: list[np.ndarray] = []
    borders = [
        idx[0, :],  # north
        idx[-1, ::-1],  # south
        idx[:, -1],  # east
        idx[::-1, 0],  # west
    ]
    for b in borders:
        a0, a1 = b[:-1], b[1:]
        b0, b1 = a0 + offset, a1 + offset
        side_faces.append(np.stack([a0, a1, b0], axis=1))
        side_faces.append(np.stack([a1, b1, b0], axis=1))

    faces = np.vstack([top_f1, top_f2, bot_f1, bot_f2, *side_faces])
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_colors=v_colors, process=False)

    glb_bytes = trimesh.Scene(mesh).export(file_type="glb")
    dest.write_bytes(glb_bytes if isinstance(glb_bytes, bytes) else bytes(glb_bytes))


class LocalRelief3DProvider(ImageTo3DProvider):
    """Real local CPU 3D mesh reconstruction (relief/extrusion from uploaded image, $0.00)."""

    def __init__(self) -> None:
        self.info = ProviderInfo(
            id="local.relief_3d",
            label="Local CPU 3D (Relieve / Planta · Gratis)",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.LOCAL,
            est_cost_usd=0.0,
            est_seconds=3,
            outputs=("glb", "obj", "stl"),
            notes=(
                "Reconstruye una malla 3D sólida con textura real directamente desde tu imagen "
                "en CPU a costo $0 (sin GPU ni API key)."
            ),
        )

    def is_available(self) -> bool:
        return True

    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        if not req.image_paths:
            raise ValueError("Se requiere al menos una imagen subida para reconstruir en 3D.")

        img_path = Path(req.image_paths[0])
        if not img_path.exists():
            raise FileNotFoundError(f"Imagen no encontrada: {img_path}")

        on_progress(0.20, "Analizando profundidad y contornos arquitectónicos")
        time.sleep(0.25)

        on_progress(0.55, "Extruyendo geometría 3D y mapeando color real")
        out_dir = Path(tempfile.mkdtemp(prefix="autem_relief3d_"))
        mesh_path = out_dir / "model_3d.glb"
        _image_to_3d_relief_glb(img_path, mesh_path)

        on_progress(0.88, "Empaquetando malla GLB")
        return ImageTo3DResult(
            mesh_path=str(mesh_path),
            provider_id=self.info.id,
            cost_usd=0.0,
            raw_metadata={"engine": "local_relief_3d", "source": img_path.name},
        )
