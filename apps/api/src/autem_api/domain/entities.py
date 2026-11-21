from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from autem_api.domain.enums import JobKind, JobStatus


@dataclass
class JobEntity:
    id: str
    kind: JobKind
    provider_id: str
    status: JobStatus = JobStatus.QUEUED
    progress: float = 0.0
    message: str = "En cola"
    params: dict[str, Any] = field(default_factory=dict)
    input_asset_ids: list[str] = field(default_factory=list)
    output_asset_ids: list[str] = field(default_factory=list)
    output_assets: dict[str, str] = field(default_factory=dict)  # {"glb": asset_id, ...}
    output_mesh_path: str | None = None
    mesh_stats: dict[str, Any] | None = None
    cost_usd: float | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = None
    finished_at: datetime | None = None
