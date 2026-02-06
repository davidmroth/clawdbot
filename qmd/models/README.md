# QMD Models

Place the embedding model file here before building the Docker image:

- `nomic-embed-text-v1.5.Q4_K_M.gguf` — Required for vector search

This directory is copied to `/app/qmd-models/` inside the container.

You can symlink from the root `qmd-models/` directory:

```bash
ln -s ../../qmd-models/nomic-embed-text-v1.5.Q4_K_M.gguf .
```
