FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY config ./config
COPY workflows ./workflows

RUN uv sync --frozen --no-dev

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "autem_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
