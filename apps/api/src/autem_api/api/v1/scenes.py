import base64
import html
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from autem_api.deps import get_asset_store, get_scene_service
from autem_api.domain.errors import ProviderUnavailableError
from autem_api.services.scene_service import (
    SceneCommentEntity,
    SceneEntity,
    SceneNotFoundError,
    SceneService,
    SceneViewEntity,
)
from autem_api.storage.local import LocalAssetStore

router = APIRouter(prefix="/scenes", tags=["scenes"])
share_router = APIRouter(prefix="/share", tags=["share"])
SceneServiceDep = Annotated[SceneService, Depends(get_scene_service)]
AssetStoreDep = Annotated[LocalAssetStore, Depends(get_asset_store)]


class CreateSceneRequest(BaseModel):
    name: str = Field(default="Escena Arquitectónica")
    asset_id: str


class CameraSpec(BaseModel):
    position: list[float] = Field(min_length=3, max_length=3)
    target: list[float] = Field(min_length=3, max_length=3)
    fov: float = Field(default=42.0, ge=15.0, le=120.0)


class CreateSceneViewRequest(BaseModel):
    name: str = Field(default="Vista principal")
    camera: CameraSpec
    thumbnail_asset_id: str | None = Field(default=None)
    trigger_render: bool = Field(default=True)
    style: str = Field(default="photoreal")
    material: str = Field(default="concrete")
    lighting: str = Field(default="golden_hour")
    prompt: str = Field(default="Photorealistic architectural render from exact 3D camera")


class SceneViewOut(BaseModel):
    id: str
    scene_id: str
    name: str
    camera: dict[str, Any]
    thumbnail_asset_id: str | None
    render_job_id: str | None
    created_at: datetime

    @classmethod
    def from_entity(cls, v: SceneViewEntity) -> "SceneViewOut":
        return cls(
            id=v.id,
            scene_id=v.scene_id,
            name=v.name,
            camera=v.camera,
            thumbnail_asset_id=v.thumbnail_asset_id,
            render_job_id=v.render_job_id,
            created_at=v.created_at,
        )


class SceneOut(BaseModel):
    id: str
    name: str
    source_asset_id: str
    share_token: str | None
    views: list[SceneViewOut]
    created_at: datetime

    @classmethod
    def from_entity(cls, s: SceneEntity) -> "SceneOut":
        return cls(
            id=s.id,
            name=s.name,
            source_asset_id=s.source_asset_id,
            share_token=s.share_token,
            views=[SceneViewOut.from_entity(v) for v in s.views],
            created_at=s.created_at,
        )


class ShareLinkOut(BaseModel):
    token: str
    share_path: str


class CreateCommentRequest(BaseModel):
    author: str = Field(default="Cliente", max_length=80)
    text: str = Field(min_length=1, max_length=1000)
    anchor: list[float] = Field(min_length=3, max_length=3)


class CommentOut(BaseModel):
    id: str
    author: str
    text: str
    anchor: list[float]
    created_at: datetime

    @classmethod
    def from_entity(cls, c: SceneCommentEntity) -> "CommentOut":
        return cls(
            id=c.id,
            author=c.author,
            text=c.text,
            anchor=c.anchor,
            created_at=c.created_at,
        )


class SharedSceneOut(BaseModel):
    scene: SceneOut
    comments: list[CommentOut]


@router.get("", response_model=list[SceneOut])
def list_scenes(service: SceneServiceDep) -> list[SceneOut]:
    return [SceneOut.from_entity(s) for s in service.list_scenes()]


@router.post("", response_model=SceneOut, status_code=status.HTTP_201_CREATED)
def create_scene(payload: CreateSceneRequest, service: SceneServiceDep) -> SceneOut:
    try:
        scene = service.create_scene(name=payload.name, source_asset_id=payload.asset_id)
    except SceneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return SceneOut.from_entity(scene)


@router.get("/{scene_id}", response_model=SceneOut)
def get_scene(scene_id: str, service: SceneServiceDep) -> SceneOut:
    try:
        return SceneOut.from_entity(service.get_scene(scene_id))
    except SceneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scene(scene_id: str, service: SceneServiceDep) -> None:
    try:
        service.delete_scene(scene_id)
    except SceneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{scene_id}/views", response_model=SceneViewOut, status_code=status.HTTP_201_CREATED)
def add_scene_view(
    scene_id: str,
    payload: CreateSceneViewRequest,
    service: SceneServiceDep,
) -> SceneViewOut:
    try:
        view = service.add_view(
            scene_id=scene_id,
            name=payload.name,
            camera=payload.camera.model_dump(),
            thumbnail_asset_id=payload.thumbnail_asset_id,
            trigger_render=payload.trigger_render,
            style=payload.style,
            material=payload.material,
            lighting=payload.lighting,
            prompt=payload.prompt,
        )
    except SceneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return SceneViewOut.from_entity(view)


@router.post("/{scene_id}/share", response_model=ShareLinkOut)
def share_scene(scene_id: str, service: SceneServiceDep) -> ShareLinkOut:
    try:
        token = service.create_share_link(scene_id)
    except SceneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ShareLinkOut(token=token, share_path=f"/share/{token}")


