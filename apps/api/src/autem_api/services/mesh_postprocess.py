from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import trimesh


@dataclass
class MeshPostprocessOutput:
    exports: dict[str, Path]  # {"glb": Path, "obj": Path, "stl": Path}
    stats: dict[str, Any]


def postprocess_mesh(
    input_mesh_path: Path,
    output_dir: Path,
    target_height_m: float | None = None,
    face_limit: int | None = None,
    formats: tuple[str, ...] = ("glb", "obj", "stl"),
) -> MeshPostprocessOutput:
    """Center mesh on Y=0, normalize height, optionally decimate, and export formats."""
    output_dir.mkdir(parents=True, exist_ok=True)
    loaded = trimesh.load(str(input_mesh_path), force="scene")

    scene = loaded if isinstance(loaded, trimesh.Scene) else trimesh.Scene(loaded)

    bounds = scene.bounds
    if bounds is not None and len(bounds) == 2:
        min_pt, max_pt = bounds[0], bounds[1]
        extents = max_pt - min_pt

        # Optional scale normalization to real architectural height (Y axis in meters)
        if target_height_m and target_height_m > 0 and extents[1] > 1e-6:
            scale_factor = float(target_height_m / extents[1])
            scene.apply_scale(scale_factor)
            bounds = scene.bounds
            min_pt, max_pt = bounds[0], bounds[1]

        # Center X/Z at origin and place bottom of mesh on Y = 0
        center_x = float((min_pt[0] + max_pt[0]) / 2.0)
        center_z = float((min_pt[2] + max_pt[2]) / 2.0)
        min_y = float(min_pt[1])
        scene.apply_translation([-center_x, -min_y, -center_z])

    # Compute mesh statistics and optionally decimate if face_limit is set
    vertex_count = 0
    face_count = 0
    for name, geom in list(scene.geometry.items()):
        if isinstance(geom, trimesh.Trimesh):
            if face_limit and face_limit > 0 and len(geom.faces) > face_limit:
                try:
                    geom = geom.simplify_quadric_decimation(face_limit)
                    scene.geometry[name] = geom
                except Exception:
                    pass
            vertex_count += int(len(geom.vertices))
            face_count += int(len(geom.faces))

    final_bounds = scene.bounds
    if final_bounds is not None and len(final_bounds) == 2:
        ext = np.round(final_bounds[1] - final_bounds[0], 3)
        dimensions = {
            "width_m": float(ext[0]),
            "height_m": float(ext[1]),
            "depth_m": float(ext[2]),
        }
    else:
        dimensions = {"width_m": 0.0, "height_m": 0.0, "depth_m": 0.0}

    exports: dict[str, Path] = {}
    merged = scene.to_mesh() if len(scene.geometry) > 0 else None

    for fmt in formats:
        fmt_lower = fmt.lower()
        dest = output_dir / f"model.{fmt_lower}"
        if fmt_lower == "glb":
            data = scene.export(file_type="glb")
            dest.write_bytes(data if isinstance(data, bytes) else bytes(data))
            exports["glb"] = dest
        elif fmt_lower in ("obj", "stl") and merged is not None:
            data = merged.export(file_type=fmt_lower)
            if isinstance(data, str):
                dest.write_text(data, encoding="utf-8")
            else:
                dest.write_bytes(data if isinstance(data, bytes) else bytes(data))
            exports[fmt_lower] = dest

    glb_size = exports["glb"].stat().st_size if "glb" in exports else 0
    return MeshPostprocessOutput(
        exports=exports,
        stats={
            "vertices": vertex_count,
            "faces": face_count,
            "dimensions": dimensions,
            "formats": list(exports.keys()),
            "file_size_bytes": glb_size,
        },
    )
