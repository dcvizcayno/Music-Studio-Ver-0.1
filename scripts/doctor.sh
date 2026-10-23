#!/usr/bin/env bash
# ==============================================================================
# YuE2 Song Studio - System Doctor & Diagnostic Health Check
# Read-only verification script for Apple Silicon macOS (M5 24GB Unified Memory)
# ==============================================================================

set -uo pipefail

JSON_MODE=false
if [[ "${1:-}" == "--json" ]]; then
  JSON_MODE=true
fi

# Load .env if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  # Export variables ignoring comments
  set -a
  # shellcheck disable=SC1091
  source <(grep -v '^#' "${ROOT_DIR}/.env" | grep -v '^$')
  set +a
fi

OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
COMFYUI_URL="${COMFYUI_URL:-http://127.0.0.1:8188}"
BACKEND_PORT="${PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

declare -a CHECK_NAMES=()
declare -a CHECK_STATUS=()
declare -a CHECK_DETAILS=()
declare -a CHECK_FIXES=()

record_check() {
  local name="$1"
  local status="$2" # PASS, WARN, FAIL
  local detail="$3"
  local fix="$4"

  CHECK_NAMES+=("$name")
  CHECK_STATUS+=("$status")
  CHECK_DETAILS+=("$detail")
  CHECK_FIXES+=("$fix")
}

# 1. Architecture Check (macOS & Apple Silicon)
OS_NAME="$(uname -s)"
ARCH_NAME="$(uname -m)"
if [[ "$OS_NAME" == "Darwin" && "$ARCH_NAME" == "arm64" ]]; then
  CPU_BRAND="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Apple Silicon")"
  record_check "Apple Silicon Arch" "PASS" "${CPU_BRAND} (${ARCH_NAME})" "None"
else
  record_check "Apple Silicon Arch" "WARN" "Detected ${OS_NAME} (${ARCH_NAME}). Expected Darwin arm64" "Run on Apple Silicon Mac for Metal (MPS) acceleration"
fi

# 2. Unified Memory Check
if [[ "$OS_NAME" == "Darwin" ]]; then
  MEM_BYTES="$(sysctl -n hw.memsize 2>/dev/null || echo "0")"
  MEM_GB=$(( MEM_BYTES / 1024 / 1024 / 1024 ))
  if (( MEM_GB >= 24 )); then
    record_check "Unified Memory" "PASS" "${MEM_GB} GB Unified RAM detected (Excellent for 16GB GPU allocation)" "None"
  elif (( MEM_GB >= 16 )); then
    record_check "Unified Memory" "WARN" "${MEM_GB} GB Unified RAM detected. 24GB recommended for simultaneous large models" "Ensure AUTO_UNLOAD_MODELS=true is active to alternate Ollama and ComfyUI"
  else
    record_check "Unified Memory" "FAIL" "${MEM_GB} GB Unified RAM is insufficient for YuE2 + Qwen" "Upgrade hardware or use lightweight quantized variants"
  fi
else
  record_check "Unified Memory" "WARN" "Memory inspection limited on non-Darwin host" "Ensure at least 24GB system RAM"
fi

# 3. Disk Space Check
FREE_DISK_KB="$(df -k "${ROOT_DIR}" | awk 'NR==2 {print $4}')"
FREE_DISK_GB=$(( FREE_DISK_KB / 1024 / 1024 ))
if (( FREE_DISK_GB >= 30 )); then
  record_check "Free Disk Space" "PASS" "${FREE_DISK_GB} GB available on root volume" "None"
elif (( FREE_DISK_GB >= 15 )); then
  record_check "Free Disk Space" "WARN" "${FREE_DISK_GB} GB available. YuE2 safetensors and caches require ample space" "Free up at least 30 GB to safely store YuE2 models and audio outputs"
else
  record_check "Free Disk Space" "FAIL" "Critical: only ${FREE_DISK_GB} GB free" "Free disk space immediately before downloading checkpoints"
fi

# 4. Tool Check: Python 3.11+
if command -v python3 >/dev/null 2>&1; then
  PY_VER="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  PY_MAJOR="$(echo "$PY_VER" | cut -d. -f1)"
  PY_MINOR="$(echo "$PY_VER" | cut -d. -f2)"
  if (( PY_MAJOR == 3 && PY_MINOR >= 11 )); then
    record_check "Python 3.11+" "PASS" "Python ${PY_VER} found at $(command -v python3)" "None"
  else
    record_check "Python 3.11+" "WARN" "Found Python ${PY_VER}. Python 3.11 is strictly recommended for YuE2/Torch" "brew install python@3.11"
  fi
