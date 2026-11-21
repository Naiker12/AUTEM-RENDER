# Cómo añadir un provider nuevo en Autem Render

Todos los modelos (locales o por API) implementan la misma interfaz en `packages/providers/src/autem_providers/base.py`.

## Pasos

1. Crea un adaptador en `packages/providers/src/autem_providers/<categoria>/` heredando de `ImageTo3DProvider` (o la interfaz correspondiente).
2. Implementa:
   - `info`: `ProviderInfo` con `id`, `label`, `kind`, `where`, `est_cost_usd`, `est_seconds`, `outputs`.
   - `is_available() -> bool`: verifica si existe API key, servidor ComfyUI o GPU disponible.
   - `run(req, on_progress) -> ImageTo3DResult`: ejecuta el modelo y reporta progreso `0.0..1.0`.
3. Regístralo en `build_default_image_to_3d_registry()` dentro de `packages/providers/src/autem_providers/registry.py`.
4. Añade su `id` al orden de fallback en `config/providers.yaml`.

## Providers incluidos en Fase 0

- `mock.image_to_3d` — genera un archivo `.glb` válido al instante sin API key ni GPU.
- `fal.fal-ai/trellis-2` — TRELLIS.2 vía fal.ai (requiere `FAL_KEY`).
- `fal.fal-ai/pixal3d` — Pixal3D vía fal.ai (requiere `FAL_KEY`).
- `fal.tripo3d/h3.1/image-to-3d` — Tripo H3.1 vía fal.ai (requiere `FAL_KEY`).
