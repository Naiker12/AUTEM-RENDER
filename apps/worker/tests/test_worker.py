import tempfile
from pathlib import Path

import trimesh
from PIL import Image

from autem_worker.celery_app import celery_app
from autem_worker.pipelines import postprocess_mesh_pipeline, preprocess_image_pipeline


def test_worker_registers_all_tasks() -> None:
    expected = {
        "autem_worker.tasks.image_to_3d.run_image_to_3d",
        "autem_worker.tasks.render.run_render",
        "autem_worker.tasks.upscale.run_upscale",
        "autem_worker.tasks.video.run_video",
    }
    assert expected.issubset(set(celery_app.tasks.keys()))


def test_worker_preprocess_and_postprocess_pipelines() -> None:
    tmp_dir = Path(tempfile.mkdtemp())
    img_path = tmp_dir / "input.png"
    Image.new("RGB", (120, 120), color=(240, 240, 240)).save(img_path, format="PNG")

    cleaned = preprocess_image_pipeline(img_path, max_side=64, remove_bg=True)
    assert cleaned.exists()

    mesh_path = tmp_dir / "raw.glb"
    box = trimesh.creation.box(extents=[4.0, 2.0, 3.0])
    data = trimesh.Scene(box).export(file_type="glb")
    mesh_path.write_bytes(data if isinstance(data, bytes) else bytes(data))

    out_dir = tmp_dir / "out"
    exports, stats = postprocess_mesh_pipeline(
        input_mesh_path=mesh_path,
        output_dir=out_dir,
        target_height_m=6.0,
        face_limit=1000,
        formats=("glb", "obj", "stl"),
    )
    assert set(exports.keys()) == {"glb", "obj", "stl"}
    assert stats["dimensions"]["height_m"] == 6.0
    assert stats["file_size_bytes"] > 0