@router.get("/{scene_id}/export-html", response_class=HTMLResponse)
def export_scene_html(
    scene_id: str,
    service: SceneServiceDep,
    asset_store: AssetStoreDep,
) -> HTMLResponse:
    """Export a self-contained single-file HTML 3D viewer with embedded GLB (no server needed)."""
    try:
        scene = service.get_scene(scene_id)
    except SceneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    asset = asset_store.get(scene.source_asset_id)
    if not asset or not asset.path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El modelo 3D de la escena no está disponible en disco.",
        )

    glb_b64 = base64.b64encode(asset.path.read_bytes()).decode("ascii")
    safe_title = html.escape(scene.name)
    safe_filename = "".join(c if c.isalnum() or c in "-_" else "_" for c in scene.name) or "scene"

    doc = f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{safe_title} — Autem Render 3D Viewer</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: #0a0a0b; color: #f5f5f5;
      font-family: Inter, system-ui, sans-serif; overflow: hidden;
    }}
    #canvas-wrap {{
      width: 100vw; height: 100vh;
      background: radial-gradient(ellipse at center, #1b1d24 0%, #0d0e11 70%, #0a0a0b 100%);
    }}
    .hud {{
      position: fixed; top: 16px; left: 16px; right: 16px;
      display: flex; justify-content: space-between; align-items: center; pointer-events: none;
    }}
    .pill {{
      pointer-events: auto; background: rgba(17,17,20,.88); border: 1px solid #27272e;
      border-radius: 12px; padding: 8px 14px; backdrop-filter: blur(12px);
      display: flex; align-items: center; gap: 10px; font-size: 13px;
    }}
    .badge {{
      color: #ff9f0a; font-weight: 700; font-size: 11px;
      letter-spacing: .04em; text-transform: uppercase;
    }}
    button {{
      background: #18181d; color: #e4e4e7; border: 1px solid #2b2b33;
      border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer;
    }}
    button:hover, button.active {{ border-color: #f97316; color: #ff9f0a; }}
  </style>
  <script type="importmap">
    {{
      "imports": {{
        "three": "https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/"
      }}
    }}
  </script>
</head>
<body>
  <div id="canvas-wrap"></div>
  <div class="hud">
    <div class="pill"><span class="badge">Autem Render</span><span>{safe_title}</span></div>
    <div class="pill">
      <button id="btn-tex" class="active">Textura</button>
      <button id="btn-wire">Wireframe</button>
      <button id="btn-reset">Centrar</button>
    </div>
  </div>
  <script type="module">
    import * as THREE from 'three';
    import {{ OrbitControls }} from 'three/addons/controls/OrbitControls.js';
    import {{ GLTFLoader }} from 'three/addons/loaders/GLTFLoader.js';

    const wrap = document.getElementById('canvas-wrap');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 500);
    camera.position.set(2.4, 1.8, 4.2);
    const renderer = new THREE.WebGLRenderer({{ antialias: true }});
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    wrap.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3f3f46, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(6, 10, 8);
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0xdbeafe, 1.0);
    rim.position.set(-7, 5, -6);
    scene.add(rim);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const b64 = "{glb_b64}";
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const loader = new GLTFLoader();
    let rootModel = null;
    loader.parse(raw.buffer, '', (gltf) => {{
      rootModel = gltf.scene;
      const box = new THREE.Box3().setFromObject(rootModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 2.8 / Math.max(size.x, size.y, size.z, 0.001);
      rootModel.scale.setScalar(scale);
      rootModel.position.sub(center.multiplyScalar(scale));
      scene.add(rootModel);
    }});

    document.getElementById('btn-wire').onclick = () => {{
      if (!rootModel) return;
      rootModel.traverse(o => {{ if (o.isMesh) o.material.wireframe = true; }});
      document.getElementById('btn-wire').classList.add('active');
      document.getElementById('btn-tex').classList.remove('active');
    }};
    document.getElementById('btn-tex').onclick = () => {{
      if (!rootModel) return;
      rootModel.traverse(o => {{ if (o.isMesh) o.material.wireframe = false; }});
      document.getElementById('btn-tex').classList.add('active');
      document.getElementById('btn-wire').classList.remove('active');
    }};
    document.getElementById('btn-reset').onclick = () => {{
      camera.position.set(2.4, 1.8, 4.2);
      controls.target.set(0, 0, 0);
      controls.update();
    }};

    addEventListener('resize', () => {{
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    }});
    function animate() {{
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }}
    animate();
  </script>
</body>
</html>"""

    return HTMLResponse(
        content=doc,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}_viewer.html"',
        },
    )


@share_router.get("/{token}", response_model=SharedSceneOut)
def get_shared_scene(token: str, service: SceneServiceDep) -> SharedSceneOut:
    try:
        scene, comments = service.get_by_share_token(token)
    except SceneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return SharedSceneOut(
        scene=SceneOut.from_entity(scene),
        comments=[CommentOut.from_entity(c) for c in comments],
    )


@share_router.post("/{token}/comments", response_model=CommentOut, status_code=201)
def post_shared_comment(
    token: str,
    payload: CreateCommentRequest,
    service: SceneServiceDep,
) -> CommentOut:
    try:
        comment = service.add_comment(
            token=token,
            author=payload.author,
            text=payload.text,
            anchor=payload.anchor,
        )
    except SceneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return CommentOut.from_entity(comment)
