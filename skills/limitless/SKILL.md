---
name: limitless
description: Access Limitless Pendant data (Lifelogs) to search and retrieve memories, conversations, and audio transcripts.
---

# Limitless Skill

Integration with the Limitless Developer API to access Lifelogs.

## Configuration

Requires an API Key.
Set the environment variable `LIMITLESS_API_KEY`.

## Tools

### search
Search for lifelogs using semantic query, date, or keywords.

- `query` (string): Semantic search text (e.g., "places we discussed for dinner") or keywords.
- `date` (string, optional): Filter by specific date (YYYY-MM-DD).
- `limit` (number, default 3): Number of results to return.

```bash
node skills/limitless/index.js search "$query" "$date" "$limit"
```

### get
Retrieve full details for a specific lifelog entry.

- `id` (string): The ID of the lifelog entry.

```bash
node skills/limitless/index.js get "$id"
```
