import tempfile
from collections import deque
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from autem_core.logging import get_logger

logger = get_logger("autem_api.image_preprocess")

MIN_FG_RATIO = 0.04  # menos que esto = la segmentación se comió el objeto
MAX_FG_RATIO = 0.985  # más que esto = no se quitó nada (fondo no uniforme)


@lru_cache(maxsize=1)
def _rembg_session():  # type: ignore[no-untyped-def]
    """Sesión de rembg cacheada (descarga el modelo la primera vez). None si no está instalado."""
    try:
        from rembg import new_session  # type: ignore[import-not-found]

        return new_session("isnet-general-use")
    except Exception as exc:  # noqa: BLE001
        logger.warning("preprocess.rembg_unavailable", error=str(exc))
        return None


def has_real_alpha(img: Image.Image) -> bool:
    """True si la imagen ya trae transparencia útil (>2% de píxeles no opacos)."""
    if img.mode != "RGBA":
        return False
    alpha = np.asarray(img.getchannel("A"))
    return float((alpha < 250).mean()) > 0.02


def _flood_fill_background_alpha(rgb_arr: np.ndarray, existing_alpha: np.ndarray) -> np.ndarray:
    """Quita SOLO el fondo conectado a los bordes. No toca píxeles claros dentro del objeto."""
    h, w, _ = rgb_arr.shape
    border = np.concatenate(
        [rgb_arr[0, :, :], rgb_arr[-1, :, :], rgb_arr[:, 0, :], rgb_arr[:, -1, :]], axis=0
    ).astype(np.float32)
    bg_median = np.median(border, axis=0)
    border_std = float(np.mean(np.std(border, axis=0)))
    tol = 30.0 if border_std < 28.0 else 20.0

    dist = np.linalg.norm(rgb_arr.astype(np.float32) - bg_median, axis=2)
    candidate_bg = dist < tol

    visited = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if candidate_bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if candidate_bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))
    while queue:
        cy, cx = queue.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and candidate_bg[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))

    return np.where(visited, 0, existing_alpha).astype(np.uint8)


def _remove_background(rgba: Image.Image) -> tuple[Image.Image, str]:
    """Devuelve (imagen_con_alpha, método). Si el resultado no es creíble, devuelve el original."""
    candidate: Image.Image | None = None
    method = "none"

    session = _rembg_session()
    if session is not None:
        try:
            from rembg import remove  # type: ignore[import-not-found]

            candidate = remove(rgba, session=session)
            method = "rembg"
        except Exception as exc:  # noqa: BLE001
            logger.warning("preprocess.rembg_failed", error=str(exc))

    if candidate is None:
        arr = np.array(rgba, dtype=np.uint8)
        alpha = _flood_fill_background_alpha(arr[:, :, :3], arr[:, :, 3])
        candidate = Image.fromarray(np.dstack([arr[:, :, :3], alpha]), mode="RGBA")
        method = "flood_fill"

    fg_ratio = float((np.asarray(candidate.getchannel("A")) > 127).mean())
    if not (MIN_FG_RATIO <= fg_ratio <= MAX_FG_RATIO):
        logger.warning("preprocess.bg_removal_rejected", method=method, fg_ratio=round(fg_ratio, 3))
        return rgba, "rejected"
    return candidate, method


def _square_pad(rgba: Image.Image, margin: float = 0.10, max_target: int = 1024) -> Image.Image:
    """Recorta al objeto y lo centra en un lienzo cuadrado transparente con margen."""
    alpha_bin = rgba.getchannel("A").point(lambda v: 255 if v > 10 else 0)
    bbox = alpha_bin.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    w, h = rgba.size
    side = max(1, int(round(max(w, h) / (1.0 - 2.0 * margin))))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(rgba, ((side - w) // 2, (side - h) // 2))
    target = min(max_target, side)
    if side != target:
        canvas = canvas.resize((target, target), Image.Resampling.LANCZOS)
    return canvas


def preprocess_image(
    image_path: Path,
    max_side: int = 1536,
    remove_bg: bool = False,
) -> Path:
    """Corrige EXIF, limita resolución y (opcional) aísla el objeto en lienzo cuadrado."""
    with Image.open(image_path) as img:
        normalized = ImageOps.exif_transpose(img)
        if normalized.mode not in ("RGB", "RGBA"):
            normalized = normalized.convert("RGBA")
        normalized.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

        if remove_bg and not has_real_alpha(normalized):
            rgba, method = _remove_background(normalized.convert("RGBA"))
            if method != "rejected":
                normalized = _square_pad(rgba)
            logger.info("preprocess.done", method=method, size=normalized.size)

        out_dir = Path(tempfile.mkdtemp(prefix="autem_pre_"))
        out_path = out_dir / f"{image_path.stem}_clean.png"
        normalized.save(out_path, format="PNG")
        return out_path
