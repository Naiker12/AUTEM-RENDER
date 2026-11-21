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
    for _ in range(40):
        final_job = client.get(f"/api/v1/jobs/{job_id}").json()
        if final_job["status"] in ("succeeded", "failed"):
            break
        time.sleep(0.1)
    assert final_job["status"] == "succeeded"
    assert "glb" in final_job["output_assets"]


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


def test_auth_register_login_me_and_key_encryption() -> None:
    import uuid

    from autem_api.security.crypto import decrypt_provider_key, encrypt_provider_key

    client = TestClient(create_app())
    email = f"arch_{uuid.uuid4().hex[:8]}@autem.dev"

    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Estudio Autem", "password": "strongpassword123"},
    )
    assert reg.status_code == 201
    token = reg.json()["access_token"]

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == email

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "strongpassword123"},
    )
    assert login.status_code == 200

    enc = encrypt_provider_key("fal_secret_key_123", "test-secret")
    assert enc != "fal_secret_key_123"
    assert decrypt_provider_key(enc, "test-secret") == "fal_secret_key_123"
