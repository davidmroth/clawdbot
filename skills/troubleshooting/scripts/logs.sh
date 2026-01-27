#!/bin/bash
set -e

LOG_DIR="${CLAWDBOT_STATE_DIR:-/tmp/clawdbot}"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/clawdbot-$DATE.log"

case "$1" in
  path)
    echo "$LOG_FILE"
    ;;
  tail)
    if [ -f "$LOG_FILE" ]; then
      echo "Latest log: $LOG_FILE"
      echo "----------------------------------------"
      tail -n 20 "$LOG_FILE"
    else
      echo "No log file found at $LOG_FILE"
    fi
    ;;
  *)
    ls -lt "$LOG_DIR"/*.log 2>/dev/null | head -n 5
    ;;
esac
