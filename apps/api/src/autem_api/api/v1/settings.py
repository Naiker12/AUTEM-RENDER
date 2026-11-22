import os
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlparse

import httpx
import yaml
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from autem_api.deps import (
    get_cost_service,
    get_image_provider_registry,
    get_provider_registry,
    get_video_provider_registry,
)
from autem_api.services.cost_service import CostService
from autem_providers.registry import (
    ImageProviderRegistry,
    ProviderRegistry,
    VideoProviderRegistry,
    load_default_order,
)

router = APIRouter(prefix="/settings", tags=["settings"])
CostServiceDep = Annotated[CostService, Depends(get_cost_service)]
Reg3DDep = Annotated[ProviderRegistry, Depends(get_provider_registry)]
RegImgDep = Annotated[ImageProviderRegistry, Depends(get_image_provider_registry)]
RegVidDep = Annotated[VideoProviderRegistry, Depends(get_video_provider_registry)]

REPO_ROOT = Path(__file__).resolve().parents[5]
ENV_FILE = REPO_ROOT / ".env"
PROVIDERS_YAML = REPO_ROOT / "config" / "providers.yaml"

CLOUD_PROVIDERS: list[dict[str, str]] = [
    {
        "id": "huggingface",
        "label": "Hugging Face (Plan Gratis · Sin tarjeta)",
        "env_var": "HF_TOKEN",
        "placeholder": "hf_...",
        "models": "FLUX.1-schnell (render gratis con cuenta gratuita de Hugging Face)",
        "docs_url": "https://huggingface.co/settings/tokens",
        "short_url": "huggingface.co/tokens",
        "pricing": "free",
    },
    {
        "id": "fal",
        "label": "fal.ai (Todo en uno: 3D, Render, Upscale y Video)",
        "env_var": "FAL_KEY",
        "placeholder": "key_id:key_secret",
        "models": "TRELLIS.2, Pixal3D, Tripo H3.1, Hunyuan 3D 3.1 Pro, Flux, Clarity, Wan/LTX",
        "docs_url": "https://fal.ai/dashboard/keys",
        "short_url": "fal.ai/keys",
        "pricing": "paid",
    },
    {
        "id": "stability",
        "label": "Stability AI (Stable Fast 3D)",
        "env_var": "STABILITY_API_KEY",
        "placeholder": "sk-...",
        "models": "Stable Fast 3D (~5s, ~$0.05/modelo)",
        "docs_url": "https://platform.stability.ai/account/keys",
        "short_url": "stability.ai/keys",
        "pricing": "paid",
    },
    {
        "id": "tripo",
        "label": "Tripo3D Directo (Imagen a 3D)",
        "env_var": "TRIPO_API_KEY",
        "placeholder": "tsk_...",
        "models": "Tripo v2.5 / H3.1 PBR directo (~$0.20/modelo)",
        "docs_url": "https://platform.tripo3d.ai/api-keys",
        "short_url": "tripo3d.ai/keys",
        "pricing": "paid",
    },
    {
        "id": "meshy",
        "label": "Meshy Directo (Imagen a 3D)",
        "env_var": "MESHY_API_KEY",
        "placeholder": "msy_...",
        "models": "Meshy-5 / Meshy-6 PBR directo (~$0.35/modelo)",
        "docs_url": "https://app.meshy.ai/api",
        "short_url": "meshy.ai/api",
        "pricing": "paid",
    },
    {
        "id": "replicate",
        "label": "Replicate (TRELLIS Multi-vista)",
        "env_var": "REPLICATE_API_TOKEN",
        "placeholder": "r8_...",
        "models": "TRELLIS multi-vista y modelos open source en la nube",
        "docs_url": "https://replicate.com/account/api-tokens",
        "short_url": "replicate.com/tokens",
        "pricing": "paid",
    },
    {
        "id": "openai",
        "label": "OpenAI (Render Arquitectónico)",
        "env_var": "OPENAI_API_KEY",
        "placeholder": "sk-proj-...",
        "models": "gpt-image-1 (render y edición arquitectónica)",
        "docs_url": "https://platform.openai.com/api-keys",
        "short_url": "openai.com/keys",
        "pricing": "paid",
    },
]

