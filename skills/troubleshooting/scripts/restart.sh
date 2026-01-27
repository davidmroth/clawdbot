#!/bin/bash
set -e

# Target URL (default to internal service name)
RESTART_URL="${RESTART_SERVICE_URL:-http://clawdbot-build:3000/restart}"

echo "Triggering restart at $RESTART_URL..."
curl -X POST "$RESTART_URL"
echo "Restart request sent."
