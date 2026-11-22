import tempfile
from pathlib import Path

import trimesh

from autem_providers.base import (
    ImageTo3DProvider,
    ImageTo3DRequest,
    ImageTo3DResult,
    ProgressCb,
    ProviderInfo,
    ProviderKind,
    Where,
)
from autem_providers.registry import (
    ProviderRegistry,
    build_default_image_registry,
    build_default_image_to_3d_registry,
    build_default_video_registry,
)


class _TestStub3DProvider(ImageTo3DProvider):
    """Test-only stub kept strictly inside tests/."""

    def __init__(self, provider_id: str = "stub.3d", available: bool = True) -> None:
        self._available = available
        self.info = ProviderInfo(
            id=provider_id,
            label="Test 3D Stub",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.LOCAL,
            est_cost_usd=0.0,
            est_seconds=1,
            outputs=("glb",),
        )

    def is_available(self) -> bool:
        return self._available

    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        on_progress(1.0, "ok")
        box = trimesh.creation.box(extents=[2.0, 2.0, 2.0])
        out = Path(tempfile.mkdtemp()) / "stub.glb"
        data = trimesh.Scene(box).export(file_type="glb")
        out.write_bytes(data if isinstance(data, bytes) else bytes(data))
        return ImageTo3DResult(str(out), self.info.id, 0.0, {})


def test_default_registries_only_expose_real_providers() -> None:
    ids_3d = [info.id for info, _ in build_default_image_to_3d_registry().all_info()]
    ids_img = [info.id for info, _ in build_default_image_registry().all_info()]
    ids_vid = [info.id for info, _ in build_default_video_registry().all_info()]

    all_ids = [*ids_3d, *ids_img, *ids_vid]
    assert not any(pid.startswith("mock.") for pid in all_ids)
    assert "comfyui.trellis2" in ids_3d
    assert "fal.fal-ai/trellis-2" in ids_3d
    assert "fal.fal-ai/flux/dev/image-to-image" in ids_img
    assert "comfyui.wan22" in ids_vid


def test_registry_fallback_skips_unavailable_and_runs_next() -> None:
    registry = ProviderRegistry()
    registry.register(_TestStub3DProvider("unavailable.1", available=False))
    registry.register(_TestStub3DProvider("available.2", available=True))

    result = registry.run_with_fallback(
        order=["unavailable.1", "available.2"],
        req=ImageTo3DRequest(image_paths=["input.png"]),
        on_progress=lambda _p, _m: None,
    )
    assert result.provider_id == "available.2"
    assert Path(result.mesh_path).read_bytes()[:4] == b"glTF"


def test_preview_fallback_is_flagged_degraded() -> None:
    import tempfile

    from PIL import Image

    from autem_providers.image_to_3d.local_relief_provider import LocalRelief3DProvider

    img = Path(tempfile.mkdtemp()) / "in.png"
    Image.new("RGB", (800, 600), (240, 240, 240)).save(img)
    reg = ProviderRegistry()
    reg.register(_TestStub3DProvider("down.1", available=False))
    reg.register(LocalRelief3DProvider())
    res = reg.run_with_fallback(
        ["down.1", "local.relief_3d"], ImageTo3DRequest(image_paths=[str(img)]), lambda *_: None
    )
    assert res.raw_metadata["degraded"] is True
    assert res.raw_metadata["quality_tier"] == "preview"


def test_allow_preview_false_raises() -> None:
    from autem_providers.image_to_3d.local_relief_provider import LocalRelief3DProvider

    reg = ProviderRegistry()
    reg.register(LocalRelief3DProvider())
    try:
        reg.run_with_fallback(
            ["local.relief_3d"],
            ImageTo3DRequest(image_paths=["x.png"]),
            lambda *_: None,
            allow_preview=False,
        )
    except RuntimeError as exc:
        assert "vista previa" in str(exc).lower()
    else:
        raise AssertionError("debió fallar")


def test_relief_texture_keeps_resolution() -> None:
    import tempfile

    import numpy as np
    import trimesh
    from PIL import Image

    from autem_providers.image_to_3d.local_relief_provider import _image_to_3d_relief_glb

    arr = np.full((600, 800, 3), 250, np.uint8)
    arr[100:500, 150:650] = (190, 150, 110)
    src = Path(tempfile.mkdtemp()) / "in.png"
    Image.fromarray(arr).save(src)
    out = Path(tempfile.mkdtemp()) / "o.glb"
    _image_to_3d_relief_glb(src, out)
    scene = trimesh.load(str(out), force="scene")
    geom = next(iter(scene.geometry.values()))
    tex = geom.visual.material.baseColorTexture
    assert max(tex.size) > 512
