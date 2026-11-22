# Cómo añadir un provider nuevo en Autem Render

Todos los modelos (locales, gratuitos o por API) implementan la misma interfaz en `packages/providers/src/autem_providers/base.py`.

## Pasos

1. Crea un adaptador en `packages/providers/src/autem_providers/<categoria>/` heredando de `ImageTo3DProvider`, `ImageProvider` o `VideoProvider`.
2. Implementa:
   - `info`: `ProviderInfo` con `id`, `label`, `kind`, `where`, `est_cost_usd`, `est_seconds`, `outputs`.
   - `is_available() -> bool`: verifica si existe API key, servidor ComfyUI o servicio disponible.
   - `run(req, on_progress)`: ejecuta el modelo y reporta progreso `0.0..1.0`.
3. Regístralo en `packages/providers/src/autem_providers/registry.py`.
4. Añade su `id` al orden de fallback en `config/providers.yaml`.

## Providers incluidos

### Imagen a 3D
- `comfyui.trellis2` — TRELLIS.2 local en tu GPU vía ComfyUI (`$0.00`).
- `hf.hunyuan3d-2` — Tencent Hunyuan3D-2 neuronal 360° + PBR en Hugging Face ZeroGPU (`$0.00`, `HF_TOKEN` opcional para 5× cuota).
- `local.relief_3d` — Reconstrucción local volumétrica rápida en CPU (`$0.00`, respaldo offline).
- `stability.sf3d`, `tripo.direct`, `meshy.direct`, `replicate.firtoz/trellis` y `fal.*` (`trellis-2`, `pixal3d`, `tripo3d/h3.1`, `hunyuan-3d/v3.1/pro`).

### Render e Imagen
- `comfyui.render` — Flux / SDXL local en ComfyUI (`$0.00`).
- `pollinations.flux` — Pollinations Flux (`$0.00`, sin clave).
- `hf.flux-schnell` — Hugging Face FLUX.1-schnell (`$0.00` con `HF_TOKEN`).
- `fal.fal-ai/flux/dev/image-to-image`, `fal.fal-ai/flux-pro/v1.1-ultra`, `openai.gpt-image-1`, `fal.fal-ai/clarity-upscaler`.

### Video
- `comfyui.wan22`, `comfyui.ltx25` (locales en ComfyUI, `$0.00`).
- `fal.fal-ai/wan-i2v`, `fal.fal-ai/ltx-video-v095/multiconditioning`.
