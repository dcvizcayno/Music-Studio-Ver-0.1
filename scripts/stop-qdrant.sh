#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/mnemosyne/logs/qdrant.pid"
if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  kill "$PID" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Qdrant stopped."
else
  echo "No Qdrant PID file (it may be managed by the backend)."
fi
