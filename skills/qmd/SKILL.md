---
name: qmd
description: Search personal markdown knowledge bases, notes, meeting transcripts, and documentation using QMD - a local hybrid search engine. Combines BM25 keyword search, vector semantic search, and hybrid RRF fusion. Use when users ask to search notes, find documents, look up information in their knowledge base, retrieve meeting notes, or search documentation. Triggers on "search markdown files", "search my notes", "find in docs", "look up", "what did I write about", "meeting notes about" (based on https://github.com/tobi/qmd).
license: MIT
metadata:
  author: davidmroth
  version: "2.0"
allowed-tools: Bash(qmd:*),Bash(curl:*)
---

# QMD - Quick Markdown Search

QMD is a local, on-device search engine for markdown content. It runs as a microservice and indexes your notes, meeting transcripts, documentation, and knowledge bases for fast retrieval.

## Service

QMD runs as an HTTP microservice. The base URL defaults to `http://localhost:8100`.
All endpoints accept an optional `X-Instance-ID` header to scope data per Clawdbot instance.

## When to Use This Skill

- User asks to search their notes, documents, or knowledge base
- User needs to find information in their markdown files
- User wants to retrieve specific documents or search across collections
- User asks "what did I write about X" or "find my notes on Y"
- User needs semantic search (conceptual similarity) not just keyword matching
- User mentions meeting notes, transcripts, or documentation lookup

## Search Endpoints

Choose the right search mode for the task:

| Endpoint      | Use When                                         | Speed  |
| ------------- | ------------------------------------------------ | ------ |
| `GET /fts`    | Exact keyword matches needed                     | Fast   |
| `GET /vsearch`| Keywords aren't working, need conceptual matches | Medium |
| `GET /search` | Best results needed (hybrid RRF)                 | Slower |

### Hybrid search (best quality)
```bash
curl "http://localhost:8100/search?q=your+query&n=10"
```

### Keyword search (BM25)
```bash
curl "http://localhost:8100/fts?q=your+query&n=10"
```

### Semantic vector search
```bash
curl "http://localhost:8100/vsearch?q=your+query&n=10"
```

### Filter by collection
```bash
curl "http://localhost:8100/search?q=your+query&collection=notes"
```

## Common Query Parameters

| Param        | Default | Description                       |
| ------------ | ------- | --------------------------------- |
| `q`          | —       | Search query (required)           |
| `n`          | 10      | Number of results                 |
| `collection` | —       | Restrict to specific collection   |

## Document Retrieval

```bash
# Get document by path
curl "http://localhost:8100/doc/collection/path/to/doc.md"

# Get with line numbers
curl "http://localhost:8100/doc/docs/api.md?line_numbers=true"
```

## Index Management

```bash
# Check index status and available collections
curl "http://localhost:8100/status"

# List all collections
curl "http://localhost:8100/collections"

# Index files from all collections
curl -X POST "http://localhost:8100/index" -H "Content-Type: application/json" -d '{}'

# Index a specific collection
curl -X POST "http://localhost:8100/index" -H "Content-Type: application/json" -d '{"collection": "notes"}'

# Generate embeddings
curl -X POST "http://localhost:8100/embed" -H "Content-Type: application/json" -d '{}'

# Force re-embed all documents
curl -X POST "http://localhost:8100/embed" -H "Content-Type: application/json" -d '{"force": true}'
```

## Collection Management

```bash
# Add a collection
curl -X POST "http://localhost:8100/collections" \
  -H "Content-Type: application/json" \
  -d '{"name": "notes", "path": "/data/notes", "pattern": "**/*.md"}'

# Remove a collection
curl -X DELETE "http://localhost:8100/collections/notes"
```

## Score Interpretation

| Score     | Meaning             | Action                  |
| --------- | ------------------- | ----------------------- |
| 0.8 - 1.0 | Highly relevant     | Show to user            |
| 0.5 - 0.8 | Moderately relevant | Include if few results  |
| 0.2 - 0.5 | Somewhat relevant   | Only if user wants more |
| 0.0 - 0.2 | Low relevance       | Usually skip            |

## Recommended Workflow

1. **Check what's available**: `curl http://localhost:8100/status`
2. **Start with keyword search**: `curl "http://localhost:8100/fts?q=topic&n=10"`
3. **Try semantic if needed**: `curl "http://localhost:8100/vsearch?q=describe+the+concept"`
4. **Use hybrid for best results**: `curl "http://localhost:8100/search?q=question&n=10"`
5. **Retrieve full documents**: `curl "http://localhost:8100/doc/collection/path.md"`

## CLI Wrapper

A thin CLI wrapper (`qmd`) is also available for backward compatibility:

```bash
qmd search "your query"       # → GET /search
qmd vsearch "your query"      # → GET /vsearch
qmd fts "your query"          # → GET /fts
qmd get "path/to/doc.md"      # → GET /doc/{path}
qmd status                    # → GET /status
qmd index                     # → POST /index
qmd embed                     # → POST /embed
qmd collections               # → GET /collections
```
