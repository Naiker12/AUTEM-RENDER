"""Initial PostgreSQL schema for Autem Render.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-21
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("folder", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "assets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("mime", sa.String(128), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("meta", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("provider_id", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Float(), nullable=False, server_default="0"),
        sa.Column("params", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "scenes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("source_asset_id", sa.String(36), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "scene_views",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("scene_id", sa.String(36), sa.ForeignKey("scenes.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("camera", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("thumbnail_asset_id", sa.String(36), nullable=True),
        sa.Column("render_job_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "share_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("scene_id", sa.String(36), sa.ForeignKey("scenes.id"), nullable=False),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("share_link_id", sa.String(36), sa.ForeignKey("share_links.id"), nullable=False),
        sa.Column("author", sa.String(120), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("anchor", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "provider_keys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("encrypted_key", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    for table in (
        "provider_keys",
        "comments",
        "share_links",
        "scene_views",
        "scenes",
        "jobs",
        "assets",
        "projects",
        "users",
    ):
        op.drop_table(table)
