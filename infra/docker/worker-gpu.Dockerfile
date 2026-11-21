FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.12 \
    python3.12-venv \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
COPY packages ./packages
COPY apps/worker ./apps/worker
COPY config ./config
COPY workflows ./workflows

RUN uv sync --frozen --no-dev

CMD ["uv", "run", "celery", "-A", "autem_worker.celery_app:celery_app", "worker", "--loglevel=info"]
