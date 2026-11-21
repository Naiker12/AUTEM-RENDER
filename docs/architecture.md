# AUTEM RENDER — Plataforma propia de render, imagen→3D y video con IA

> Documento de arquitectura y plan de construcción desde cero.
> Backend en **Python**, frontend en **TypeScript (Next.js + Three.js)**, modelos **locales y por API** intercambiables.
> Fecha: 21 de noviembre de 2026.

---

## 0. Resumen ejecutivo

| Decisión | Elección | Por qué |
|---|---|---|
| Backend | **Python 3.12 + FastAPI** | Todo el ecosistema de IA (PyTorch, diffusers, trimesh) es Python |
| Cola de trabajos | **Redis + Celery** | Los trabajos de IA duran 30 s a varios minutos; no pueden bloquear la API |
| Base de datos | **PostgreSQL** + SQLAlchemy 2 + Alembic | Estándar, migraciones limpias |
| Almacenamiento | **MinIO** (local) → S3/R2 (producción) | Mismo API en ambos |
| Frontend | **Next.js + React + TypeScript** | Ecosistema enorme |
| Visor 3D | **Three.js vía React Three Fiber + drei** | Visor GLB, cámara orbital, capturas de vistas |
| Modelos | **Capa de "providers" intercambiables** (local + API) | El corazón del proyecto. Cambias de modelo con una línea de config |
| Motor local de imagen/video | **ComfyUI como servidor** (su API en `:8188`) | Ya soporta Wan, LTX, TRELLIS.2, Pixal3D con workflows listos |

**Nombre elegido: `Autem Render`** (repo: `autem-render`).

---

## 1. Arquitectura general

```
┌──────────────────────────┐
│  Frontend (Next.js)      │  Visor 3D, galería, formularios, progreso
└────────────┬─────────────┘
             │ HTTPS (REST + SSE para progreso)
┌────────────▼─────────────┐
│  API (FastAPI)           │  Auth, validación, crea "jobs", sirve resultados
└───────┬──────────┬───────┘
        │          │
   ┌────▼───┐  ┌───▼────────┐
   │Postgres│  │ Redis      │  cola + caché + pub/sub de progreso
   └────────┘  └───┬────────┘
                   │
        ┌──────────▼───────────┐
        │  Workers (Celery)    │  ejecutan los jobs
        └──────────┬───────────┘
                   │  capa de providers (una interfaz, muchas implementaciones)
   ┌───────────────┼─────────────────────────────┐
   │               │                             │
┌──▼─────────┐ ┌───▼──────────────┐ ┌────────────▼───────┐
│ Providers  │ │ Providers LOCALES│ │ Providers API      │
│ ComfyUI    │ │ TRELLIS.2 /      │ │ fal.ai, Replicate, │
│ (imagen,   │ │ Pixal3D /        │ │ Meshy, Tripo,      │
│ video)     │ │ Hunyuan3D        │ │ Hunyuan API...     │
└────────────┘ └──────────────────┘ └────────────────────┘
                   │
            ┌──────▼──────┐
            │ MinIO / S3  │  imágenes, GLB, videos
            └─────────────┘
```

### Reglas del monorepo

- La **API nunca importa PyTorch**. Solo los workers y los providers locales lo hacen.
- `domain/` no importa FastAPI ni SQLAlchemy.
- Un archivo = una responsabilidad. Si pasa de ~300 líneas, se divide.
- Todo el I/O externo (APIs de terceros, GPU, S3) está detrás de una interfaz en `packages/providers` o `storage/`.
- Tipado estricto (`mypy`) y formato automático (`ruff`) desde el primer día.

---

## 2. Modelo de datos (mínimo)

```text
users            (id, email, password_hash, created_at)
projects         (id, user_id, name, folder, created_at)
assets           (id, project_id, kind[image|mesh|video], storage_key, mime, size, meta jsonb)
jobs             (id, project_id, kind[render|image_to_3d|video|upscale],
                  provider_id, status[queued|running|succeeded|failed|canceled],
                  params jsonb, progress, error, cost_usd,
                  input_asset_ids[], output_asset_ids[],
                  created_at, started_at, finished_at)
scenes           (id, project_id, source_asset_id, name)
scene_views      (id, scene_id, camera jsonb, thumbnail_asset_id, render_job_id)
share_links      (id, scene_id, token, expires_at, revoked_at)
comments         (id, share_link_id, author, text, anchor jsonb)
provider_keys    (id, user_id, provider, encrypted_key)
```

---

## 3. API (endpoints principales)

```text
POST   /api/v1/assets                      # subir archivo (devuelve asset_id)
GET    /api/v1/providers?kind=image_to_3d  # modelos disponibles + costo + tiempo

POST   /api/v1/jobs/image-to-3d            # {asset_ids[], provider_id|auto, options}
POST   /api/v1/jobs/render                 # {asset_id, prompt, style, material, res}
POST   /api/v1/jobs/video/animate          # {asset_id, prompt, seconds}
POST   /api/v1/jobs/video/transition       # {start_asset_id, end_asset_id, seconds}
POST   /api/v1/jobs/upscale

GET    /api/v1/jobs/{id}                   # estado
GET    /api/v1/jobs/{id}/events            # SSE de progreso
POST   /api/v1/jobs/{id}/cancel

POST   /api/v1/scenes                      # {asset_id}  (modelo 3D importado)
POST   /api/v1/scenes/{id}/views           # guarda cámara + dispara render de esa vista
POST   /api/v1/scenes/{id}/share           # crea link público
```

---

## 4. Plan por fases

### Fase 0 — Cimientos (1–2 días)
- Repo, `docker-compose` (Postgres, Redis, MinIO), `uv` + `pnpm`, lint, pre-commit.
- API "hello world" + worker "hello world" que reciben y completan un job falso.
- Frontend con layout oscuro, sidebar (Proyectos, Render, Escena 3D, Video, Imagen a 3D).

### Fase 1 — Imagen a 3D (prioridad, 1–2 semanas)
1. Subir imagen + preprocesado (quitar fondo con `rembg`, recorte).
2. Provider API (fal.ai con 2–3 modelos) → GLB.
3. Visor 3D en el navegador (R3F + drei) con rotación, wireframe, descarga.
4. Selector de modelo con costo/tiempo estimado.
5. Postproceso: decimar, escalar, exportar GLB/OBJ/STL.
6. Provider local (TRELLIS.2 vía ComfyUI) cuando haya GPU.
7. Comparador lado a lado de modelos.
8. Entrada multi-imagen (2–4 vistas).

### Fase 2 — Render de imagen
- Provider de imagen (API primero, ComfyUI después).
- Estilos (Photoreal / Clay / Linework), materiales, re-light, upscale, variaciones ("Explore").

### Fase 3 — Video
- Animar (imagen→video) y Transición (primer/último cuadro).
- Providers: Wan 2.2 / LTX-2.5 local, más uno por API.

### Fase 4 — Escena 3D
- Importar GLB/OBJ/GLTF/STL al visor, guardar vistas de cámara, render por vista, compartir por link + comentarios anclados.

### Fase 5 — Producción
- Auth completa, créditos/planes, límites por usuario, pagos, observabilidad, backups, CI/CD.
