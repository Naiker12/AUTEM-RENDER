from collections.abc import Callable
from pathlib import Path
from typing import Any

import yaml

from autem_core.logging import get_logger
from autem_providers.base import (
    ImageProvider,
    ImageRenderRequest,
    ImageRenderResult,
    ImageTo3DProvider,
    ImageTo3DRequest,
    ImageTo3DResult,
    ProgressCb,
    ProviderInfo,
    ProviderKind,
    VideoProvider,
    VideoRequest,
    VideoResult,
)
from autem_providers.image.comfyui_provider import ComfyUIImageProvider
from autem_providers.image.fal_provider import FalImageProvider
from autem_providers.image.hf_provider import HuggingFaceImageProvider
from autem_providers.image.openai_provider import OpenAIImageProvider
from autem_providers.image.pollinations_provider import PollinationsImageProvider
from autem_providers.image_to_3d.comfyui_provider import ComfyUIImageTo3DProvider
from autem_providers.image_to_3d.fal_provider import FalImageTo3DProvider
from autem_providers.image_to_3d.hf_hunyuan_provider import HFHunyuan3DProvider
from autem_providers.image_to_3d.local_relief_provider import LocalRelief3DProvider
from autem_providers.image_to_3d.meshy_provider import MeshyDirectImageTo3DProvider
from autem_providers.image_to_3d.replicate_provider import ReplicateImageTo3DProvider
from autem_providers.image_to_3d.stability_provider import StabilitySF3DProvider
from autem_providers.image_to_3d.tripo_provider import TripoDirectImageTo3DProvider
from autem_providers.video.comfyui_provider import ComfyUIVideoProvider
from autem_providers.video.fal_provider import FalVideoProvider

logger = get_logger("autem_providers.registry")


class ProviderRegistry:
    def __init__(self) -> None:
        self._items: dict[str, ImageTo3DProvider] = {}

    def register(self, provider: ImageTo3DProvider) -> None:
        self._items[provider.info.id] = provider

    def get(self, provider_id: str) -> ImageTo3DProvider | None:
        return self._items.get(provider_id)

    def all_info(self) -> list[tuple[ProviderInfo, bool]]:
        return [(p.info, p.is_available()) for p in self._items.values()]

    def available(self) -> list[ProviderInfo]:
        return [p.info for p in self._items.values() if p.is_available()]

    def run_with_fallback(
        self,
        order: list[str],
        req: ImageTo3DRequest,
        on_progress: ProgressCb,
        budget_check: Callable[[float], None] | None = None,
    ) -> ImageTo3DResult:
        last_error: Exception | None = None
        attempted = 0
        attempts: list[dict[str, str]] = []
        for pid in order:
            provider = self._items.get(pid)
            if not provider or not provider.is_available():
                continue
            if budget_check is not None:
                try:
                    budget_check(float(provider.info.est_cost_usd or 0.0))
                except Exception as exc:
                    logger.warning("provider.budget_blocked", provider_id=pid, error=str(exc))
                    attempts.append(
                        {"provider_id": pid, "status": "budget_blocked", "detail": str(exc)}
                    )
                    last_error = exc
                    continue
            attempted += 1
            try:
                logger.info("provider.attempt", provider_id=pid)
                result = provider.run(req, on_progress)
                attempts.append({"provider_id": pid, "status": "succeeded", "detail": "ok"})
                result.raw_metadata["fallback_history"] = attempts
                return result
            except Exception as exc:
                logger.warning("provider.failed", provider_id=pid, error=str(exc))
                attempts.append({"provider_id": pid, "status": "failed", "detail": str(exc)})
                last_error = exc
        if attempted == 0:
            if last_error is not None:
                raise last_error
            raise RuntimeError(
                "No hay ningún provider 3D activo. Configura FAL_KEY en Configuración "
                "o inicia ComfyUI local."
            )
        raise RuntimeError(f"Todos los providers 3D fallaron: {last_error}")


