import os
import threading
from datetime import UTC, datetime, timedelta
from typing import Any

from autem_api.storage.sqlite_store import SqliteStateStore


class DailyCostLimitError(Exception):
    """Raised when launching a job would exceed DAILY_COST_LIMIT_USD or Free-Only mode."""


class CostService:
    """Tracks persistent API spend (today, 7d, month, all-time) and enforces budget limits."""

    def __init__(
        self,
        daily_limit_usd: float,
        db: SqliteStateStore | None = None,
        free_only_mode: bool | None = None,
    ) -> None:
        self.daily_limit_usd = daily_limit_usd
        self._db = db or SqliteStateStore()
        self.free_only_mode = (
            free_only_mode
            if free_only_mode is not None
            else os.getenv("AUTEM_FREE_ONLY_MODE", "false").lower() == "true"
        )
        self._lock = threading.Lock()
        self._reservations: dict[str, float] = {}

    @staticmethod
    def _today_prefix() -> str:
        return datetime.now(UTC).strftime("%Y-%m-%d")

    def _reserved_total(self) -> float:
        return sum(self._reservations.values())

    def reserve(self, job_id: str, estimated_cost_usd: float | None) -> None:
        """Atomically verify budget (including active reservations) and reserve estimated cost."""
        cost = max(0.0, float(estimated_cost_usd or 0.0))
        with self._lock:
            if self.free_only_mode and cost > 0:
                raise DailyCostLimitError(
                    "Modo Solo Gratis activado: se bloqueó un proveedor de pago "
                    f"(estimado ${cost:.2f} USD). Usa un motor gratis/local o desactiva "
                    "el Modo Solo Gratis en Configuración."
                )
            spent_today = self._spent_since(self._today_prefix(), is_prefix=True)
            reserved = self._reserved_total()
            if cost > 0 and (spent_today + reserved + cost) > self.daily_limit_usd:
                raise DailyCostLimitError(
                    f"Límite diario alcanzado: gastado ${spent_today:.2f} "
                    f"(+${reserved:.2f} en curso) / ${self.daily_limit_usd:.2f} USD "
                    f"(estimado trabajo: ${cost:.2f} USD)."
                )
            if cost > 0:
                self._reservations[job_id] = cost

    def release(self, job_id: str) -> None:
        """Release any active budget reservation when a job finishes or fails."""
        with self._lock:
            self._reservations.pop(job_id, None)

    def _spent_since(self, iso_prefix_or_cutoff: str, is_prefix: bool = False) -> float:
        if is_prefix:
            row = self._db.fetchone(
                "SELECT COALESCE(SUM(cost_usd), 0.0) AS total FROM jobs "
                "WHERE cost_usd > 0 AND created_at LIKE ?",
                (f"{iso_prefix_or_cutoff}%",),
            )
        else:
            row = self._db.fetchone(
                "SELECT COALESCE(SUM(cost_usd), 0.0) AS total FROM jobs "
                "WHERE cost_usd > 0 AND created_at >= ?",
                (iso_prefix_or_cutoff,),
            )
        return float(row["total"]) if row and row.get("total") is not None else 0.0

    def check_budget(self, estimated_cost_usd: float | None) -> None:
        cost = estimated_cost_usd or 0.0
        with self._lock:
            if self.free_only_mode and cost > 0:
                raise DailyCostLimitError(
                    "Modo Solo Gratis activado: se bloqueó un proveedor de pago "
                    f"(estimado ${cost:.2f} USD). Usa un motor gratis/local o desactiva "
                    "el Modo Solo Gratis en Configuración."
                )
            spent_today = self._spent_since(self._today_prefix(), is_prefix=True)
            reserved = self._reserved_total()
            if cost > 0 and (spent_today + reserved + cost) > self.daily_limit_usd:
                raise DailyCostLimitError(
                    f"Límite diario alcanzado: gastado ${spent_today:.2f} "
                    f"(+${reserved:.2f} en curso) / ${self.daily_limit_usd:.2f} USD "
                    f"(estimado trabajo: ${cost:.2f} USD)."
                )

    def record_cost(self, cost_usd: float | None) -> None:
        # Persisted automatically via jobs table in SQLite
        _ = cost_usd

    def summary(self) -> dict[str, Any]:
        with self._lock:
            today = self._today_prefix()
            spent_today = self._spent_since(today, is_prefix=True)
            reserved = self._reserved_total()
            remaining = max(0.0, self.daily_limit_usd - spent_today - reserved)
            return {
                "day": today,
                "spent_today_usd": round(spent_today, 4),
                "reserved_usd": round(reserved, 4),
                "daily_limit_usd": round(self.daily_limit_usd, 4),
                "remaining_usd": round(remaining, 4),
                "free_only_mode": self.free_only_mode,
            }

    def ledger(self) -> dict[str, Any]:
        now = datetime.now(UTC)
        today_prefix = now.strftime("%Y-%m-%d")
        month_prefix = now.strftime("%Y-%m")
        seven_days_ago = (now - timedelta(days=7)).isoformat()

        today_usd = self._spent_since(today_prefix, is_prefix=True)
        last_7d_usd = self._spent_since(seven_days_ago, is_prefix=False)
        month_usd = self._spent_since(month_prefix, is_prefix=True)

        total_row = self._db.fetchone(
            "SELECT COALESCE(SUM(cost_usd), 0.0) AS total, "
            "SUM(CASE WHEN COALESCE(cost_usd, 0) > 0 THEN 1 ELSE 0 END) AS paid_jobs, "
            "SUM(CASE WHEN COALESCE(cost_usd, 0) = 0 THEN 1 ELSE 0 END) AS free_jobs "
            "FROM jobs WHERE status = 'succeeded'"
        )
        all_time_usd = float(total_row["total"]) if total_row and total_row["total"] else 0.0
        paid_jobs = int(total_row["paid_jobs"] or 0) if total_row else 0
        free_jobs = int(total_row["free_jobs"] or 0) if total_row else 0

        by_provider_rows = self._db.fetchall(
            """
            SELECT provider_id,
                   COUNT(*) AS jobs_count,
                   COALESCE(SUM(cost_usd), 0.0) AS total_usd
            FROM jobs
            WHERE status = 'succeeded'
            GROUP BY provider_id
            ORDER BY total_usd DESC, jobs_count DESC
            """
        )
        recent_rows = self._db.fetchall(
            """
            SELECT id, kind, provider_id, status, COALESCE(cost_usd, 0.0) AS cost_usd,
                   message, created_at
            FROM jobs
            ORDER BY created_at DESC
            LIMIT 30
            """
        )

        return {
            "today_usd": round(today_usd, 4),
            "last_7d_usd": round(last_7d_usd, 4),
            "month_usd": round(month_usd, 4),
            "all_time_usd": round(all_time_usd, 4),
            "daily_limit_usd": round(self.daily_limit_usd, 4),
            "remaining_today_usd": round(max(0.0, self.daily_limit_usd - today_usd), 4),
            "free_only_mode": self.free_only_mode,
            "paid_jobs_count": paid_jobs,
            "free_jobs_count": free_jobs,
            "by_provider": [
                {
                    "provider_id": str(r["provider_id"]),
                    "jobs_count": int(r["jobs_count"]),
                    "total_usd": round(float(r["total_usd"]), 4),
                }
                for r in by_provider_rows
            ],
            "recent_items": [
                {
                    "id": str(r["id"]),
                    "kind": str(r["kind"]),
                    "provider_id": str(r["provider_id"]),
                    "status": str(r["status"]),
                    "cost_usd": round(float(r["cost_usd"]), 4),
                    "message": str(r["message"]),
                    "created_at": str(r["created_at"]),
                }
                for r in recent_rows
            ],
        }
