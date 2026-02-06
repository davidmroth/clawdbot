# QMD Microservice

Local hybrid search engine for markdown content, running as a standalone microservice.
Supports FTS5 keyword search, vector semantic search, and hybrid Reciprocal Rank Fusion (RRF).

Based on [github.com/tobi/qmd](https://github.com/tobi/qmd).

## Architecture

```
┌─────────────────┐     HTTP (JSON)     ┌──────────────────────────┐
│  Clawdbot Agent  │ ──────────────────→ │   QMD Microservice       │
│  (any instance)  │  X-Instance-ID     │   FastAPI + Uvicorn      │
└─────────────────┘                     │                          │
                                        │  ┌─ Nomic Embed Model ─┐ │
                                        │  │  (resident in RAM)   │ │
                                        │  └──────────────────────┘ │
                                        │                          │
                                        │  ┌─ SQLite per instance ┐│
                                        │  │  FTS5 + sqlite-vec   ││
                                        │  └──────────────────────┘│
                                        └──────────────────────────┘
```

## Quick Start

### 1. Place the embedding model

Copy or symlink the model into `qmd/models/`:

```bash
cd qmd/models
ln -s ../../qmd-models/nomic-embed-text-v1.5.Q4_K_M.gguf .
```

### 2. Build and run with Docker Compose

```bash
docker compose up qmd
```

The service starts on port **8100** (configurable via `QMD_PORT` env var).

### 3. Verify

```bash
curl http://localhost:8100/health
# {"status": "ok"}
```

## API Endpoints

| Method   | Endpoint                      | Description                     |
| -------- | ----------------------------- | ------------------------------- |
| `GET`    | `/health`                     | Health check                    |
| `GET`    | `/search?q=...&n=10`         | Hybrid search (RRF)            |
| `GET`    | `/vsearch?q=...&n=10`        | Semantic vector search          |
| `GET`    | `/fts?q=...&n=20`            | Keyword search (BM25/FTS5)     |
| `GET`    | `/doc/{path}`                 | Retrieve document content       |
| `GET`    | `/status`                     | Index statistics                |
| `GET`    | `/collections`                | List configured collections     |
| `POST`   | `/collections`                | Add a collection                |
| `DELETE` | `/collections/{name}`         | Remove a collection             |
| `POST`   | `/index`                      | Index files from collections    |
| `POST`   | `/embed`                      | Generate vector embeddings      |
| `POST`   | `/context`                    | Add context annotation          |
| `DELETE` | `/context/{collection}/{path}`| Remove context annotation       |

All endpoints accept an optional `X-Instance-ID` header to scope data per Clawdbot instance.
When omitted, the `default` instance is used.

## Multi-Instance Support

Each Clawdbot instance gets its own SQLite database file and config, isolated by instance ID:

```
/data/qmd/
├── default/
│   └── index.sqlite
├── instance-abc/
│   └── index.sqlite
└── config/
    ├── default/
    │   └── index.yml
    └── instance-abc/
        └── index.yml
```

Pass the header on every request:

```bash
curl -H "X-Instance-ID: my-bot" "http://localhost:8100/search?q=hello"
```

## Environment Variables

| Variable               | Default                                              | Description               |
| ---------------------- | ---------------------------------------------------- | ------------------------- |
| `QMD_EMBED_MODEL_PATH` | `/app/qmd-models/nomic-embed-text-v1.5.Q4_K_M.gguf` | Path to embedding model   |
| `QMD_DATA_DIR`         | `/data/qmd`                                          | Base dir for SQLite DBs   |
| `QMD_CONFIG_DIR`       | `/data/qmd/config`                                   | Base dir for YAML configs |
| `QMD_PORT`             | `8100`                                               | Service port              |

## CLI Wrapper

A thin Bash wrapper (`qmd.sh`) is provided for backward compatibility with the original CLI interface:

```bash
./qmd.sh search "your query" -n 5
./qmd.sh status
./qmd.sh get "docs/api.md"
```

Set `QMD_URL` to point to a non-default host/port, and `QMD_INSTANCE_ID` for multi-instance usage.

## Development

Run locally without Docker:

```bash
cd qmd
pip install -r requirements.txt
QMD_EMBED_MODEL_PATH=../qmd-models/nomic-embed-text-v1.5.Q4_K_M.gguf \
  uvicorn app.main:app --reload --port 8100
```
