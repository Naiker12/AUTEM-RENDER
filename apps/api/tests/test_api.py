import io
from pathlib import Path

import trimesh
from fastapi.testclient import TestClient
from PIL import Image

from autem_api.main import create_app


def _make_png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color=(140, 120, 100)).save(buf, format="PNG")
    return buf.getvalue()


def _make_glb_bytes() -> bytes:
    box = trimesh.creation.box(extents=[4.0, 3.0, 4.0])
    data = trimesh.Scene(box).export(file_type="glb")
    return data if isinstance(data, bytes) else bytes(data)


def test_health_settings_and_real_providers_only() -> None:
    client = TestClient(create_app())

    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    providers = client.get("/api/v1/providers").json()
    assert len(providers) > 0
    assert not any(p["id"].startswith("mock.") for p in providers)

    settings = client.get("/api/v1/settings/providers")
    assert settings.status_code == 200
    body = settings.json()
    assert "fal_key_configured" in body
    assert "comfyui_online" in body
    assert len(body["cloud_providers"]) >= 6
    assert len(body["local_engines"]) >= 3
    assert set(body["defaults"].keys()) == {"image_to_3d", "image", "upscale", "video"}

    # Testing an unconfigured provider returns ok=False cleanly (never crashes)
    test_res = client.post("/api/v1/settings/providers/test", json={"provider_id": "meshy"})
    assert test_res.status_code == 200
    assert "ok" in test_res.json()

    # Persistent cost ledger endpoint returns full accounting structure
    ledger = client.get("/api/v1/jobs/cost/ledger")
    assert ledger.status_code == 200
    ledger_body = ledger.json()
    for field in ("today_usd", "last_7d_usd", "month_usd", "all_time_usd", "by_provider"):
        assert field in ledger_body


def test_jobs_require_real_uploaded_images_and_active_provider(monkeypatch: object) -> None:
    client = TestClient(create_app())

    # Without any uploaded image, image-to-3d must reject with 400
    no_img = client.post("/api/v1/jobs/image-to-3d", json={"asset_ids": []})
    assert no_img.status_code == 400

    # Upload a real PNG image
    up = client.post(
        "/api/v1/assets",
        files={"file": ("facade.png", _make_png_bytes(), "image/png")},
    )
    assert up.status_code == 201
    asset_id = up.json()["id"]

    # Without FAL_KEY, explicitly requesting fal.ai returns 503
    if not Path(".env").exists() or "FAL_KEY=" not in Path(".env").read_text(encoding="utf-8"):
        res = client.post(
            "/api/v1/jobs/image-to-3d",
            json={"asset_ids": [asset_id], "provider_id": "fal.fal-ai/trellis-2"},
        )
        assert res.status_code == 503

    # With provider_id="auto", falls back cleanly to free local.relief_3d and builds a real GLB
    import time

    auto_res = client.post(
        "/api/v1/jobs/image-to-3d",
        json={"asset_ids": [asset_id], "provider_id": "auto", "target_height_m": 4.0},
    )
    assert auto_res.status_code == 202
    job_id = auto_res.json()["id"]
    final_job = auto_res.json()
    for _ in range(120):
        final_job = client.get(f"/api/v1/jobs/{job_id}").json()
        if final_job["status"] in ("succeeded", "failed"):
            break
        time.sleep(0.1)
    assert final_job["status"] == "succeeded"
    assert "glb" in final_job["output_assets"]

    # Deleting an uploaded asset removes it cleanly
    del_res = client.delete(f"/api/v1/assets/{asset_id}")
    assert del_res.status_code == 204
    assert client.get(f"/api/v1/assets/{asset_id}/file").status_code == 404


