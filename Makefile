.PHONY: infra-up infra-down dev-api dev-worker dev-web test lint

infra-up:
	docker compose up -d

infra-down:
	docker compose down

dev-api:
	uv run --package autem-api uvicorn autem_api.main:app --reload --host 0.0.0.0 --port 8000

dev-worker:
	uv run --package autem-worker celery -A autem_worker.celery_app:celery_app worker --loglevel=info --pool=solo

dev-web:
	pnpm --dir apps/web dev

test:
	uv run pytest

lint:
	uv run ruff check .
	uv run mypy packages apps/api/src apps/worker/src
	pnpm --dir apps/web lint