LOCAL_ENGINES: list[dict[str, str]] = [
    {
        "id": "comfyui",
        "label": "ComfyUI Local / Remoto (GPU)",
        "env_var": "COMFYUI_URL",
        "default_url": "http://localhost:8188",
        "health_path": "/system_stats",
        "models": "TRELLIS.2, Pixal3D, Flux/ControlNet, Wan 2.2, LTX-2.5 (gratis en tu GPU)",
    },
    {
        "id": "ollama",
        "label": "Ollama Local (Asistente de Prompts)",
        "env_var": "OLLAMA_URL",
        "default_url": "http://localhost:11434",
        "health_path": "/api/tags",
        "models": "LLMs locales (Llama / Qwen) para enriquecer prompts arquitectónicos",
    },
    {
        "id": "local_3d",
        "label": "Servidor 3D Local (RunPod / Vast.ai / Gradio)",
        "env_var": "LOCAL_3D_URL",
        "default_url": "http://localhost:7860",
        "health_path": "/",
        "models": "Instancia dedicada de TRELLIS.2 / Hunyuan3D / TripoSR",
    },
]


def _mask_secret(value: str) -> str | None:
    if not value:
        return None
    if len(value) >= 10:
        return f"{value[:4]}...{value[-4:]}"
    return "***"


_LOCAL_CHECK_CACHE: dict[str, tuple[float, bool, int, str]] = {}
_LOCAL_CACHE_TTL = 15.0


def _check_http(url: str, health_path: str, force: bool = False) -> tuple[bool, int, str]:
    target = f"{url.rstrip('/')}{health_path}"
    now = time.monotonic()
    cached = _LOCAL_CHECK_CACHE.get(target)
    if not force and cached and (now - cached[0]) < _LOCAL_CACHE_TTL:
        return cached[1], cached[2], cached[3]

    probe_target = target.replace("://localhost", "://127.0.0.1")
    t0 = time.perf_counter()
    parsed = urlparse(probe_target)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        with socket.create_connection((host, port), timeout=0.05):
            pass
    except OSError:
        ms = int((time.perf_counter() - t0) * 1000)
        result = (
            False,
            ms,
            f"El motor local no está encendido en {host}:{port}. Inícialo para usarlo.",
        )
        _LOCAL_CHECK_CACHE[target] = (now, result[0], result[1], result[2])
        return result

    try:
        with httpx.Client(timeout=0.25) as client:
            resp = client.get(probe_target)
        ms = int((time.perf_counter() - t0) * 1000)
        ok = resp.status_code < 400
        result = (
            ok,
            ms,
            "Motor local en línea y listo para procesar."
            if ok
            else f"El servidor respondió con estado {resp.status_code}.",
        )
    except Exception:
        ms = int((time.perf_counter() - t0) * 1000)
        result = (
            False,
            ms,
            f"El servidor en {host}:{port} aún no responde. Verifica que haya arrancado.",
        )

    _LOCAL_CHECK_CACHE[target] = (now, result[0], result[1], result[2])
    return result