def test_upload_real_glb_create_scene_and_share_comments() -> None:
    client = TestClient(create_app())

    mesh_up = client.post(
        "/api/v1/assets",
        files={"file": ("casa.glb", _make_glb_bytes(), "model/gltf-binary")},
    )
    assert mesh_up.status_code == 201
    mesh_id = mesh_up.json()["id"]

    # Filter meshes
    meshes = client.get("/api/v1/assets?kind=mesh").json()
    assert any(m["id"] == mesh_id for m in meshes)

    # Create real scene from uploaded GLB
    scene_resp = client.post("/api/v1/scenes", json={"name": "Proyecto Real", "asset_id": mesh_id})
    assert scene_resp.status_code == 201
    scene_id = scene_resp.json()["id"]

    # Save camera view (without triggering AI render since no FAL_KEY in unit test)
    view_resp = client.post(
        f"/api/v1/scenes/{scene_id}/views",
        json={
            "name": "Fachada Principal",
            "camera": {"position": [8.0, 5.0, 9.0], "target": [0.0, 2.0, 0.0], "fov": 42.0},
            "trigger_render": False,
        },
    )
    assert view_resp.status_code == 201

    # Share link + anchored 3D comment
    share_resp = client.post(f"/api/v1/scenes/{scene_id}/share")
    assert share_resp.status_code == 200
    token = share_resp.json()["token"]

    comment_resp = client.post(
        f"/api/v1/share/{token}/comments",
        json={"author": "Cliente", "text": "Revisar altura de cubierta", "anchor": [0.5, 3.0, 1.0]},
    )
    assert comment_resp.status_code == 201

    public_resp = client.get(f"/api/v1/share/{token}")
    assert public_resp.status_code == 200
    assert len(public_resp.json()["comments"]) == 1


def test_optional_access_token_protects_api_when_configured(monkeypatch: object) -> None:
    from autem_api.config import get_api_settings

    monkeypatch.setenv("AUTEM_ACCESS_TOKEN", "super-secret-studio-token")  # type: ignore[attr-defined]
    get_api_settings.cache_clear()
    try:
        client = TestClient(create_app())
        # Health stays public
        assert client.get("/api/v1/health").status_code == 200
        # Protected endpoints reject missing/wrong token
        assert client.get("/api/v1/jobs").status_code == 401
        assert (
            client.get(
                "/api/v1/jobs",
                headers={"Authorization": "Bearer wrong-token"},
            ).status_code
            == 401
        )
        # Valid token succeeds
        assert (
            client.get(
                "/api/v1/jobs",
                headers={"Authorization": "Bearer super-secret-studio-token"},
            ).status_code
            == 200
        )
    finally:
        monkeypatch.delenv("AUTEM_ACCESS_TOKEN", raising=False)  # type: ignore[attr-defined]
        get_api_settings.cache_clear()


def test_security_env_injection_ssrf_and_fake_upload_rejected() -> None:
    client = TestClient(create_app())

    # 1. Env newline injection must be rejected with 400
    inj = client.post(
        "/api/v1/settings/providers",
        json={"cloud_keys": {"fal": "abc\nEVIL_VAR=injected"}},
    )
    assert inj.status_code == 400

    # 2. SSRF to external/metadata host in local_urls must be rejected with 400
    ssrf = client.post(
        "/api/v1/settings/providers",
        json={"local_urls": {"comfyui": "http://169.254.169.254/latest/meta-data"}},
    )
    assert ssrf.status_code == 400

    # 3. Spoofed .png containing plain text must be rejected with 400
    fake_png = client.post(
        "/api/v1/assets",
        files={"file": ("spoof.png", b"this is definitely not a png image", "image/png")},
    )
    assert fake_png.status_code == 400

    # 4. Spoofed .glb without glTF magic header must be rejected with 400
    fake_glb = client.post(
        "/api/v1/assets",
        files={"file": ("spoof.glb", b"NOT_A_GLB_FILE", "model/gltf-binary")},
    )
    assert fake_glb.status_code == 400


def test_free_only_mode_blocks_paid_fallback_inside_registry() -> None:
    from autem_api.services.cost_service import CostService, DailyCostLimitError
    from autem_providers.base import (
        ImageTo3DProvider,
        ImageTo3DRequest,
        ImageTo3DResult,
        ProgressCb,
        ProviderInfo,
        ProviderKind,
        Where,
    )
    from autem_providers.registry import ProviderRegistry

    class _FailingFree(ImageTo3DProvider):
        info = ProviderInfo(
            id="test.free_fail",
            label="Free Fail",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.LOCAL,
            est_cost_usd=0.0,
            est_seconds=5,
            outputs=("glb",),
        )

        def is_available(self) -> bool:
            return True

        def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
            raise RuntimeError("local engine failed")

    class _PaidProvider(ImageTo3DProvider):
        called = False
        info = ProviderInfo(
            id="test.paid",
            label="Paid Cloud",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.API,
            est_cost_usd=0.45,
            est_seconds=60,
            outputs=("glb",),
        )

        def is_available(self) -> bool:
            return True

        def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
            self.called = True
            return ImageTo3DResult(mesh_path="out.glb", provider_id=self.info.id, cost_usd=0.45)

    reg = ProviderRegistry()
    paid = _PaidProvider()
    reg.register(_FailingFree())
    reg.register(paid)

    cost_service = CostService(daily_limit_usd=5.0, free_only_mode=True)
    req = ImageTo3DRequest(image_paths=["dummy.png"])
    try:
        reg.run_with_fallback(
            ["test.free_fail", "test.paid"],
            req,
            lambda _p, _m: None,
            budget_check=cost_service.check_budget,
        )
        raise AssertionError("Expected paid fallback to be blocked")
    except (RuntimeError, DailyCostLimitError):
        assert paid.called is False


