#!/usr/bin/env bash
# Read-only health check. Prefers the live /api/status endpoint.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if curl -s -m 3 http://127.0.0.1:8000/api/status -o /tmp/yue2_status.json 2>/dev/null; then
  python3 -m json.tool /tmp/yue2_status.json
  exit 0
fi

echo "Backend is not running; local checks only."
echo "== Hardware =="
uname -sm
sysctl -n machdep.cpu.brand_string 2>/dev/null || true
echo "Memory: $(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 )) GB"
echo "Swap: $(sysctl -n vm.swapusage)"
echo ""
echo "== Files =="
for path in \
  "../engines/mlx-Yue/.venv/bin/mlx-yue" \
  "../models/mlx-Yue2-3B/ar-8bit.safetensors" \
  "../models/mlx-Yue2-3B/nar-bf16.safetensors" \
  "../models/YuE2-Vae/model.safetensors" \
  "../tools/ffmpeg/bin/ffmpeg" \
  "frontend/dist/index.html" \
  ".venv/bin/uvicorn"; do
  [[ -e "$path" ]] && echo "  OK   $path" || echo "  MISS $path"
done
echo ""
echo "== Services =="
curl -s -m 2 http://127.0.0.1:11434/api/tags >/dev/null && echo "  OK   Ollama" || echo "  WARN Ollama offline"
echo ""
echo "Start the studio with ./start.sh"
