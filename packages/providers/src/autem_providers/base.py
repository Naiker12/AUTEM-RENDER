from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class Where(StrEnum):
    LOCAL = "local"
    API = "api"


class ProviderKind(StrEnum):
    IMAGE_TO_3D = "image_to_3d"
    RENDER = "render"
    VIDEO = "video"
    UPSCALE = "upscale"


@dataclass(frozen=True)
class ProviderInfo:
    id: str
    label: str
    kind: ProviderKind
    where: Where
    est_cost_usd: float | None
    est_seconds: int
    outputs: tuple[str, ...]
    notes: str = ""
    quality_tier: str = "final"  # "final" | "preview"


@dataclass
class ImageTo3DRequest:
    image_paths: list[str]
    texture: bool = True
    face_limit: int | None = None
    seed: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ImageTo3DResult:
    mesh_path: str
    provider_id: str
    cost_usd: float | None
    raw_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ImageRenderRequest:
    image_path: str | None = None
    prompt: str = "Modern architectural house, photorealistic, sharp details"
    style: str = "photoreal"  # photoreal | clay | linework
    material: str = "concrete"  # concrete | timber | brick | stone | glass_steel
    lighting: str = "midday"  # midday | golden_hour | night | overcast
    resolution: str = "2k"  # 1k | 2k | 4k
    strength: float = 0.65
    upscale_factor: int | None = None
    seed: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ImageRenderResult:
    image_path: str
    provider_id: str
    cost_usd: float | None
    width: int
    height: int
    raw_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class VideoRequest:
    mode: str = "animate"  # "animate" | "transition"
    start_image_path: str | None = None
    end_image_path: str | None = None
    prompt: str = "Smooth architectural camera motion, natural daylight"
    camera_motion: str = "push_in"  # push_in | pan_right | orbit
    seconds: int = 5
    seed: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class VideoResult:
    video_path: str
    mime: str  # "video/mp4" | "image/webp"
    ext: str  # "mp4" | "webp"
    provider_id: str
    cost_usd: float | None
    seconds: int
    raw_metadata: dict[str, Any] = field(default_factory=dict)


ProgressCb = Callable[[float, str], None]


class ImageTo3DProvider(ABC):
    info: ProviderInfo

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if this provider has valid credentials/GPU/endpoint right now."""

    @abstractmethod
    def run(self, req: ImageTo3DRequest, on_progress: ProgressCb) -> ImageTo3DResult:
        """Execute image-to-3D generation and return the local path to the resulting mesh."""


class ImageProvider(ABC):
    info: ProviderInfo

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if this provider has valid credentials/GPU/endpoint right now."""

    @abstractmethod
    def run(self, req: ImageRenderRequest, on_progress: ProgressCb) -> ImageRenderResult:
        """Execute architectural render, re-light, or upscale and return local PNG path."""


class VideoProvider(ABC):
    info: ProviderInfo

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if this provider has valid credentials/GPU/endpoint right now."""

    @abstractmethod
    def run(self, req: VideoRequest, on_progress: ProgressCb) -> VideoResult:
        """Execute image-to-video (animate) or first-last-frame (transition)."""
