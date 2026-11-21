import json
import socket
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from autem_providers.base import ProgressCb

_HEALTH_CACHE: dict[str, tuple[float, bool]] = {}
_CACHE_TTL_SEC = 3.0


def _fast_tcp_probe(base_url: str, timeout: float = 0.08) -> bool:
    """Fast TCP probe that resolves localhost to 127.0.0.1 to avoid Windows IPv6 2s SYN delay."""
    parsed = urlparse(base_url)
    host = parsed.hostname or "127.0.0.1"
    if host == "localhost":
        host = "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


class ComfyUIClient:
    """Real HTTP client for ComfyUI server (:8188): upload, queue prompt, poll history, download."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def is_healthy(self) -> bool:
        now = time.monotonic()
        cached = _HEALTH_CACHE.get(self.base_url)
        if cached and (now - cached[0]) < _CACHE_TTL_SEC:
            return cached[1]

        if not _fast_tcp_probe(self.base_url, timeout=0.08):
            _HEALTH_CACHE[self.base_url] = (now, False)
            return False

        probe_url = self.base_url.replace("://localhost", "://127.0.0.1")
        try:
            with httpx.Client(timeout=0.35) as client:
                resp = client.get(f"{probe_url}/system_stats")
                ok = resp.status_code == 200
        except Exception:
            ok = False

        _HEALTH_CACHE[self.base_url] = (now, ok)
        return ok

    def upload_image(self, image_path: Path) -> str:
        with (
            httpx.Client(timeout=60.0) as client,
            image_path.open("rb") as fh,
        ):
            resp = client.post(
                f"{self.base_url}/upload/image",
                files={"image": (image_path.name, fh, "image/png")},
                data={"overwrite": "true"},
            )
            resp.raise_for_status()
            payload: dict[str, Any] = resp.json()
            return str(payload["name"])

    def run_workflow(
        self,
        workflow_path: Path,
        replacements: dict[str, Any],
        on_progress: ProgressCb,
        expected_exts: tuple[str, ...],
        timeout_seconds: int = 300,
    ) -> Path:
        if not workflow_path.exists():
            raise FileNotFoundError(
                f"No se encontró el workflow de ComfyUI en {workflow_path}. "
                "Exporta tu workflow en formato API desde ComfyUI y guárdalo en esa ruta."
            )

        raw_text = workflow_path.read_text(encoding="utf-8")
        for placeholder, value in replacements.items():
            raw_text = raw_text.replace(f"{{{{{placeholder}}}}}", str(value))
        workflow: dict[str, Any] = json.loads(raw_text)

        on_progress(0.20, "Enviando workflow a ComfyUI local")
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(f"{self.base_url}/prompt", json={"prompt": workflow})
            resp.raise_for_status()
            prompt_id = str(resp.json()["prompt_id"])

            deadline = time.monotonic() + timeout_seconds
            output_item: dict[str, Any] | None = None

            while time.monotonic() < deadline:
                hist_resp = client.get(f"{self.base_url}/history/{prompt_id}")
                hist_resp.raise_for_status()
                hist_data: dict[str, Any] = hist_resp.json()
                entry = hist_data.get(prompt_id)
                if isinstance(entry, dict):
                    outputs = entry.get("outputs", {})
                    for node_out in outputs.values():
                        if not isinstance(node_out, dict):
                            continue
                        for group_key in ("images", "gifs", "videos", "meshes", "3d"):
                            items = node_out.get(group_key)
                            if isinstance(items, list):
                                for item in items:
                                    fname = str(item.get("filename", "")).lower()
                                    if any(fname.endswith(ext) for ext in expected_exts):
                                        output_item = item
                                        break
                            if output_item:
                                break
                        if output_item:
                            break
                    if output_item:
                        break
                on_progress(0.55, "Procesando en GPU local (ComfyUI)...")
                time.sleep(1.5)

            if not output_item:
                raise TimeoutError(
                    f"ComfyUI no devolvió un archivo {expected_exts} dentro de {timeout_seconds}s."
                )

            on_progress(0.85, "Descargando resultado desde ComfyUI")
            filename = str(output_item["filename"])
            subfolder = str(output_item.get("subfolder", ""))
            file_type = str(output_item.get("type", "output"))
            dl = client.get(
                f"{self.base_url}/view",
                params={"filename": filename, "subfolder": subfolder, "type": file_type},
                timeout=120.0,
            )
            dl.raise_for_status()

            out_dir = Path(tempfile.mkdtemp(prefix="autem_comfy_"))
            dest = out_dir / filename
            dest.write_bytes(dl.content)
            return dest
