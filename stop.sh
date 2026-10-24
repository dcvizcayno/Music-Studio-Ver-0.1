#!/usr/bin/env bash
# Stop the local YuE2 Song Studio.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT_DIR/logs/backend.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No backend PID file."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping backend (PID $PID)..."
  kill "$PID" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.25
  done
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "Stopped."
else
  echo "Backend is not running."
fi
rm -f "$PID_FILE"
