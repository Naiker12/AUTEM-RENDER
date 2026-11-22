# Changelog

## v0.2.0 — 2026-11-22 (Local-First Security, Budget Guard & Open Source Release)

### Added
- **Free 360° Neural 3D Provider (`hf.hunyuan3d-2`):** Tencent Hunyuan3D-2 running on Hugging Face ZeroGPU (`$0.00`, 5× higher quota with free `HF_TOKEN`).
- **Content-Hash Cache:** Identical Image-to-3D jobs reuse cached GLB/OBJ/STL outputs instantly at `$0.00`.
- **Self-Contained Offline HTML 3D Viewer Export:** `GET /api/v1/scenes/{scene_id}/export-html` generates a single `.html` file with embedded GLB and interactive Three.js viewer.
- **Server-Persisted Projects/Folders:** `/api/v1/projects` (`GET`, `POST`, `DELETE`) backed by SQLite.
- **Daily Spend Chip in TopBar:** Live budget status (`Hoy $X / $5.00` or `Solo Gratis`) next to engine status.
- **Right-Click Context Menu & Fluid Delete Dialogs:** Unified `StudioContextMenu` + `ConfirmDeleteDialog` across `/image-to-3d`, `/render`, `/video`, and `/projects`, backed by `DELETE /api/v1/assets/{id}`, `DELETE /api/v1/jobs/{id}`, and `DELETE /api/v1/scenes/{id}`.
- **Open-Source Essentials:** MIT `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/models-and-licenses.md`, lean `docker-compose.yml` + optional `compose.gpu.yml`.

### Security & Reliability
- Removed unused multi-user login/JWT flow; bound API strictly to `127.0.0.1` + `TrustedHostMiddleware` + optional `AUTEM_ACCESS_TOKEN`.
- Removed arbitrary client `image_paths` parameter; all inputs resolve strictly via `asset_ids` inside `data/storage/`.
- Added `.env` newline-injection rejection, local URL SSRF validation (blocking link-local `169.254.169.254`), chunked upload streaming, and real Pillow/`glTF` binary content validation.
- Enforced per-provider budget validation inside `run_with_fallback` + atomic cost reservations (`reserved_usd`) + `ThreadPoolExecutor(max_workers=4)` + orphan job reconciliation on startup.
- Isolated `pytest` into `tmp_path` (`conftest.py`) and added ESLint 9 flat config (`eslint.config.mjs`).