def test_cost_reservation_prevents_concurrent_overspend() -> None:
    from autem_api.services.cost_service import CostService, DailyCostLimitError

    cs = CostService(daily_limit_usd=1.0, free_only_mode=False)
    cs.reserve("job-1", 0.60)
    assert cs.summary()["reserved_usd"] == 0.60
    assert cs.summary()["remaining_usd"] == 0.40

    # A second concurrent job of $0.50 would exceed $1.00 daily limit
    try:
        cs.reserve("job-2", 0.50)
        raise AssertionError("Expected DailyCostLimitError for concurrent overspend")
    except DailyCostLimitError:
        pass

    # After releasing job-1, job-2 fits cleanly
    cs.release("job-1")
    cs.reserve("job-2", 0.50)
    assert cs.summary()["reserved_usd"] == 0.50
    cs.release("job-2")


def test_content_hash_cache_returns_instant_zero_cost_hit() -> None:
    import time

    client = TestClient(create_app())
    up = client.post(
        "/api/v1/assets",
        files={"file": ("facade_cache.png", _make_png_bytes(), "image/png")},
    )
    assert up.status_code == 201
    asset_id = up.json()["id"]

    first = client.post(
        "/api/v1/jobs/image-to-3d",
        json={"asset_ids": [asset_id], "provider_id": "auto", "seed": 777},
    )
    assert first.status_code == 202
    first_id = first.json()["id"]
    for _ in range(80):
        st = client.get(f"/api/v1/jobs/{first_id}").json()
        if st["status"] in ("succeeded", "failed"):
            break
        time.sleep(0.1)
    assert st["status"] == "succeeded"

    # Second identical request must return an immediate cache hit at $0.00
    second = client.post(
        "/api/v1/jobs/image-to-3d",
        json={"asset_ids": [asset_id], "provider_id": "auto", "seed": 777},
    )
    assert second.status_code == 202
    body = second.json()
    assert body["status"] == "succeeded"
    assert body["cost_usd"] == 0.0
    assert body["params"].get("cache_hit") is True
    assert body["output_assets"].get("glb") == st["output_assets"].get("glb")


def test_server_persisted_projects_crud_and_scene_html_export() -> None:
    client = TestClient(create_app())

    # 1. Projects CRUD
    created = client.post("/api/v1/projects", json={"name": "Casa Bosque Norte"})
    assert created.status_code == 201
    pid = created.json()["id"]
    listed = client.get("/api/v1/projects").json()
    assert any(p["id"] == pid and p["name"] == "Casa Bosque Norte" for p in listed)
    assert client.delete(f"/api/v1/projects/{pid}").status_code == 204
    assert all(p["id"] != pid for p in client.get("/api/v1/projects").json())

    # 2. Standalone self-contained HTML 3D viewer export
    mesh_up = client.post(
        "/api/v1/assets",
        files={"file": ("villa.glb", _make_glb_bytes(), "model/gltf-binary")},
    )
    assert mesh_up.status_code == 201
    scene_res = client.post(
        "/api/v1/scenes",
        json={"name": "Villa Sur", "asset_id": mesh_up.json()["id"]},
    )
    assert scene_res.status_code == 201
    scene_id = scene_res.json()["id"]

    html_res = client.get(f"/api/v1/scenes/{scene_id}/export-html")
    assert html_res.status_code == 200
    assert "text/html" in html_res.headers["content-type"]
    assert "Villa Sur" in html_res.text
    assert "GLTFLoader" in html_res.text
    assert "attachment;" in html_res.headers.get("content-disposition", "")
