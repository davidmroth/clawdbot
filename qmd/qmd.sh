#!/usr/bin/env bash
# qmd — thin CLI wrapper that forwards commands to the QMD microservice.
# Provides backward-compatible CLI interface for agent Bash tool invocation.

set -euo pipefail

QMD_URL="${QMD_URL:-http://localhost:8100}"
INSTANCE="${QMD_INSTANCE_ID:-}"
HEADER=""
if [[ -n "$INSTANCE" ]]; then
  HEADER="-H X-Instance-ID:${INSTANCE}"
fi

usage() {
  cat <<'EOF'
Usage: qmd <command> [args]

Commands:
  search  <query> [-n N] [-c collection]   Hybrid search (RRF)
  vsearch <query> [-n N] [-c collection]   Semantic vector search
  fts     <query> [-n N] [-c collection]   Keyword search (BM25)
  get     <path>  [--line-numbers]         Retrieve document
  status                                   Index status
  index   [collection]                     Index files
  embed   [--force]                        Generate embeddings
  collections                              List collections
  health                                   Health check
EOF
}

# Parse -n and -c flags from remaining args
parse_opts() {
  N=10
  COLLECTION=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -n) N="$2"; shift 2 ;;
      -c|--collection) COLLECTION="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
}

case "${1:-}" in
  search)
    shift
    QUERY="$1"; shift || true
    parse_opts "$@"
    URL="${QMD_URL}/search?q=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${QUERY}'))")&n=${N}"
    [[ -n "$COLLECTION" ]] && URL="${URL}&collection=${COLLECTION}"
    exec curl -s $HEADER "$URL" | python3 -m json.tool
    ;;

  vsearch)
    shift
    QUERY="$1"; shift || true
    parse_opts "$@"
    URL="${QMD_URL}/vsearch?q=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${QUERY}'))")&n=${N}"
    [[ -n "$COLLECTION" ]] && URL="${URL}&collection=${COLLECTION}"
    exec curl -s $HEADER "$URL" | python3 -m json.tool
    ;;

  fts)
    shift
    QUERY="$1"; shift || true
    parse_opts "$@"
    URL="${QMD_URL}/fts?q=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${QUERY}'))")&n=${N}"
    [[ -n "$COLLECTION" ]] && URL="${URL}&collection=${COLLECTION}"
    exec curl -s $HEADER "$URL" | python3 -m json.tool
    ;;

  get)
    shift
    DOC_PATH="$1"; shift || true
    LINE_NUMBERS=""
    [[ "${1:-}" == "--line-numbers" ]] && LINE_NUMBERS="?line_numbers=true"
    exec curl -s $HEADER "${QMD_URL}/doc/${DOC_PATH}${LINE_NUMBERS}" | python3 -m json.tool
    ;;

  status)
    exec curl -s $HEADER "${QMD_URL}/status" | python3 -m json.tool
    ;;

  index)
    shift
    COLLECTION="${1:-}"
    if [[ -n "$COLLECTION" ]]; then
      exec curl -s -X POST $HEADER -H "Content-Type: application/json" \
        -d "{\"collection\": \"${COLLECTION}\"}" "${QMD_URL}/index" | python3 -m json.tool
    else
      exec curl -s -X POST $HEADER -H "Content-Type: application/json" \
        -d '{}' "${QMD_URL}/index" | python3 -m json.tool
    fi
    ;;

  embed)
    shift
    FORCE="false"
    [[ "${1:-}" == "--force" ]] && FORCE="true"
    exec curl -s -X POST $HEADER -H "Content-Type: application/json" \
      -d "{\"force\": ${FORCE}}" "${QMD_URL}/embed" | python3 -m json.tool
    ;;

  collections)
    exec curl -s $HEADER "${QMD_URL}/collections" | python3 -m json.tool
    ;;

  health)
    exec curl -s "${QMD_URL}/health" | python3 -m json.tool
    ;;

  -h|--help|help|"")
    usage
    ;;

  *)
    echo "Unknown command: $1" >&2
    usage
    exit 1
    ;;
esac