class ImageProviderRegistry:
    def __init__(self) -> None:
        self._items: dict[str, ImageProvider] = {}

    def register(self, provider: ImageProvider) -> None:
        self._items[provider.info.id] = provider

    def get(self, provider_id: str) -> ImageProvider | None:
        return self._items.get(provider_id)

    def all_info(self) -> list[tuple[ProviderInfo, bool]]:
        return [(p.info, p.is_available()) for p in self._items.values()]

    def run_with_fallback(
        self,
        order: list[str],
        req: ImageRenderRequest,
        on_progress: ProgressCb,
        budget_check: Callable[[float], None] | None = None,
    ) -> ImageRenderResult:
        last_error: Exception | None = None
        attempted = 0
        for pid in order:
            provider = self._items.get(pid)
            if not provider or not provider.is_available():
                continue
            if budget_check is not None:
                try:
                    budget_check(float(provider.info.est_cost_usd or 0.0))
                except Exception as exc:
                    logger.warning("image_provider.budget_blocked", provider_id=pid, error=str(exc))
                    last_error = exc
                    continue
            attempted += 1
            try:
                logger.info("image_provider.attempt", provider_id=pid)
                return provider.run(req, on_progress)
            except Exception as exc:
                logger.warning("image_provider.failed", provider_id=pid, error=str(exc))
                last_error = exc
        if attempted == 0:
            if last_error is not None:
                raise last_error
            raise RuntimeError(
                "No hay ningún provider de imagen activo. Configura FAL_KEY en Configuración "
                "o inicia ComfyUI local."
            )
        raise RuntimeError(f"Todos los providers de imagen fallaron: {last_error}")


class VideoProviderRegistry:
    def __init__(self) -> None:
        self._items: dict[str, VideoProvider] = {}

    def register(self, provider: VideoProvider) -> None:
        self._items[provider.info.id] = provider

    def get(self, provider_id: str) -> VideoProvider | None:
        return self._items.get(provider_id)

    def all_info(self) -> list[tuple[ProviderInfo, bool]]:
        return [(p.info, p.is_available()) for p in self._items.values()]

    def run_with_fallback(
        self,
        order: list[str],
        req: VideoRequest,
        on_progress: ProgressCb,
        budget_check: Callable[[float], None] | None = None,
    ) -> VideoResult:
        last_error: Exception | None = None
        attempted = 0
        for pid in order:
            provider = self._items.get(pid)
            if not provider or not provider.is_available():
                continue
            if budget_check is not None:
                try:
                    budget_check(float(provider.info.est_cost_usd or 0.0))
                except Exception as exc:
                    logger.warning("video_provider.budget_blocked", provider_id=pid, error=str(exc))
                    last_error = exc
                    continue
            attempted += 1
            try:
                logger.info("video_provider.attempt", provider_id=pid)
                return provider.run(req, on_progress)
            except Exception as exc:
                logger.warning("video_provider.failed", provider_id=pid, error=str(exc))
                last_error = exc
        if attempted == 0:
            if last_error is not None:
                raise last_error
            raise RuntimeError(
                "No hay ningún provider de video activo. Configura FAL_KEY en Configuración "
                "o inicia ComfyUI local."
            )
        raise RuntimeError(f"Todos los providers de video fallaron: {last_error}")


REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_PROVIDERS_YAML = REPO_ROOT / "config" / "providers.yaml"


def load_default_order(
    config_path: Path = DEFAULT_PROVIDERS_YAML,
    section: str = "image_to_3d",
) -> list[str]:
    fallback = {
        "image_to_3d": [
            "comfyui.trellis2",
            "hf.hunyuan3d-2",
            "stability.sf3d",
            "tripo.direct",
            "fal.fal-ai/trellis-2",
            "fal.fal-ai/pixal3d",
            "fal.tripo3d/h3.1/image-to-3d",
            "fal.fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
            "meshy.direct",
            "replicate.firtoz/trellis",
            "local.relief_3d",
        ],
        "image": [
            "comfyui.render",
            "pollinations.flux",
            "hf.flux-schnell",
            "fal.fal-ai/flux/dev/image-to-image",
            "fal.fal-ai/flux-pro/v1.1-ultra",
            "openai.gpt-image-1",
        ],
        "upscale": ["fal.fal-ai/clarity-upscaler"],
        "video": [
            "comfyui.wan22",
            "comfyui.ltx25",
            "fal.fal-ai/wan-i2v",
            "fal.fal-ai/ltx-video-v095/multiconditioning",
        ],
    }
    resolved_path = config_path if config_path.exists() else DEFAULT_PROVIDERS_YAML
    if not resolved_path.exists():
        return fallback.get(section, [])
    raw: dict[str, Any] = yaml.safe_load(resolved_path.read_text(encoding="utf-8")) or {}
    section_cfg = raw.get(section, {})
    order = section_cfg.get("default_order", [])
    return [str(item) for item in order] if isinstance(order, list) else fallback.get(section, [])


