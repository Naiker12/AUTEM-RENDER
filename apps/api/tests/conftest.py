from collections.abc import Iterator
from pathlib import Path

import pytest

from autem_api import deps


def _clear_dep_caches() -> None:
    deps.get_state_store.cache_clear()
    deps.get_asset_store.cache_clear()
    deps.get_cost_service.cache_clear()
    deps.get_job_service.cache_clear()
    deps.get_scene_service.cache_clear()


@pytest.fixture(autouse=True)
def _isolated_test_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Isolate every API test into tmp_path so pytest never pollutes tmp/autem_render.db."""
    monkeypatch.setenv("AUTEM_DB_PATH", str(tmp_path / "test_autem.db"))
    monkeypatch.setenv("AUTEM_STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setenv("AUTEM_OFFLINE_TESTS", "1")
    _clear_dep_caches()
    yield
    _clear_dep_caches()
