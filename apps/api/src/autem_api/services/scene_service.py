import secrets
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from autem_api.services.job_service import JobService
from autem_api.storage.local import LocalAssetStore
from autem_api.storage.sqlite_store import SqliteStateStore


class SceneNotFoundError(Exception):
    """Raised when a scene, asset, or share token is not found."""


@dataclass
class SceneViewEntity:
    id: str
    scene_id: str
    name: str
    camera: dict[str, Any]
    thumbnail_asset_id: str | None = None
    render_job_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class SceneCommentEntity:
    id: str
    share_token: str
    author: str
    text: str
    anchor: list[float]
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class SceneEntity:
    id: str
    name: str
    source_asset_id: str
    share_token: str | None = None
    views: list[SceneViewEntity] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class SceneService:
    """Manages real 3D Orbit scenes, views, renders, and share comments with SQLite persistence."""

    def __init__(
        self,
        asset_store: LocalAssetStore,
        job_service: JobService,
        db: SqliteStateStore | None = None,
    ) -> None:
        self._asset_store = asset_store
        self._job_service = job_service
        self._db = db or SqliteStateStore()

    def _load_views(self, scene_id: str) -> list[SceneViewEntity]:
        rows = self._db.fetchall(
            "SELECT * FROM scene_views WHERE scene_id = ? ORDER BY created_at ASC",
            (scene_id,),
        )
        return [
            SceneViewEntity(
                id=str(r["id"]),
                scene_id=str(r["scene_id"]),
                name=str(r["name"]),
                camera=self._db.loads(r.get("camera_json"), {}),
                thumbnail_asset_id=r.get("thumbnail_asset_id"),
                render_job_id=r.get("render_job_id"),
                created_at=datetime.fromisoformat(str(r["created_at"])),
            )
            for r in rows
        ]

    def _row_to_scene(self, row: dict[str, Any]) -> SceneEntity:
        scene_id = str(row["id"])
        return SceneEntity(
            id=scene_id,
            name=str(row["name"]),
            source_asset_id=str(row["source_asset_id"]),
            share_token=row.get("share_token"),
            views=self._load_views(scene_id),
            created_at=datetime.fromisoformat(str(row["created_at"])),
        )

    def create_scene(self, name: str, source_asset_id: str) -> SceneEntity:
        record = self._asset_store.get(source_asset_id)
        if not record or not record.path.exists():
            raise SceneNotFoundError(
                f"Modelo 3D {source_asset_id} no encontrado. Sube un archivo GLB, GLTF, OBJ o STL."
            )

        scene = SceneEntity(
            id=str(uuid.uuid4()),
            name=name.strip() or record.filename,
            source_asset_id=source_asset_id,
        )
        self._db.execute(
            """
            INSERT INTO scenes (id, name, source_asset_id, share_token, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                scene.id,
                scene.name,
                scene.source_asset_id,
                scene.share_token,
                scene.created_at.isoformat(),
            ),
        )
        return scene

    def list_scenes(self) -> list[SceneEntity]:
        rows = self._db.fetchall("SELECT * FROM scenes ORDER BY created_at DESC")
        return [self._row_to_scene(r) for r in rows]

    def get_scene(self, scene_id: str) -> SceneEntity:
        row = self._db.fetchone("SELECT * FROM scenes WHERE id = ?", (scene_id,))
        if not row:
            raise SceneNotFoundError(f"Escena {scene_id} no encontrada")
        return self._row_to_scene(row)

    def add_view(
        self,
        scene_id: str,
        name: str,
        camera: dict[str, Any],
        thumbnail_asset_id: str | None = None,
        trigger_render: bool = True,
        style: str = "photoreal",
        material: str = "concrete",
        lighting: str = "golden_hour",
        prompt: str = "Architectural render from exact 3D camera view, photorealistic",
    ) -> SceneViewEntity:
        scene = self.get_scene(scene_id)
        render_job_id: str | None = None

        if trigger_render:
            job = self._job_service.create_render_job(
                asset_id=thumbnail_asset_id,
                prompt=prompt,
                style=style,
                material=material,
                lighting=lighting,
                label=f"Vista: {name}",
            )
            render_job_id = job.id

        view = SceneViewEntity(
            id=str(uuid.uuid4()),
            scene_id=scene.id,
            name=name.strip() or f"Vista {len(scene.views) + 1}",
            camera=camera,
            thumbnail_asset_id=thumbnail_asset_id,
            render_job_id=render_job_id,
        )
        self._db.execute(
            """
            INSERT INTO scene_views
                (id, scene_id, name, camera_json, thumbnail_asset_id, render_job_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                view.id,
                view.scene_id,
                view.name,
                self._db.dumps(view.camera),
                view.thumbnail_asset_id,
                view.render_job_id,
                view.created_at.isoformat(),
            ),
        )
        return view

    def create_share_link(self, scene_id: str) -> str:
        scene = self.get_scene(scene_id)
        if scene.share_token:
            return scene.share_token
        token = secrets.token_urlsafe(10)
        self._db.execute(
            "UPDATE scenes SET share_token = ? WHERE id = ?",
            (token, scene.id),
        )
        return token

    def get_by_share_token(self, token: str) -> tuple[SceneEntity, list[SceneCommentEntity]]:
        row = self._db.fetchone("SELECT * FROM scenes WHERE share_token = ?", (token,))
        if not row:
            raise SceneNotFoundError("Link compartido no encontrado o expirado")
        scene = self._row_to_scene(row)
        c_rows = self._db.fetchall(
            "SELECT * FROM scene_comments WHERE share_token = ? ORDER BY created_at ASC",
            (token,),
        )
        comments = [
            SceneCommentEntity(
                id=str(c["id"]),
                share_token=str(c["share_token"]),
                author=str(c["author"]),
                text=str(c["text"]),
                anchor=self._db.loads(c.get("anchor_json"), [0.0, 1.0, 0.0]),
                created_at=datetime.fromisoformat(str(c["created_at"])),
            )
            for c in c_rows
        ]
        return scene, comments

    def add_comment(
        self,
        token: str,
        author: str,
        text: str,
        anchor: list[float],
    ) -> SceneCommentEntity:
        self.get_by_share_token(token)
        comment = SceneCommentEntity(
            id=str(uuid.uuid4()),
            share_token=token,
            author=author.strip() or "Cliente",
            text=text.strip(),
            anchor=anchor[:3] if len(anchor) >= 3 else [0.0, 1.0, 0.0],
        )
        self._db.execute(
            """
            INSERT INTO scene_comments
                (id, share_token, author, text, anchor_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                comment.id,
                comment.share_token,
                comment.author,
                comment.text,
                self._db.dumps(comment.anchor),
                comment.created_at.isoformat(),
            ),
        )
        return comment
