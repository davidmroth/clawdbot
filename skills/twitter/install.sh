#!/bin/bash

echo "Installing dependencies for twitter skill..."

if [ -n "$CLAWDBOT_PYTHON_VENV" ]; then
    PIP="$CLAWDBOT_PYTHON_VENV/bin/pip"
    echo "Using CLAWDBOT_PYTHON_VENV: $PIP"
elif [ -f "$HOME/.venv/bin/pip" ]; then
    PIP="$HOME/.venv/bin/pip"
    echo "Using HOME venv: $PIP"
elif [ -f "/Users/davidroth/.venv/bin/pip" ]; then
    PIP="/Users/davidroth/.venv/bin/pip"
    echo "Using explicit path venv: $PIP"
else
    PIP="pip3"
    echo "Fallback to system pip3"
fi

$PIP install tweepy
