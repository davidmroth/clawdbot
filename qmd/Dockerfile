# ---------------------------------------------------------------------------
# QMD Microservice — Dockerfile
# Builds a self-contained image with Python, FastAPI, llama-cpp, sqlite-vec,
# and the pre-placed nomic embedding model.
# ---------------------------------------------------------------------------

# ---- builder stage ----
FROM python:3.12-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential cmake wget && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install Python deps into a venv so we can copy it cleanly
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download sqlite-vec shared library
RUN wget -q https://github.com/asg017/sqlite-vec/releases/download/v0.1.7-alpha.2/sqlite-vec-0.1.7-alpha.2-loadable-linux-x86_64.tar.gz \
    -O /tmp/vec.tar.gz && \
    tar -xzf /tmp/vec.tar.gz -C /tmp && \
    cp /tmp/vec0.so /usr/local/lib/vec0.so && \
    rm -rf /tmp/vec* /tmp/sqlite-vec*

# ---- runtime stage ----
FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libgomp1 curl && \
    rm -rf /var/lib/apt/lists/*

# Copy Python venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy sqlite-vec extension
COPY --from=builder /usr/local/lib/vec0.so /usr/local/lib/vec0.so

# Copy application code
WORKDIR /app
COPY app/ ./app/

# Copy pre-placed embedding model
# The model must exist at ../qmd-models/ relative to the build context,
# or be placed into qmd/models/ before building.
COPY models/ /app/qmd-models/

# Environment defaults
ENV QMD_EMBED_MODEL_PATH="/app/qmd-models/nomic-embed-text-v1.5.Q4_K_M.gguf" \
    QMD_DATA_DIR="/data/qmd" \
    QMD_CONFIG_DIR="/data/qmd/config" \
    PYTHONUNBUFFERED=1

# Persistent data volume
VOLUME /data/qmd

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD curl -f http://localhost:8100/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
