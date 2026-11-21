from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from autem_api.deps import get_scene_service
from autem_api.domain.errors import ProviderUnavailableError
from autem_api.services.scene_service import (
    SceneCommentEntity,
    SceneEntity,
    SceneNotFoundError,
    SceneService,
    SceneViewEntity,
)

router = APIRouter(prefix="/scenes", tags=["scenes"])
share_router = APIRouter(prefix="/share", tags=["share"])
SceneServiceDep = Annotated[SceneService, Depends(get_scene_service)]


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