def _upsert_env_vars(updates: dict[str, str]) -> None:
    lines: list[str] = []
    if ENV_FILE.exists():
        lines = ENV_FILE.read_text(encoding="utf-8").splitlines()

    remaining = dict(updates)
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            new_lines.append(line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in remaining:
            new_lines.append(f"{key}={remaining.pop(key)}")
        else:
            new_lines.append(line)

    for key, val in remaining.items():
        new_lines.append(f"{key}={val}")

    ENV_FILE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def _promote_default_provider(section: str, provider_id: str) -> None:
    if not provider_id or provider_id == "auto":
        return
    raw: dict[str, Any] = {}
    if PROVIDERS_YAML.exists():
        raw = yaml.safe_load(PROVIDERS_YAML.read_text(encoding="utf-8")) or {}
    current = list(raw.get(section, {}).get("default_order", []))
    new_order = [provider_id, *[p for p in current if p != provider_id]]
    raw.setdefault(section, {})["default_order"] = new_order
    PROVIDERS_YAML.parent.mkdir(parents=True, exist_ok=True)
    PROVIDERS_YAML.write_text(
        yaml.safe_dump(raw, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


class CloudProviderStatus(BaseModel):
    id: str
    label: str
    env_var: str
    placeholder: str
    models: str
    docs_url: str
    short_url: str
    pricing: str  # "free" | "paid"
    configured: bool
    preview: str | None


class LocalEngineStatus(BaseModel):
    id: str
    label: str
    env_var: str
    url: str
    models: str
    online: bool


class ProviderSettingsOut(BaseModel):
    fal_key_configured: bool
    fal_key_preview: str | None
    comfyui_url: str
    comfyui_online: bool
    daily_cost_limit_usd: float
    free_only_mode: bool
    cloud_providers: list[CloudProviderStatus]
    local_engines: list[LocalEngineStatus]
    defaults: dict[str, str]
    active_engines_count: int


class UpdateProviderSettingsRequest(BaseModel):
    cloud_keys: dict[str, str] = Field(default_factory=dict)
    local_urls: dict[str, str] = Field(default_factory=dict)
    defaults: dict[str, str] = Field(default_factory=dict)
    daily_cost_limit_usd: float | None = Field(default=None, gt=0.0, le=500.0)
    free_only_mode: bool | None = Field(default=None)
    # Backward-compatible fields
    fal_key: str | None = Field(default=None)
    comfyui_url: str | None = Field(default=None)


class TestProviderRequest(BaseModel):
    provider_id: str


class TestProviderOut(BaseModel):
    provider_id: str
    ok: bool
    latency_ms: int
    detail: str


@router.get("/providers", response_model=ProviderSettingsOut)
def get_provider_settings(cost_service: CostServiceDep) -> ProviderSettingsOut:
    cloud_list: list[CloudProviderStatus] = []
    active_count = 0

    for item in CLOUD_PROVIDERS:
        val = os.getenv(item["env_var"], "").strip()
        configured = bool(val)
        if configured:
            active_count += 1
        cloud_list.append(
            CloudProviderStatus(
                id=item["id"],
                label=item["label"],
                env_var=item["env_var"],
                placeholder=item["placeholder"],
                models=item["models"],
                docs_url=item["docs_url"],
                short_url=item["short_url"],
                pricing=item["pricing"],
                configured=configured,
                preview=_mask_secret(val),
            )
        )

    local_list: list[LocalEngineStatus] = []
    comfy_url = os.getenv("COMFYUI_URL", "http://localhost:8188").strip()
    comfy_online = False

    def _probe_engine(eng: dict[str, str]) -> tuple[dict[str, str], str, bool]:
        url = os.getenv(eng["env_var"], eng["default_url"]).strip() or eng["default_url"]
        online, _, _ = _check_http(url, eng["health_path"])
        return eng, url, online

    with ThreadPoolExecutor(max_workers=len(LOCAL_ENGINES)) as pool:
        probed = list(pool.map(_probe_engine, LOCAL_ENGINES))

    for eng, url, online in probed:
        if online:
            active_count += 1
        if eng["id"] == "comfyui":
            comfy_url = url
            comfy_online = online
        local_list.append(
            LocalEngineStatus(
                id=eng["id"],
                label=eng["label"],
                env_var=eng["env_var"],
                url=url,
                models=eng["models"],
                online=online,
            )
        )

    fal_val = os.getenv("FAL_KEY", "").strip()
    defaults = {
        "image_to_3d": (load_default_order(PROVIDERS_YAML, "image_to_3d") or ["auto"])[0],
        "image": (load_default_order(PROVIDERS_YAML, "image") or ["auto"])[0],
        "upscale": (load_default_order(PROVIDERS_YAML, "upscale") or ["auto"])[0],
        "video": (load_default_order(PROVIDERS_YAML, "video") or ["auto"])[0],
    }

    return ProviderSettingsOut(
        fal_key_configured=bool(fal_val),
        fal_key_preview=_mask_secret(fal_val),
        comfyui_url=comfy_url,
        comfyui_online=comfy_online,
        daily_cost_limit_usd=cost_service.daily_limit_usd,
        free_only_mode=cost_service.free_only_mode,
        cloud_providers=cloud_list,
        local_engines=local_list,
        defaults=defaults,
        active_engines_count=active_count,
    )


@router.post("/providers", response_model=ProviderSettingsOut)
def update_provider_settings(
    payload: UpdateProviderSettingsRequest,
    cost_service: CostServiceDep,
) -> ProviderSettingsOut:
    import ipaddress
    from urllib.parse import urlparse

    def _sanitize_env_val(name: str, val: str) -> str:
        if any(ch in val for ch in ("\n", "\r", "\x00")) or val.startswith("="):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Valor inválido para {name}: no se permiten saltos de línea ni control."
                ),
            )
        return val

    def _validate_local_url(raw: str) -> str:
        parsed = urlparse(raw)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La URL del motor local debe usar http:// o https:// con un host válido.",
            )
        if os.getenv("AUTEM_ALLOW_REMOTE_LOCAL_URLS", "").lower() in ("1", "true", "yes"):
            return raw
        host = parsed.hostname.lower()
        if host in ("localhost", "127.0.0.1", "::1", "host.docker.internal"):
            return raw
        try:
            ip = ipaddress.ip_address(host)
            if ip.is_loopback or (ip.is_private and not ip.is_link_local):
                return raw
        except ValueError:
            pass
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Host no permitido para motor local ({host}). "
                "Usa localhost/127.0.0.1 o una IP privada de tu red local."
            ),
        )

    env_updates: dict[str, str] = {}
    cloud_map = {item["id"]: item["env_var"] for item in CLOUD_PROVIDERS}
    local_map = {item["id"]: (item["env_var"], item["default_url"]) for item in LOCAL_ENGINES}

    keys_to_apply = dict(payload.cloud_keys)
    if payload.fal_key is not None:
        keys_to_apply["fal"] = payload.fal_key

    for pid, raw_key in keys_to_apply.items():
        env_var = cloud_map.get(pid)
        if not env_var:
            continue
        cleaned = _sanitize_env_val(env_var, raw_key.strip())
        if cleaned:
            os.environ[env_var] = cleaned
            env_updates[env_var] = cleaned
        else:
            os.environ.pop(env_var, None)
            env_updates[env_var] = ""

    urls_to_apply = dict(payload.local_urls)
    if payload.comfyui_url is not None:
        urls_to_apply["comfyui"] = payload.comfyui_url

    for eid, raw_url in urls_to_apply.items():
        if eid not in local_map:
            continue
        env_var, default_url = local_map[eid]
        safe_url = _sanitize_env_val(env_var, raw_url.strip() or default_url)
        cleaned_url = _validate_local_url(safe_url)
        os.environ[env_var] = cleaned_url
        env_updates[env_var] = cleaned_url

    if payload.daily_cost_limit_usd is not None:
        cost_service.daily_limit_usd = payload.daily_cost_limit_usd
        env_updates["DAILY_COST_LIMIT_USD"] = str(payload.daily_cost_limit_usd)

    if payload.free_only_mode is not None:
        cost_service.free_only_mode = payload.free_only_mode
        os.environ["AUTEM_FREE_ONLY_MODE"] = "true" if payload.free_only_mode else "false"
        env_updates["AUTEM_FREE_ONLY_MODE"] = os.environ["AUTEM_FREE_ONLY_MODE"]

    if env_updates:
        _upsert_env_vars(env_updates)

    for section, provider_id in payload.defaults.items():
        if section in ("image_to_3d", "image", "upscale", "video"):
            _promote_default_provider(section, provider_id)

    return get_provider_settings(cost_service)


