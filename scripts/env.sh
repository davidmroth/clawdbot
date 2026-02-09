#!/bin/bash

# Run: `export $(env.sh)`

GATEWAY_ROOT="/app"

REPO_ROOT="$(dirname "$(dirname "$GATEWAY_ROOT")")"

# If CLAWDBOT_CONFIG_PATH is not set, try to find it in the standard workspace location
CONFIG_FILE="~/clawdbot/clawdbot.json"

# Run the export utility via tsx from inside the gateway directory
# to ensure dependencies (zod, json5, etc) are resolved correctly.
(cd "$GATEWAY_ROOT" && node --import tsx scripts/export-env.ts)
