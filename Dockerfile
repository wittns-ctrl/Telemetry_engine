# Lectio API image.
#
#   docker build -t lectio-api .
#   docker run --env-file .env -p 8000:8000 lectio-api
#
# Configuration comes from environment variables (see .env.example); no .env
# file is baked into the image.

FROM python:3.14-slim AS build

COPY --from=ghcr.io/astral-sh/uv:0.12.1 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Server dependencies only (no dev group, no agent extra), exactly as locked.
COPY pyproject.toml uv.lock ./
# The redis extra too: with REDIS_URL set, several API containers share state.
RUN uv sync --locked --no-dev --no-install-project --extra redis


FROM python:3.14-slim

RUN useradd --system --uid 10001 --home-dir /app lectio

WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY app ./app
# The Windows agent handed out at /api/v1/agent/download, if one was built
# (agent/build_exe.py). docker-compose.yml mounts the folder instead.
COPY downloads ./downloads

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production \
    # Behind a reverse proxy, set this to the proxy's address so rate limits
    # see each visitor's IP (from X-Forwarded-For). Never "*" if the container
    # port is reachable directly: clients could then pick their own IP.
    FORWARDED_ALLOW_IPS=127.0.0.1

USER lectio
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4).status == 200 else 1)"]

# One process per container. To scale out, set REDIS_URL and run more
# containers behind a load balancer (docker-compose.yml shows how): rate
# limits, alert state and live updates are then shared through Redis.
# Without REDIS_URL, run exactly one container.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
