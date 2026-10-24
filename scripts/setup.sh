#!/usr/bin/env bash
# Verify (and, where safe, finish) a local install. Never uses sudo.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

fail=0
check() {
  local name="$1" path="$2"
  if [[ -e "$path" ]]; then
    echo "  OK   $name"
  else
    echo "  MISS $name ($path)"
    fail=1
  fi
}

echo "YuE2 Song Studio — setup check"
echo "Root: $ROOT_DIR"

echo "Backend"
check "Python venv" ".venv/bin/python"
check "FastAPI" ".venv/lib/python3.12/site-packages/fastapi"
[[ -x ".venv/bin/uvicorn" ]] && echo "  OK   uvicorn" || { echo "  MISS uvicorn"; fail=1; }

echo "Frontend"
check "node_modules" "frontend/node_modules"
check "production build" "frontend/dist/index.html"

echo "Tools"
check "ffmpeg" "../tools/ffmpeg/bin/ffmpeg"
check "ffprobe" "../tools/ffmpeg/bin/ffprobe"
check "Node 22" "../tools/node/bin/node"

echo "Engine"
check "mlx-yue" "../engines/mlx-Yue/.venv/bin/mlx-yue"
check "AR 8-bit weights" "../models/mlx-Yue2-3B/ar-8bit.safetensors"
check "NAR weights" "../models/mlx-Yue2-3B/nar-bf16.safetensors"
check "bf16 AR weights" "../models/mlx-Yue2-3B/ar-bf16.safetensors"
check "VAE weights" "../models/YuE2-Vae/model.safetensors"

echo "Services"
if curl -s -m 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
  echo "  OK   backend at 127.0.0.1:8000"
else
  echo "  INFO backend not running (start with ./start.sh)"
fi
if curl -s -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "  OK   Ollama at 127.0.0.1:11434"
else
  echo "  WARN Ollama offline (lyrics disabled)"
fi

if [[ ! -f "frontend/dist/index.html" && "$DRY_RUN" == "false" ]]; then
  echo "Building frontend..."
  export PATH="$ROOT_DIR/../tools/node/bin:$PATH"
  (cd frontend && npm run build)
fi

if [[ $fail -ne 0 ]]; then
  echo ""
  echo "Install is incomplete. Follow the 'Install from scratch' section in README.md."
  exit 1
fi
echo ""
echo "Install looks complete."
