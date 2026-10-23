#!/usr/bin/env bash
# ==============================================================================
# YuE2 Song Studio - Stop Services
# Gracefully terminates backend and frontend processes.
# ==============================================================================

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/logs"

BACKEND_PID_FILE="${LOG_DIR}/backend.pid"
FRONTEND_PID_FILE="${LOG_DIR}/frontend.pid"

stop_proc() {
  local name="$1"
  local pid_file="$2"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      echo "✓ $name stopped."
    else
      echo "$name is not running."
    fi
    rm -f "$pid_file"
  else
    echo "No PID file found for $name."
  fi
}

stop_proc "FastAPI Backend" "$BACKEND_PID_FILE"
stop_proc "React Frontend" "$FRONTEND_PID_FILE"
