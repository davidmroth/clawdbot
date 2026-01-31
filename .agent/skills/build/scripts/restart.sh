#!/bin/bash
set -e

# Target URL
RESTART_URL="${BUILD_SERVICE_URL:-http://builder:3000/restart}"

echo "Triggering restart at $RESTART_URL..."
curl -X POST "$RESTART_URL"
echo "Restart request sent."