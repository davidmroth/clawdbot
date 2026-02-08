---
name: qmd
description: Add content to and search personal markdown knowledge bases using QMD — a local hybrid search microservice. You CAN add content by registering collections (directories of markdown files), indexing them, and generating embeddings. You CAN search using keyword (BM25), semantic (vector), or hybrid (RRF) search. Use when users ask to search notes, find documents, add documents to their knowledge base, index a directory, "search my notes", "find in docs", "what did I write about", or "add this to my knowledge base" (based on https://github.com/tobi/qmd).
license: MIT
metadata:
  author: davidmroth
  version: "2.1"
allowed-tools: Bash(qmd:*),Bash(curl:*)
---

# QMD — Quick Markdown Search

QMD is a local search microservice at `http://localhost:8100`. All responses are JSON.
It can **add, index, and search** markdown content. It does NOT auto-discover content — you must set it up.

## Capabilities

You can do ALL of the following with QMD:

- **Add content**: register a directory of markdown files as a collection
- **Index content**: scan files, chunk them, and store in full-text search index
- **Embed content**: generate vector embeddings for semantic search
- **Search content**: keyword, semantic, or hybrid search across indexed collections
- **Retrieve documents**: fetch full document content by path
- **Manage collections**: add, list, or remove collections
- **Re-index**: update the index when files on disk change

## Adding Content (Content Lifecycle)

QMD requires a 3-step setup before search works. Always check status first.

### 1. Check if anything is indexed

```bash
curl -s "http://localhost:8100/status"
```

If `total_documents` is 0 or `indexed` is false, continue to step 2.

### 2. Register a collection

A collection maps a name to a directory on disk and a file glob pattern. This tells QMD where to find files.

```bash
curl -s -X POST "http://localhost:8100/collections" \
  -H "Content-Type: application/json" \
  -d '{"name": "docs", "path": "/home/node/clawd/docs", "pattern": "**/*.md"}'
```

Common collections to register:
- `docs` → `/home/node/clawd/docs` (project documentation)
- `skills` → `/home/node/clawd/skills` (skill files)
- `notes` → user's notes directory

### 3. Index and embed the collection

Indexing scans files into the full-text search index. Embedding generates vectors for semantic search. Both are required.

```bash
# Index (scan files, chunk, store in FTS)
curl -s -X POST "http://localhost:8100/index" \
  -H "Content-Type: application/json" \
  -d '{"collection": "docs"}'

# Embed (generate vectors — run after indexing)
curl -s -X POST "http://localhost:8100/embed" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Re-indexing after changes

When files on disk change, re-run index + embed. Only changed files are re-processed.

```bash
curl -s -X POST "http://localhost:8100/index" -H "Content-Type: application/json" -d '{"collection": "docs"}'
curl -s -X POST "http://localhost:8100/embed" -H "Content-Type: application/json" -d '{}'
```

## Searching Content

| Endpoint       | Use When                                         | Speed  |
| -------------- | ------------------------------------------------ | ------ |
| `GET /search`  | Best results needed (hybrid RRF, recommended)    | Medium |
| `GET /fts`     | Exact keyword matches needed                     | Fast   |
| `GET /vsearch` | Need conceptual/semantic matches                 | Medium |

```bash
# Hybrid search (recommended — combines keyword + semantic)
curl -s "http://localhost:8100/search?q=your+query&n=10"

# Keyword search (BM25/FTS5)
curl -s "http://localhost:8100/fts?q=your+query&n=10"

# Semantic vector search
curl -s "http://localhost:8100/vsearch?q=your+query&n=10"

# Filter by collection
curl -s "http://localhost:8100/search?q=your+query&collection=docs&n=10"
```

Query parameters: `q` (required), `n` (default 10), `collection` (optional filter).

## Retrieving Documents

```bash
# Get document by path
curl -s "http://localhost:8100/doc/docs/configuration.md"

# Get with line numbers
curl -s "http://localhost:8100/doc/docs/api.md?line_numbers=true"
```

## Managing Collections

```bash
# List all collections
curl -s "http://localhost:8100/collections"

# Add a collection
curl -s -X POST "http://localhost:8100/collections" \
  -H "Content-Type: application/json" \
  -d '{"name": "notes", "path": "/data/notes", "pattern": "**/*.md"}'

# Remove a collection
curl -s -X DELETE "http://localhost:8100/collections/notes"

# Force re-embed everything
curl -s -X POST "http://localhost:8100/embed" \
  -H "Content-Type: application/json" -d '{"force": true}'
```

## Multi-Instance Support

Add `X-Instance-ID` header to scope data per Clawdbot instance. Each instance gets its own database.

```bash
curl -s -H "X-Instance-ID: my-bot" "http://localhost:8100/status"
```

## Score Interpretation

| Score     | Meaning             | Action                  |
| --------- | ------------------- | ----------------------- |
| 0.8 - 1.0 | Highly relevant     | Show to user            |
| 0.5 - 0.8 | Moderately relevant | Include if few results  |
| 0.2 - 0.5 | Somewhat relevant   | Only if user wants more |
| 0.0 - 0.2 | Low relevance       | Usually skip            |

## Workflow Summary

1. `GET /status` — check if index exists; if empty, set up collections
2. `POST /collections` — register directories to index (first time only)
3. `POST /index` then `POST /embed` — populate index (first time + after file changes)
4. `GET /search?q=...` — search (hybrid recommended)
5. `GET /doc/{path}` — retrieve full document content
