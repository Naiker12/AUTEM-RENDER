import tempfile
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


def _flood_fill_background_alpha(rgb_arr: np.ndarray, existing_alpha: np.ndarray) -> np.ndarray:
    """Segment uniform/studio background connected to the image borders using flood-fill."""
    h, w, _ = rgb_arr.shape
    border_pixels = np.concatenate(
        [
            rgb_arr[0, :, :],
            rgb_arr[-1, :, :],
            rgb_arr[:, 0, :],
            rgb_arr[:, -1, :],
        ],
        axis=0,
    ).astype(np.float32)

    bg_median = np.median(border_pixels, axis=0)
    border_std = float(np.mean(np.std(border_pixels, axis=0)))
    tol = 42.0 if border_std < 28.0 else 26.0

    dist_to_bg = np.linalg.norm(rgb_arr.astype(np.float32) - bg_median, axis=2)
    candidate_bg = dist_to_bg < tol

    # Downsampled BFS flood-fill from image perimeter for speed (<5ms)
    visited = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        if candidate_bg[0, x]:
            visited[0, x] = True
            queue.append((0, x))
        if candidate_bg[h - 1, x] and not visited[h - 1, x]:
            visited[h - 1, x] = True
            queue.append((h - 1, x))
    for y in range(h):
        if candidate_bg[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            queue.append((y, 0))
        if candidate_bg[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            queue.append((y, w - 1))

    while queue:
        cy, cx = queue.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and candidate_bg[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))

    # Also remove isolated interior background holes (e.g. between chair legs) matching bg_median
    interior_holes = dist_to_bg < (tol * 0.65)
    bg_mask = visited | interior_holes

    # Safety check: if flood-fill removed almost the entire image (>94%), keep original alpha
    fg_ratio = 1.0 - float(np.mean(bg_mask))
    if fg_ratio < 0.04:
        return existing_alpha

    return np.where(bg_mask, 0, existing_alpha).astype(np.uint8)


def preprocess_image(
    image_path: Path,
    max_side: int = 1536,
    remove_bg: bool = False,
) -> Path:
    """Fix EXIF orientation, optionally isolate foreground subject, and cap resolution."""
    with Image.open(image_path) as img:
        normalized = ImageOps.exif_transpose(img)
        if normalized.mode not in ("RGB", "RGBA"):
            normalized = normalized.convert("RGBA")
        normalized.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

        if remove_bg:
            rgba = normalized.convert("RGBA")
            try:
                from rembg import remove  # type: ignore[import-not-found]

                rgba = remove(rgba)
            except Exception:
                arr = np.array(rgba, dtype=np.uint8)
                alpha = _flood_fill_background_alpha(arr[:, :, :3], arr[:, :, 3])
                rgba = Image.fromarray(
                    np.dstack([arr[:, :, :3], alpha]),
                    mode="RGBA",
                )
            bbox = rgba.getbbox()
            if bbox:
                rgba = rgba.crop(bbox)
            normalized = rgba

        out_dir = Path(tempfile.mkdtemp(prefix="autem_pre_"))
        out_path = out_dir / f"{image_path.stem}_clean.png"
        normalized.save(out_path, format="PNG")
        return out_path
