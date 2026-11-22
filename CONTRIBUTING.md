# Contributing to Autem Render

Thank you for your interest in contributing! Autem Render is an open-source, local-first AI studio for architectural Image-to-3D, Render, Video, and 3D Orbit scenes.

## Quick Local Setup

```bash
# 1. Clone and install Python workspace dependencies
uv sync --all-packages

# 2. Install frontend dependencies
pnpm --dir apps/web install

# 3. Copy environment template
cp .env.example .env

# 4. Run API (127.0.0.1:8000) + Web (localhost:3000)
# Windows:
.\dev.ps1
# Linux / macOS:
make dev-api   # terminal 1
make dev-web   # terminal 2
```

## Running Checks Before Opening a PR

```bash
uv run ruff check .
uv run pytest -v
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
```

## Guidelines

- Keep the app **local-first** (no mandatory login, bind to `127.0.0.1`).
- Never introduce mock/fake providers or placeholder demo assets.
- Add unit tests in `apps/api/tests/` or `packages/providers/tests/` for any new endpoint or provider.
- See [docs/providers.md](docs/providers.md) for how to add a new AI provider.