def build_default_image_to_3d_registry() -> ProviderRegistry:
    registry = ProviderRegistry()
    registry.register(ComfyUIImageTo3DProvider())
    registry.register(HFHunyuan3DProvider())
    registry.register(LocalRelief3DProvider())
    registry.register(TripoDirectImageTo3DProvider())
    registry.register(MeshyDirectImageTo3DProvider())
    registry.register(StabilitySF3DProvider())
    registry.register(ReplicateImageTo3DProvider())
    registry.register(
        FalImageTo3DProvider(
            endpoint_id="fal-ai/trellis-2",
            label="TRELLIS.2 (fal.ai)",
            est_cost_usd=0.30,
            est_seconds=75,
            notes="Open-weights 4B PBR mesh vía fal.ai.",
        )
    )
    registry.register(
        FalImageTo3DProvider(
            endpoint_id="fal-ai/pixal3d",
            label="Pixal3D (fal.ai)",
            est_cost_usd=0.30,
            est_seconds=75,
            notes="Alineación precisa a la silueta de entrada (backbone TRELLIS.2).",
        )
    )
    registry.register(
        FalImageTo3DProvider(
            endpoint_id="tripo3d/h3.1/image-to-3d",
            label="Tripo H3.1 (fal.ai)",
            est_cost_usd=0.35,
            est_seconds=90,
            notes="Malla comercial de alto detalle vía fal.ai.",
        )
    )
    registry.register(
        FalImageTo3DProvider(
            endpoint_id="fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
            label="Hunyuan 3D 3.1 Pro (fal.ai)",
            est_cost_usd=0.45,
            est_seconds=100,
            notes="Geometría y texturas de alta fidelidad vía fal.ai.",
        )
    )
    return registry


def build_default_image_registry() -> ImageProviderRegistry:
    registry = ImageProviderRegistry()
    registry.register(ComfyUIImageProvider())
    registry.register(PollinationsImageProvider())
    registry.register(HuggingFaceImageProvider())
    registry.register(OpenAIImageProvider())
    registry.register(
        FalImageProvider(
            endpoint_id="fal-ai/flux/dev/image-to-image",
            label="Flux Dev Img2Img (fal.ai)",
            kind=ProviderKind.RENDER,
            est_cost_usd=0.04,
            est_seconds=15,
            notes="Render arquitectónico respetando composición y estructura.",
        )
    )
    registry.register(
        FalImageProvider(
            endpoint_id="fal-ai/flux-pro/v1.1-ultra",
            label="Flux Pro 1.1 Ultra (fal.ai)",
            kind=ProviderKind.RENDER,
            est_cost_usd=0.06,
            est_seconds=20,
            notes="Render fotorrealista de alta resolución vía fal.ai.",
        )
    )
    registry.register(
        FalImageProvider(
            endpoint_id="fal-ai/clarity-upscaler",
            label="Clarity Upscaler 4K (fal.ai)",
            kind=ProviderKind.UPSCALE,
            est_cost_usd=0.03,
            est_seconds=12,
            notes="Mejora de detalle y nitidez 2x–4x antes de pasar a video.",
        )
    )
    return registry


def build_default_video_registry() -> VideoProviderRegistry:
    registry = VideoProviderRegistry()
    registry.register(
        ComfyUIVideoProvider(
            provider_id="comfyui.wan22",
            label="Wan 2.2 Local (ComfyUI)",
            notes="Imagen→video open source en ComfyUI local (:8188).",
            workflow_path=Path("workflows/image_to_video_wan.json"),
        )
    )
    registry.register(
        ComfyUIVideoProvider(
            provider_id="comfyui.ltx25",
            label="LTX-2.5 FLF2V Local (ComfyUI)",
            notes="Transición primer/último cuadro en ComfyUI local (:8188).",
            workflow_path=Path("workflows/first_last_frame_ltx.json"),
        )
    )
    registry.register(
        FalVideoProvider(
            endpoint_id="fal-ai/wan-i2v",
            label="Wan I2V (fal.ai)",
            est_cost_usd=0.40,
            est_seconds=55,
            notes="Animación imagen→video MP4 vía API fal.ai.",
        )
    )
    registry.register(
        FalVideoProvider(
            endpoint_id="fal-ai/ltx-video-v095/multiconditioning",
            label="LTX Video FLF2V (fal.ai)",
            est_cost_usd=0.35,
            est_seconds=50,
            notes="Transición cinematográfica entre dos renders vía fal.ai.",
        )
    )
    return registry
