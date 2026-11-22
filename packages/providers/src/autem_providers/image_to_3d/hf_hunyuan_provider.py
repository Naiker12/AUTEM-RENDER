import json
import os
import tempfile
from pathlib import Path
from typing import Any

import httpx

from autem_providers.base import (
    ImageTo3DProvider,
    ImageTo3DRequest,
    ImageTo3DResult,
    ProgressCb,
    ProviderInfo,
    ProviderKind,
    Where,
)

HUNYUAN3D_SPACE_HOST = "https://tencent-hunyuan3d-2.hf.space"


def _extract_glb_url(payload: list[Any], prefer_index: int = 0) -> str | None:
    """Extract a downloadable GLB URL from a Gradio SSE complete payload."""
    order = [prefer_index, *[i for i in range(len(payload)) if i != prefer_index]]
    for idx in order:
        if idx >= len(payload):
            continue
        item = payload[idx]
        if isinstance(item, dict):
            val = item.get("value", item)
            if isinstance(val, dict):
                url = val.get("url")
                if isinstance(url, str) and url.startswith("http"):
                    return url
                path = val.get("path")
                if isinstance(path, str) and path.endswith(".glb"):
                    return f"{HUNYUAN3D_SPACE_HOST}/file={path}"
    return None


class HFHunyuan3DProvider(ImageTo3DProvider):
    """Real neural 360-degree Image-to-3D via Tencent Hunyuan3D-2 on Hugging Face ZeroGPU ($0)."""

    def __init__(self) -> None:
        self.info = ProviderInfo(
            id="hf.hunyuan3d-2",
            label="Hunyuan3D-2 · 360° Real (Hugging Face · Gratis)",
            kind=ProviderKind.IMAGE_TO_3D,
            where=Where.API,
            est_cost_usd=0.0,
            est_seconds=35,
            outputs=("glb", "obj", "stl"),
            notes=(
                "Modelo neuronal 3D real 360° de Tencent en Hugging Face ZeroGPU a $0 USD. "
                "Agrega tu HF_TOKEN gratis en Configuración para mayor cuota diaria y texturas PBR."
            ),
        )

    def is_available(self) -> bool:
        return os.environ.get("AUTEM_OFFLINE_TESTS") != "1"

    def _call_gradio_endpoint(
        self,
        client: httpx.Client,
        endpoint: str,
        data: list[Any],
        on_progress: ProgressCb,
        start_pct: float,
        end_pct: float,
        status_msg: str,
    ) -> list[Any]:
        on_progress(start_pct, status_msg)
        call_res = client.post(
            f"{HUNYUAN3D_SPACE_HOST}/call/{endpoint}",
            json={"data": data},
        )
        if call_res.status_code != 200:
            raise RuntimeError(
                f"Hunyuan3D-2 ({endpoint}) respondió HTTP {call_res.status_code}: "
                f"{call_res.text[:160]}"
            )
        event_id = call_res.json().get("event_id")
        if not event_id:
            raise RuntimeError("Hunyuan3D-2 no devolvió event_id de cola.")

        with client.stream("GET", f"{HUNYUAN3D_SPACE_HOST}/call/{endpoint}/{event_id}") as resp:
            cur_event: str | None = None
            tick = 0
            for line in resp.iter_lines():
                if not line:
                    continue
                if line.startswith("event:"):
                    cur_event = line.split(":", 1)[1].strip()
                elif line.startswith("data:"):
                    raw_data = line.split(":", 1)[1].strip()
                    if cur_event == "heartbeat":
                        tick += 1
                        pct = min(end_pct - 0.03, start_pct + tick * 0.04)
                        on_progress(pct, f"{status_msg} (GPU ZeroGPU)...")
                    elif cur_event == "complete":
                        parsed = json.loads(raw_data)
                        if isinstance(parsed, list):
                            return parsed
                        raise RuntimeError("Respuesta inesperada de Hunyuan3D-2.")
                    elif cur_event == "error":
                        detail = raw_data if raw_data and raw_data != "null" else "cuota ZeroGPU"
                        raise RuntimeError(
                            f"Hunyuan3D-2 ZeroGPU no disponible ahora ({detail}). "
                            "Agrega un HF_TOKEN gratuito en Configuración para más cuota."
                        )
        raise RuntimeError("Conexión cerrada antes de recibir la malla 3D de Hunyuan3D-2.")

    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        if not req.image_paths:
            raise ValueError("Se requiere al menos una imagen para generar en 3D.")

        hf_token = os.environ.get("HF_TOKEN", "").strip()
        headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}
        seed = req.seed if req.seed is not None else 42
        remove_bg = bool(req.extra.get("remove_bg", True))
        want_texture = bool(req.texture)

        with httpx.Client(timeout=210.0, follow_redirects=True, headers=headers) as client:
            on_progress(0.10, "Subiendo imagen a Hunyuan3D-2 (Hugging Face ZeroGPU)...")
            uploaded_objs: list[dict[str, Any]] = []
            for path_str in req.image_paths[:4]:
                p = Path(path_str)
                mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
                up = client.post(
                    f"{HUNYUAN3D_SPACE_HOST}/upload",
                    files={"files": (p.name, p.read_bytes(), mime)},
                )
                if up.status_code != 200:
                    raise RuntimeError(
                        f"Error subiendo imagen a Hunyuan3D-2: HTTP {up.status_code}"
                    )
                remote_path = up.json()[0]
                uploaded_objs.append(
                    {
                        "path": remote_path,
                        "url": f"{HUNYUAN3D_SPACE_HOST}/file={remote_path}",
                        "orig_name": p.name,
                        "meta": {"_type": "gradio.FileData"},
                    }
                )

            primary = uploaded_objs[0]
            mv_front = uploaded_objs[0] if len(uploaded_objs) > 1 else None
            mv_back = uploaded_objs[1] if len(uploaded_objs) > 1 else None
            mv_left = uploaded_objs[2] if len(uploaded_objs) > 2 else None
            mv_right = uploaded_objs[3] if len(uploaded_objs) > 3 else None

            gradio_args: list[Any] = [
                None,  # caption
                primary if len(uploaded_objs) == 1 else None,  # single image
                mv_front,
                mv_back,
                mv_left,
                mv_right,
                25,  # steps (fast & crisp)
                5.0,  # guidance_scale
                int(seed) % 100000,
                256,  # octree_resolution
                remove_bg,  # check_box_rembg
                8000,  # num_chunks
                False,  # randomize_seed
            ]

            glb_url: str | None = None
            used_mode = "shape_only"

            if want_texture:
                try:
                    result_arr = self._call_gradio_endpoint(
                        client,
                        endpoint="generation_all",
                        data=gradio_args,
                        on_progress=on_progress,
                        start_pct=0.22,
                        end_pct=0.84,
                        status_msg="Generando geometría 360° y texturas PBR en Hunyuan3D-2",
                    )
                    # Index 1 is textured GLB, index 0 is untextured mesh
                    glb_url = _extract_glb_url(result_arr, prefer_index=1)
                    used_mode = "pbr_textured"
                except Exception:
                    # If full PBR texture painting hits ZeroGPU timeout/quota,
                    # fall back cleanly to fast neural 360° geometry generation.
                    glb_url = None

            if not glb_url:
                result_arr = self._call_gradio_endpoint(
                    client,
                    endpoint="shape_generation",
                    data=gradio_args,
                    on_progress=on_progress,
                    start_pct=0.25,
                    end_pct=0.85,
                    status_msg="Reconstruyendo malla 3D neuronal 360° en Hunyuan3D-2",
                )
                glb_url = _extract_glb_url(result_arr, prefer_index=0)
                used_mode = "shape_only"

            if not glb_url:
                raise RuntimeError("Hunyuan3D-2 completó pero no devolvió URL de archivo .glb.")

            on_progress(0.88, "Descargando modelo 3D (.glb)...")
            glb_res = client.get(glb_url)
            if glb_res.status_code != 200 or not glb_res.content:
                raise RuntimeError(
                    f"Error descargando GLB de Hunyuan3D-2 (HTTP {glb_res.status_code})"
                )

            out_dir = Path(tempfile.mkdtemp(prefix="autem_hf_hunyuan_"))
            mesh_path = out_dir / "hunyuan3d_2.glb"
            mesh_path.write_bytes(glb_res.content)

            return ImageTo3DResult(
                mesh_path=str(mesh_path),
                provider_id=self.info.id,
                cost_usd=0.0,
                raw_metadata={
                    "space": "tencent/Hunyuan3D-2",
                    "mode": used_mode,
                    "authenticated": bool(hf_token),
                },
            )
