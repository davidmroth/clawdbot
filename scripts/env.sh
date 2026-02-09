#!/bin/bash

# Run: `export $(env.sh)`

GATEWAY_ROOT="/app"

REPO_ROOT="$(dirname "$(dirname "$GATEWAY_ROOT")")"

# Run the export utility via tsx from inside the gateway directory
# to ensure dependencies (zod, json5, etc) are resolved correctly.
(cd "$GATEWAY_ROOT" && node --import tsx scripts/export-env.ts)
