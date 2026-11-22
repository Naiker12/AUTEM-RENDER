import os
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from autem_api.domain.enums import AssetKind
from autem_api.storage.sqlite_store import SqliteStateStore

REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_STORAGE_DIR = REPO_ROOT / "data" / "storage"


@dataclass
class AssetRecord:
    id: str
    kind: AssetKind
    filename: str
    mime: str
    size: int
    path: Path
    meta: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class LocalAssetStore:
    """Disk-backed asset store with SQLite metadata persistence across restarts."""

    def __init__(
        self,
        root_dir: Path | None = None,
        db: SqliteStateStore | None = None,
    ) -> None:
        env_dir = os.environ.get("AUTEM_STORAGE_DIR")
        self.root_dir = root_dir or (Path(env_dir) if env_dir else DEFAULT_STORAGE_DIR)
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self._db = db or SqliteStateStore()

    def _row_to_record(self, row: dict[str, Any]) -> AssetRecord:
        return AssetRecord(
            id=str(row["id"]),
            kind=AssetKind(str(row["kind"])),
            filename=str(row["filename"]),
            mime=str(row["mime"]),
            size=int(row["size"]),
            path=Path(str(row["path"])),
            meta=self._db.loads(row.get("meta_json"), {}),
            created_at=datetime.fromisoformat(str(row["created_at"])),
        )

    def _persist(self, rec: AssetRecord) -> None:
        self._db.execute(
            """
            INSERT OR REPLACE INTO assets
                (id, kind, filename, mime, size, path, meta_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rec.id,
                rec.kind.value,
                rec.filename,
                rec.mime,
                rec.size,
                str(rec.path),
                self._db.dumps(rec.meta),
                rec.created_at.isoformat(),
            ),
        )

    def save_bytes(
        self,
        data: bytes,
        filename: str,
        mime: str,
        kind: AssetKind,
        meta: dict[str, Any] | None = None,
    ) -> AssetRecord:
        asset_id = str(uuid.uuid4())
        suffix = Path(filename).suffix.lower() or ".bin"
        subdir = self.root_dir / kind.value
        subdir.mkdir(parents=True, exist_ok=True)
        dest = subdir / f"{asset_id}{suffix}"
        dest.write_bytes(data)

        record = AssetRecord(
            id=asset_id,
            kind=kind,
            filename=filename,
            mime=mime,
            size=len(data),
            path=dest,
            meta=meta or {},
        )
        self._persist(record)
        return record

    def save_file(
        self,
        source_path: Path,
        filename: str,
        mime: str,
        kind: AssetKind,
        meta: dict[str, Any] | None = None,
    ) -> AssetRecord:
        asset_id = str(uuid.uuid4())
        suffix = Path(filename).suffix.lower() or source_path.suffix.lower() or ".bin"
        subdir = self.root_dir / kind.value
        subdir.mkdir(parents=True, exist_ok=True)
        dest = subdir / f"{asset_id}{suffix}"
        shutil.copy2(source_path, dest)

        record = AssetRecord(
            id=asset_id,
            kind=kind,
            filename=filename,
            mime=mime,
            size=dest.stat().st_size,
            path=dest,
            meta=meta or {},
        )
        self._persist(record)
        return record

    def get(self, asset_id: str) -> AssetRecord | None:
        row = self._db.fetchone("SELECT * FROM assets WHERE id = ?", (asset_id,))
        return self._row_to_record(row) if row else None

    def list_all(self) -> list[AssetRecord]:
        rows = self._db.fetchall("SELECT * FROM assets ORDER BY created_at DESC")
        return [self._row_to_record(r) for r in rows]

    def delete(self, asset_id: str) -> bool:
        record = self.get(asset_id)
        if not record:
            return False
        if record.path.exists() and record.path.is_file():
            record.path.unlink(missing_ok=True)
        self._db.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
        return True
