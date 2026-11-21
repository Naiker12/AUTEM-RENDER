import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


def preprocess_image_pipeline(
    image_path: Path,
    max_side: int = 1536,
    remove_bg: bool = False,
) -> Path:
    """Normalize orientation, optionally isolate foreground subject, and resize."""
    with Image.open(image_path) as img:
        normalized = ImageOps.exif_transpose(img).convert("RGBA")
        normalized.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

        if remove_bg:
            try:
                from rembg import remove  # type: ignore[import-not-found]

                normalized = remove(normalized)
            except Exception:
                # Deterministic corner-background alpha isolation when rembg is not installed
                arr = np.array(normalized, dtype=np.int16)
                rgb = arr[:, :, :3]
                corners = np.vstack(
                    [rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]]
                )
                bg_color = np.median(corners, axis=0)
                dist = np.linalg.norm(rgb - bg_color, axis=2)
                alpha = np.where(dist < 18.0, 0, arr[:, :, 3]).astype(np.uint8)
                rgba_out = arr[:, :, :3].astype(np.uint8)
                normalized = Image.fromarray(np.dstack([rgba_out, alpha]), mode="RGBA")

            bbox = normalized.getbbox()
            if bbox:
                normalized = normalized.crop(bbox)

        out_dir = Path(tempfile.mkdtemp(prefix="autem_pre_"))
        out_path = out_dir / f"{image_path.stem}_clean.png"
        normalized.save(out_path, format="PNG")
        return out_path
