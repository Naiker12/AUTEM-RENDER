from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    folder: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class AssetModel(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    mime: Mapped[str] = mapped_column(String(128), nullable=False)
    size: Mapped[int] = mapped_column(nullable=False, default=0)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class JobModel(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SceneModel(Base):
    __tablename__ = "scenes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=True
    )
    source_asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class SceneViewModel(Base):
    __tablename__ = "scene_views"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scene_id: Mapped[str] = mapped_column(String(36), ForeignKey("scenes.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    camera: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    thumbnail_asset_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    render_job_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class ShareLinkModel(Base):
    __tablename__ = "share_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scene_id: Mapped[str] = mapped_column(String(36), ForeignKey("scenes.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CommentModel(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    share_link_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("share_links.id"), nullable=False
    )
    author: Mapped[str] = mapped_column(String(120), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    anchor: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class ProviderKeyModel(Base):
    __tablename__ = "provider_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    encrypted_key: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
