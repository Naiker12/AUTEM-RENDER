import tempfile
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

from autem_api.services.image_preprocess import preprocess_image
from autem_api.services.mesh_postprocess import postprocess_mesh


def _chair_like(path: Path) -> None:
    a = np.full((600, 800, 3), 250, np.uint8)  # fondo casi blanco
    a[120:520, 200:600] = (190, 170, 140)  # objeto beige
    a[250:290, 300:340] = (252, 252, 252)  # brillo blanco DENTRO del objeto
    Image.fromarray(a).save(path)


def test_preprocess_keeps_interior_highlights_and_squares_canvas() -> None:
    src = Path(tempfile.mkdtemp()) / "chair.png"
    _chair_like(src)
    out = preprocess_image(src, remove_bg=True)
    with Image.open(out) as im:
        assert im.mode == "RGBA" and im.width == im.height
        alpha = np.asarray(im.getchannel("A"))
        assert alpha[0, 0] == 0  # fondo fuera
        cy, cx = im.height // 2, im.width // 2
        assert alpha[cy, cx] == 255  # objeto dentro (incluye zona del brillo)
        assert (alpha > 127).mean() < 0.9  # hay margen alrededor


def test_postprocess_decimation_keeps_texture() -> None:
    m = trimesh.creation.icosphere(subdivisions=5)
    uv = np.stack(
        [
            (np.arctan2(m.vertices[:, 1], m.vertices[:, 0]) / (2 * np.pi)) % 1,
            (m.vertices[:, 2] + 1) / 2,
        ],
        1,
    )
    m.visual = trimesh.visual.TextureVisuals(
        uv=uv, image=Image.new("RGB", (64, 64), (200, 100, 50))
    )
    src = Path(tempfile.mkdtemp()) / "in.glb"
    src.write_bytes(trimesh.Scene(m).export(file_type="glb"))

    out = postprocess_mesh(src, Path(tempfile.mkdtemp()), face_limit=3000, formats=("glb",))
    if out.stats["decimated"]:
        assert out.stats["faces"] <= 3100
    g = next(iter(trimesh.load(str(out.exports["glb"]), force="scene").geometry.values()))
    assert g.visual.kind == "texture"


def test_postprocess_roundtrip_without_decimation_keeps_texture() -> None:
    m = trimesh.creation.icosphere(subdivisions=3)
    m.visual = trimesh.visual.TextureVisuals(
        uv=np.random.rand(len(m.vertices), 2), image=Image.new("RGB", (32, 32), (10, 200, 10))
    )
    src = Path(tempfile.mkdtemp()) / "in.glb"
    src.write_bytes(trimesh.Scene(m).export(file_type="glb"))
    out = postprocess_mesh(src, Path(tempfile.mkdtemp()), formats=("glb",))
    g = next(iter(trimesh.load(str(out.exports["glb"]), force="scene").geometry.values()))
    assert g.visual.kind == "texture" and out.stats["decimated"] is False
