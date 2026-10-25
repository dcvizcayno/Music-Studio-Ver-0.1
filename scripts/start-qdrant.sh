#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if curl -s -m 2 http://127.0.0.1:6333/healthz >/dev/null 2>&1; then
  echo "Qdrant already healthy."
  exit 0
fi
BIN="$ROOT/mnemosyne/qdrant/bin/qdrant"
[[ -x "$BIN" ]] || { echo "Run scripts/install-qdrant.sh first." >&2; exit 1; }
mkdir -p "$ROOT/mnemosyne/qdrant/storage" "$ROOT/mnemosyne/qdrant/snapshots" "$ROOT/mnemosyne/logs"
QDRANT__STORAGE__STORAGE_PATH="$ROOT/mnemosyne/qdrant/storage" \
QDRANT__STORAGE__SNAPSHOTS_PATH="$ROOT/mnemosyne/qdrant/snapshots" \
QDRANT__SERVICE__HTTP_PORT=6333 QDRANT__SERVICE__GRPC_PORT=6334 \
QDRANT__TELEMETRY_DISABLED=true QDRANT__LOG_LEVEL=WARN \
nohup "$BIN" > "$ROOT/mnemosyne/logs/qdrant.log" 2>&1 &
echo $! > "$ROOT/mnemosyne/logs/qdrant.pid"
for _ in $(seq 1 80); do
  if curl -s -m 1 http://127.0.0.1:6333/healthz >/dev/null 2>&1; then
    echo "Qdrant healthy at http://127.0.0.1:6333"
    exit 0
  fi
  sleep 0.25
done
echo "Qdrant did not become healthy; see mnemosyne/logs/qdrant.log" >&2
exit 1
