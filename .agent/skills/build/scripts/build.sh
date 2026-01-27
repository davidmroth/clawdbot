#!/bin/bash
set -e

# Target URL (default to localhost, but allow override)
BUILD_URL="${BUILD_SERVICE_URL:-http://clawdbot-build:3000/build}"

echo "Triggering build at $BUILD_URL..."
curl -N -X POST "$BUILD_URL"
echo "Request complete."