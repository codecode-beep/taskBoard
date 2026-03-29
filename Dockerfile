# Root Dockerfile for hosts (e.g. Render) that build from the repo root.
# Same app as backend/Dockerfile; paths are adjusted for context = repository root.

FROM python:3.12-slim

# CA bundle for TLS to MongoDB Atlas (slim image omits it; fixes SSL handshake errors)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app

EXPOSE 8000

# Render sets PORT; default 8000 for local/docker-compose
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
