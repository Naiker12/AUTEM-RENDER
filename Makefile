.PHONY: up down dev-api dev-web test lint

up:
	docker compose up -d --build

down:
	docker compose down

dev-api:
	uv run uvicorn autem_api.main:app --reload --reload-dir apps/api/src --reload-dir packages/providers/src --reload-dir packages/core/src --host 127.0.0.1 --port 8000

dev-web:
	pnpm --dir apps/web dev

test:
	uv run pytest -v

lint:
	uv run ruff check .
	uv run mypy packages apps/api/src apps/worker/src
	pnpm --dir apps/web typecheck
	pnpm --dir apps/web lint
