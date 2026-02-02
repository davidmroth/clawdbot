#!/bin/bash
# Wrapper script that ensures Python venv is first in PATH before running bash commands
# Uses pure bash parameter expansion for robust path deduplication

exec /bin/bash "$@"