@router.post("/providers/test", response_model=TestProviderOut)
def test_provider_connection(
    payload: TestProviderRequest,
    reg_3d: Reg3DDep,
    reg_img: RegImgDep,
    reg_vid: RegVidDep,
) -> TestProviderOut:
    pid = payload.provider_id.strip().lower()

    # Local engine connectivity check (force live probe)
    for eng in LOCAL_ENGINES:
        if eng["id"] == pid:
            url = os.getenv(eng["env_var"], eng["default_url"]).strip() or eng["default_url"]
            ok, ms, detail = _check_http(url, eng["health_path"], force=True)
            return TestProviderOut(provider_id=pid, ok=ok, latency_ms=ms, detail=detail)

    # Cloud API live auth check
    cloud_checks: dict[str, tuple[str, str, dict[str, str]]] = {
        "huggingface": (
            "HF_TOKEN",
            "https://huggingface.co/api/whoami-v2",
            {"Authorization": f"Bearer {os.getenv('HF_TOKEN', '').strip()}"},
        ),
        "fal": (
            "FAL_KEY",
            "https://rest.alpha.fal.ai/tokens/current",
            {"Authorization": f"Key {os.getenv('FAL_KEY', '').strip()}"},
        ),
        "tripo": (
            "TRIPO_API_KEY",
            "https://api.tripo3d.ai/v2/openapi/user/balance",
            {"Authorization": f"Bearer {os.getenv('TRIPO_API_KEY', '').strip()}"},
        ),
        "meshy": (
            "MESHY_API_KEY",
            "https://api.meshy.ai/openapi/v1/image-to-3d",
            {"Authorization": f"Bearer {os.getenv('MESHY_API_KEY', '').strip()}"},
        ),
        "stability": (
            "STABILITY_API_KEY",
            "https://api.stability.ai/v1/user/balance",
            {"Authorization": f"Bearer {os.getenv('STABILITY_API_KEY', '').strip()}"},
        ),
        "replicate": (
            "REPLICATE_API_TOKEN",
            "https://api.replicate.com/v1/account",
            {"Authorization": f"Bearer {os.getenv('REPLICATE_API_TOKEN', '').strip()}"},
        ),
        "openai": (
            "OPENAI_API_KEY",
            "https://api.openai.com/v1/models",
            {"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY', '').strip()}"},
        ),
    }

    if pid not in cloud_checks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider desconocido: {pid}",
        )

    env_var, url, headers = cloud_checks[pid]
    if not os.getenv(env_var, "").strip():
        return TestProviderOut(
            provider_id=pid,
            ok=False,
            latency_ms=0,
            detail=f"Aún no has ingresado una clave para {env_var}. Pégala y vuelve a probar.",
        )

    t0 = time.perf_counter()
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url, headers=headers)
        ms = int((time.perf_counter() - t0) * 1000)
        # 200 OK or 405 Method Not Allowed (e.g. POST-only endpoint with valid auth)
        if resp.status_code in (200, 405):
            return TestProviderOut(
                provider_id=pid,
                ok=True,
                latency_ms=ms,
                detail="Conexión verificada correctamente. Proveedor listo para generar.",
            )
        if resp.status_code in (401, 403):
            return TestProviderOut(
                provider_id=pid,
                ok=False,
                latency_ms=ms,
                detail="La clave ingresada no fue aceptada por el proveedor. Revísala.",
            )
        return TestProviderOut(
            provider_id=pid,
            ok=False,
            latency_ms=ms,
            detail=f"El servicio externo respondió con estado {resp.status_code}.",
        )
    except Exception:
        ms = int((time.perf_counter() - t0) * 1000)
        return TestProviderOut(
            provider_id=pid,
            ok=False,
            latency_ms=ms,
            detail="No se pudo conectar con el proveedor externo. Revisa tu conexión.",
        )
