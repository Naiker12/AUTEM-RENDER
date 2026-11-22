import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_DB_PATH = REPO_ROOT / "data" / "autem_render.db"


class SqliteStateStore:
    """Thread-safe SQLite persistence for assets, jobs, scenes, views, and comments."""

    def __init__(self, db_path: Path | None = None) -> None:
        env_path = os.environ.get("AUTEM_DB_PATH")
        self.db_path = db_path or (Path(env_path) if env_path else DEFAULT_DB_PATH)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    mime TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    path TEXT NOT NULL,
                    meta_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    provider_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress REAL NOT NULL,
                    message TEXT NOT NULL,
                    params_json TEXT NOT NULL,
                    input_asset_ids_json TEXT NOT NULL,
                    output_asset_ids_json TEXT NOT NULL,
                    output_assets_json TEXT NOT NULL,
                    output_mesh_path TEXT,
                    mesh_stats_json TEXT,
                    cost_usd REAL,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT
                );
                CREATE TABLE IF NOT EXISTS scenes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    source_asset_id TEXT NOT NULL,
                    share_token TEXT UNIQUE,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS scene_views (
                    id TEXT PRIMARY KEY,
                    scene_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    camera_json TEXT NOT NULL,
                    thumbnail_asset_id TEXT,
                    render_job_id TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS scene_comments (
                    id TEXT PRIMARY KEY,
                    share_token TEXT NOT NULL,
                    author TEXT NOT NULL,
                    text TEXT NOT NULL,
                    anchor_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS content_cache (
                    cache_key TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
                """
            )

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(sql, params)
            conn.commit()

    def fetchall(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]

    def fetchone(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(sql, params).fetchone()
            return dict(row) if row else None

    @staticmethod
    def dumps(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def loads(raw: str | None, default: Any) -> Any:
        if not raw:
            return default
        return json.loads(raw)