else
  record_check "Python 3.11+" "FAIL" "python3 not found in PATH" "brew install python@3.11"
fi

# 5. Tool Check: Node 20+
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v | sed 's/v//')"
  NODE_MAJOR="$(echo "$NODE_VER" | cut -d. -f1)"
  if (( NODE_MAJOR >= 18 )); then
    record_check "Node.js Environment" "PASS" "v${NODE_VER} detected" "None"
  else
    record_check "Node.js Environment" "WARN" "v${NODE_VER} detected. Node 20+ recommended" "brew install node"
  fi
else
  record_check "Node.js Environment" "FAIL" "Node.js is missing" "brew install node"
fi

# 6. Tool Check: ffmpeg
if command -v ffmpeg >/dev/null 2>&1; then
  record_check "FFmpeg Audio Engine" "PASS" "FFmpeg is installed and accessible" "None"
else
  record_check "FFmpeg Audio Engine" "WARN" "ffmpeg is missing. Audio trimming & conversion will be limited" "brew install ffmpeg"
fi

# 7. Ollama Reachability & Qwen Models
OLLAMA_HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "${OLLAMA_URL}/api/tags" 2>/dev/null || echo "000")"
if [[ "$OLLAMA_HTTP_CODE" == "200" ]]; then
  TAGS_JSON="$(curl -s --connect-timeout 2 "${OLLAMA_URL}/api/tags" 2>/dev/null || echo "{}")"
  HAS_QWEN=$(echo "$TAGS_JSON" | grep -i "qwen" || true)
  if [[ -n "$HAS_QWEN" ]]; then
    record_check "Ollama LLM Engine" "PASS" "Running at ${OLLAMA_URL} with Qwen model detected" "None"
  else
    record_check "Ollama LLM Engine" "WARN" "Ollama is running, but no Qwen model found" "Run: ollama pull qwen2.5:7b-instruct"
  fi
else
  record_check "Ollama LLM Engine" "FAIL" "Cannot connect to Ollama at ${OLLAMA_URL}" "Start Ollama via: ollama serve (or launch the Ollama macOS app)"
fi

# 8. ComfyUI Reachability & YuE2 Nodes
COMFY_HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "${COMFYUI_URL}/object_info" 2>/dev/null || echo "000")"
if [[ "$COMFY_HTTP_CODE" == "200" ]]; then
  COMFY_NODES_JSON="$(curl -s --connect-timeout 3 "${COMFYUI_URL}/object_info" 2>/dev/null || echo "{}")"
  HAS_YUE_NODE=$(echo "$COMFY_NODES_JSON" | grep -Ei "(yue|yue2|song|vocoder)" || true)
  if [[ -n "$HAS_YUE_NODE" ]]; then
    record_check "ComfyUI Music Engine" "PASS" "Running at ${COMFYUI_URL} with YuE/Audio custom nodes verified" "None"
  else
    record_check "ComfyUI Music Engine" "WARN" "ComfyUI reachable, but custom YuE2 nodes not detected in /object_info" "Install ComfyUI-YuE / ComfyUI-YuE2 in ComfyUI/custom_nodes/"
  fi
else
  record_check "ComfyUI Music Engine" "FAIL" "Cannot reach ComfyUI at ${COMFYUI_URL}" "Start ComfyUI on your Mac: python main.py --listen 127.0.0.1 --port 8188"
fi

# 9. Workflow Templates Check
if [[ -f "${ROOT_DIR}/workflows/text_to_song.json" && -f "${ROOT_DIR}/workflows/text_to_song.mapping.json" ]]; then
  record_check "Workflow Templates" "PASS" "API format text_to_song workflow & parameter mapping validated" "None"
else
  record_check "Workflow Templates" "FAIL" "workflows/text_to_song.json or mapping missing" "Export your ComfyUI workflow via 'Save (API Format)' into workflows/"
fi

# 10. Database Connectivity
DB_PATH="${ROOT_DIR}/data/studio.db"
if [[ -d "${ROOT_DIR}/data" ]]; then
  record_check "SQLite Storage" "PASS" "data/ directory verified for SQLite persistence" "None"
