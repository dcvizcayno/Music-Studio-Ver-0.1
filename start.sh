#!/usr/bin/env bash
# ==============================================================================
# YuE2 Song Studio - Start Services
# Starts FastAPI backend (port 8000) and React frontend (port 3000)
# ==============================================================================

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/logs"
mkdir -p "$LOG_DIR"

BACKEND_PID_FILE="${LOG_DIR}/backend.pid"
FRONTEND_PID_FILE="${LOG_DIR}/frontend.pid"
BACKEND_LOG="${LOG_DIR}/backend.log"
FRONTEND_LOG="${LOG_DIR}/frontend.log"

# Check if already running
if [[ -f "$BACKEND_PID_FILE" ]] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
  echo "Backend is already running with PID $(cat "$BACKEND_PID_FILE")."
else
  echo "Starting FastAPI backend on http://127.0.0.1:8000..."
  # Use .venv python if available
  PY_EXEC="python3"
  if [[ -f "${ROOT_DIR}/.venv/bin/python3" ]]; then
    PY_EXEC="${ROOT_DIR}/.venv/bin/python3"
  fi

  (
    cd "${ROOT_DIR}/backend"
    export PYTHONPATH="${ROOT_DIR}/backend"
    $PY_EXEC -m uvicorn app.main:app --host 127.0.0.1 --port 8000 > "$BACKEND_LOG" 2>&1
  ) &
  BACKEND_PID=$!
  echo "$BACKEND_PID" > "$BACKEND_PID_FILE"
  echo "Backend started (PID: $BACKEND_PID)"
fi

if [[ -f "$FRONTEND_PID_FILE" ]] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
  echo "Frontend is already running with PID $(cat "$FRONTEND_PID_FILE")."
else
  echo "Starting React frontend on http://localhost:3000..."
  (
    cd "$ROOT_DIR"
    npm run dev > "$FRONTEND_LOG" 2>&1
  ) &
  FRONTEND_PID=$!
  echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"
  echo "Frontend started (PID: $FRONTEND_PID)"
fi

echo ""
echo "========================================================================"
echo "           YuE2 Song Studio is now running!                             "
echo "========================================================================"
echo "  Studio UI:       http://localhost:3000"
echo "  Backend API:     http://127.0.0.1:8000/docs"
echo "  System Doctor:   ./scripts/doctor.sh"
echo "  Stop Studio:     ./stop.sh"
echo "========================================================================"
