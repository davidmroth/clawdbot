#!/bin/bash
LOG_DIR="/tmp/clawdbot"

if [ ! -d "$LOG_DIR" ]; then
    echo "Log directory $LOG_DIR not found."
    exit 1
fi

# Find latest log file
LATEST_LOG=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -n 1)

if [ -z "$LATEST_LOG" ]; then
    echo "No log files found in $LOG_DIR."
    exit 1
fi

echo "Latest log: $LATEST_LOG"
echo "----------------------------------------"

if [ "$1" == "tail" ]; then
    tail -n 50 "$LATEST_LOG"
elif [ "$1" == "path" ]; then
    echo "$LATEST_LOG"
else
    ls -lh "$LOG_DIR"/*.log
    echo ""
    echo "Usage: $0 [tail|path]"
fi