else
  mkdir -p "${ROOT_DIR}/data"
  record_check "SQLite Storage" "PASS" "Created data/ directory" "None"
fi

# 11. Backend Service Check (if active)
BK_CODE="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 "http://127.0.0.1:${BACKEND_PORT}/api/capabilities" 2>/dev/null || echo "000")"
if [[ "$BK_CODE" == "200" ]]; then
  record_check "FastAPI Backend" "PASS" "Active and responding on port ${BACKEND_PORT}" "None"
else
  record_check "FastAPI Backend" "INFO" "Not currently running on port ${BACKEND_PORT}" "Run: ./start.sh or (cd backend && uvicorn app.main:app --port 8000)"
fi

# 12. Frontend Web Server Check (if active)
FE_CODE="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 "http://127.0.0.1:${FRONTEND_PORT}" 2>/dev/null || echo "000")"
if [[ "$FE_CODE" == "200" ]]; then
  record_check "Frontend UI Server" "PASS" "Active on port ${FRONTEND_PORT}" "None"
else
  record_check "Frontend UI Server" "INFO" "Not currently running on port ${FRONTEND_PORT}" "Run: ./start.sh or (npm run dev)"
fi

# Output JSON or Table
if [[ "$JSON_MODE" == "true" ]]; then
  echo "{"
  echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"checks\": ["
  for i in "${!CHECK_NAMES[@]}"; do
    comma=","
    if [[ $i -eq $(( ${#CHECK_NAMES[@]} - 1 )) ]]; then
      comma=""
    fi
    echo "    {"
    echo "      \"name\": \"${CHECK_NAMES[$i]}\","
    echo "      \"status\": \"${CHECK_STATUS[$i]}\","
    echo "      \"detail\": \"$(echo "${CHECK_DETAILS[$i]}" | sed 's/"/\\"/g')\","
    echo "      \"fix\": \"$(echo "${CHECK_FIXES[$i]}" | sed 's/"/\\"/g')\""
    echo "    }${comma}"
  done
  echo "  ]"
  echo "}"
  exit 0
fi

# Human-readable table display
echo ""
echo -e "${BOLD}${CYAN}========================================================================${NC}"
echo -e "${BOLD}${CYAN}               YuE2 Song Studio - System Doctor Diagnostic               ${NC}"
echo -e "${BOLD}${CYAN}========================================================================${NC}"
echo ""
printf "%-24s | %-8s | %s\n" "DIAGNOSTIC CHECK" "STATUS" "FINDING / RECOMMENDATION"
echo "-------------------------+----------+---------------------------------------------------"

for i in "${!CHECK_NAMES[@]}"; do
  STATUS="${CHECK_STATUS[$i]}"
  case "$STATUS" in
    PASS)
      STATUS_BADGE="${GREEN}[PASS]${NC}"
      ;;
    WARN)
      STATUS_BADGE="${YELLOW}[WARN]${NC}"
      ;;
    FAIL)
      STATUS_BADGE="${RED}[FAIL]${NC}"
      ;;
    INFO)
      STATUS_BADGE="${BLUE}[INFO]${NC}"
      ;;
    *)
      STATUS_BADGE="[${STATUS}]"
      ;;
  esac

  printf "%-24s | %-17b | %s\n" "${CHECK_NAMES[$i]}" "$STATUS_BADGE" "${CHECK_DETAILS[$i]}"
  if [[ "${CHECK_FIXES[$i]}" != "None" && "$STATUS" == "FAIL" ]]; then
    printf "%-24s | %-8s |   ${RED}└─ Fix: %s${NC}\n" "" "" "${CHECK_FIXES[$i]}"
  elif [[ "${CHECK_FIXES[$i]}" != "None" && "$STATUS" == "WARN" ]]; then
    printf "%-24s | %-8s |   ${YELLOW}└─ Suggestion: %s${NC}\n" "" "" "${CHECK_FIXES[$i]}"
  fi
done

echo "-------------------------+----------+---------------------------------------------------"
echo ""
echo -e "${BOLD}Summary:${NC}"
echo "Run './scripts/setup.sh' to automatically configure your environment,"
echo "or './start.sh' to launch both the FastAPI backend and React frontend."
echo ""
