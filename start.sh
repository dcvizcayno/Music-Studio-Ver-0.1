#!/usr/bin/env bash
# Start the local Song Studio (FastAPI + built React UI).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
mkdir -p logs data outputs uploads

PORT="${PORT:-8000}"
PID_FILE="$ROOT_DIR/logs/backend.pid"
LOG_FILE="$ROOT_DIR/logs/backend.log"
LABEL="com.danielvizcayno.musicstudio"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Backend already running (PID $(cat "$PID_FILE"))."
  echo "Studio: http://127.0.0.1:${PORT}"
  exit 0
fi

if [[ ! -x ".venv/bin/uvicorn" ]]; then
  echo "Missing .venv. Run the install steps in README.md first." >&2
  exit 1
fi

if [[ ! -f "frontend/dist/index.html" ]]; then
  echo "Frontend build missing; building..."
  export PATH="$ROOT_DIR/../tools/node/bin:$PATH"
  (cd frontend && npm run build)
fi

if curl -s -m 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "Port ${PORT} is already serving the studio."
  exit 0
fi

# If the login agent is installed, let launchd own the process.
if [[ -f "$PLIST" ]]; then
  echo "Starting studio through launchd ($LABEL)..."
  if ! launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  fi
  launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  for _ in $(seq 1 40); do
    if curl -s -m 2 "http://127.0.0.1:${PORT}/api/health" | grep -q '"status":"ok"'; then
      echo "Studio ready: http://127.0.0.1:${PORT}"
      echo "Auto-start label: $LABEL"
      exit 0
    fi
    sleep 0.5
  done
  echo "launchd could not start the studio in this shell; falling back to a manual launch." >&2
  echo "The plist remains installed and should load at the next login." >&2
fi

echo "Starting backend on http://127.0.0.1:${PORT} ..."
pushd backend >/dev/null
PYTHONPATH="$ROOT_DIR/backend" \
  nohup "$ROOT_DIR/.venv/bin/uvicorn" app.main:app \
    --host 127.0.0.1 --port "$PORT" >> "$LOG_FILE" 2>&1 &
BACKEND_PID=$!
popd >/dev/null
echo "$BACKEND_PID" > "$PID_FILE"
disown "$BACKEND_PID" 2>/dev/null || true

for _ in $(seq 1 40); do
  if curl -s -m 2 "http://127.0.0.1:${PORT}/api/health" | grep -q '"status":"ok"'; then
    echo "Studio ready: http://127.0.0.1:${PORT}"
    echo "Logs: $LOG_FILE"
    exit 0
  fi
  sleep 0.5
done

echo "Backend did not become healthy. Last log lines:" >&2
tail -30 "$LOG_FILE" >&2 || true
exit 1
