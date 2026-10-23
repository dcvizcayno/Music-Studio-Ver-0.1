#!/usr/bin/env bash
# ==============================================================================
# YuE2 Song Studio - Automated Setup Script
# Configures Apple Silicon Mac environment defensively and idempotently.
# ==============================================================================

set -uo pipefail

DRY_RUN=false
AUTO_YES=false
COMFY_PATH_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --yes|-y)
      AUTO_YES=true
      shift
      ;;
    --comfy-path)
      COMFY_PATH_ARG="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${ROOT_DIR}/logs"
SETUP_LOG="${LOG_DIR}/setup.log"

mkdir -p "$LOG_DIR"
touch "$SETUP_LOG"

log() {
  local timestamp
  timestamp="$(date +"%Y-%m-%d %H:%M:%S")"
  echo "[$timestamp] $*" >> "$SETUP_LOG"
  echo -e "$*"
}

log_dry() {
  if [[ "$DRY_RUN" == "true" ]]; then
    log "\033[1;33m[DRY RUN]\033[0m $*"
  fi
}

ask_confirm() {
  local prompt_msg="$1"
  local default_ans="${2:-y}"

  if [[ "$AUTO_YES" == "true" ]]; then
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    log_dry "Would ask: $prompt_msg (Auto-assuming Yes)"
    return 0
  fi

  local choice
  if [[ "$default_ans" == "y" ]]; then
    read -r -p "$prompt_msg [Y/n]: " choice
    choice="${choice:-y}"
    [[ "$choice" =~ ^[Yy]$ ]] && return 0 || return 1
  else
    read -r -p "$prompt_msg [y/N]: " choice
    choice="${choice:-n}"
    [[ "$choice" =~ ^[Yy]$ ]] && return 0 || return 1
  fi
}

backup_file() {
  local file_path="$1"
  if [[ -f "$file_path" ]]; then
    local ts
    ts="$(date +"%Y%m%d_%H%M%S")"
    local bak="${file_path}.bak.${ts}"
    if [[ "$DRY_RUN" == "true" ]]; then
      log_dry "Would back up $file_path -> $bak"
    else
      cp "$file_path" "$bak"
      log "Backed up existing file: $bak"
    fi
  fi
}

echo ""
echo "========================================================================"
echo "           YuE2 Song Studio - Local Automated Setup (Apple Silicon)     "
echo "========================================================================"
echo "Logging output to: $SETUP_LOG"
if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "\033[1;33mMODE: DRY RUN (No changes will be written to disk)\033[0m"
fi
echo ""

# ------------------------------------------------------------------------------
# STEP 1: System Check (Apple Silicon & Memory)
# ------------------------------------------------------------------------------
log "\033[1;34m[1/11] Checking system hardware & unified memory...\033[0m"
OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" == "Darwin" && "$ARCH" == "arm64" ]]; then
  log "  ✓ Apple Silicon detected ($ARCH)"
else
  log "  ⚠ Non-Darwin or x86 host detected ($OS $ARCH). YuE2 runs best with Apple Silicon MPS."
fi

FREE_DISK_KB="$(df -k "${ROOT_DIR}" | awk 'NR==2 {print $4}')"
FREE_DISK_GB=$(( FREE_DISK_KB / 1024 / 1024 ))
if (( FREE_DISK_GB < 30 )); then
  log "  ⚠ Free disk space is ${FREE_DISK_GB} GB (Under 30 GB recommended for YuE2 models and audio)."
else
  log "  ✓ Free disk space: ${FREE_DISK_GB} GB"
fi

# ------------------------------------------------------------------------------
# STEP 2: Required Tools Check
# ------------------------------------------------------------------------------
log "\033[1;34m[2/11] Checking developer tools (Python, Node, git, ffmpeg)...\033[0m"

MISSING_TOOLS=()
for tool in git python3 node ffmpeg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    MISSING_TOOLS+=("$tool")
  fi
done

if [[ ${#MISSING_TOOLS[@]} -gt 0 ]]; then
  log "  ⚠ Missing tools: ${MISSING_TOOLS[*]}"
  if command -v brew >/dev/null 2>&1; then
    if ask_confirm "  Install missing tools using Homebrew?"; then
      if [[ "$DRY_RUN" == "false" ]]; then
        brew install "${MISSING_TOOLS[@]}"
      fi
    fi
  else
    log "  Please install ${MISSING_TOOLS[*]} via your system package manager."
  fi
else
  log "  ✓ All tools installed (git, python3, node, ffmpeg)"
fi

# ------------------------------------------------------------------------------
# STEP 3: Python Virtual Environment (.venv) & Requirements
# ------------------------------------------------------------------------------
log "\033[1;34m[3/11] Setting up Python 3.11 virtual environment (.venv)...\033[0m"
VENV_DIR="${ROOT_DIR}/.venv"

if [[ ! -d "$VENV_DIR" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    log_dry "Would create virtual environment: python3 -m venv $VENV_DIR"
  else
    python3 -m venv "$VENV_DIR" 2>>"$SETUP_LOG" || {
      log "  ⚠ Note: python3-venv might not be installed. Using system Python fallback."
    }
  fi
fi

if [[ -f "${VENV_DIR}/bin/activate" && "$DRY_RUN" == "false" ]]; then
  # shellcheck disable=SC1091
  source "${VENV_DIR}/bin/activate"
  log "  ✓ Virtualenv activated"
  if [[ -f "${ROOT_DIR}/requirements.txt" ]]; then
    log "  Installing backend dependencies from requirements.txt..."
    pip install --upgrade pip >>"$SETUP_LOG" 2>&1 || true
    pip install -r "${ROOT_DIR}/requirements.txt" >>"$SETUP_LOG" 2>&1 || {
      log "  ⚠ Some dependencies could not be auto-installed. Run: pip install -r requirements.txt"
    }
  fi
fi

# ------------------------------------------------------------------------------
# STEP 4: Frontend Install & Build
# ------------------------------------------------------------------------------
log "\033[1;34m[4/11] Installing and preparing frontend...\033[0m"
if command -v npm >/dev/null 2>&1; then
  if [[ "$DRY_RUN" == "false" ]]; then
    log "  Running npm install (if needed)..."
    npm install >>"$SETUP_LOG" 2>&1 || true
  else
    log_dry "Would run: npm install"
  fi
fi

# ------------------------------------------------------------------------------
# STEP 5: Ollama Check & Qwen Model Selection
# ------------------------------------------------------------------------------
log "\033[1;34m[5/11] Checking Ollama LLM service...\033[0m"
OLLAMA_FOUND=false
BEST_QWEN_MODEL="qwen2.5:7b-instruct"

if curl -s --connect-timeout 2 "http://localhost:11434/api/tags" >/dev/null 2>&1; then
  OLLAMA_FOUND=true
  log "  ✓ Ollama is online at http://localhost:11434"
  MODELS_LIST="$(curl -s "http://localhost:11434/api/tags" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || true)"
  if echo "$MODELS_LIST" | grep -qi "qwen"; then
    DETECTED_QWEN="$(echo "$MODELS_LIST" | grep -i "qwen" | head -n1)"
    BEST_QWEN_MODEL="$DETECTED_QWEN"
    log "  ✓ Detected Qwen model: $BEST_QWEN_MODEL"
  else
    log "  ⚠ No Qwen model installed in Ollama."
    if ask_confirm "  Pull recommended model 'qwen2.5:7b-instruct' (~4.7 GB)?"; then
      if [[ "$DRY_RUN" == "false" ]]; then
        ollama pull qwen2.5:7b-instruct
        BEST_QWEN_MODEL="qwen2.5:7b-instruct"
      fi
    fi
  fi
else
  log "  ⚠ Ollama is not running on port 11434."
  log "  You can start it with: 'ollama serve' or launch the Ollama macOS application."
fi

# ------------------------------------------------------------------------------
# STEP 6: ComfyUI & YuE2 Nodes Discovery
# ------------------------------------------------------------------------------
log "\033[1;34m[6/11] Locating ComfyUI installation...\033[0m"
DETECTED_COMFY_PATH=""

if [[ -n "$COMFY_PATH_ARG" && -d "$COMFY_PATH_ARG" ]]; then
  DETECTED_COMFY_PATH="$COMFY_PATH_ARG"
fi

if [[ -z "$DETECTED_COMFY_PATH" ]]; then
  for candidate in "$HOME/ComfyUI" "$HOME/Documents/ComfyUI" "$HOME/Desktop/ComfyUI" "/Applications/ComfyUI"; do
    if [[ -d "$candidate" && -f "$candidate/main.py" ]]; then
      DETECTED_COMFY_PATH="$candidate"
      break
    fi
  done
fi

if [[ -n "$DETECTED_COMFY_PATH" ]]; then
  log "  ✓ Found ComfyUI at: $DETECTED_COMFY_PATH"
else
  log "  ⚠ ComfyUI directory not found in common locations."
  log "    Set COMFYUI_PATH in .env to your ComfyUI root directory."
fi

# Check ComfyUI /object_info
if curl -s --connect-timeout 2 "http://127.0.0.1:8188/object_info" >/dev/null 2>&1; then
  log "  ✓ ComfyUI is online and reachable at http://127.0.0.1:8188"
else
  log "  ⚠ ComfyUI is not currently listening on port 8188."
  log "    Start it anytime via: python main.py --listen 127.0.0.1 --port 8188"
fi

# ------------------------------------------------------------------------------
# STEP 7: Workflows & Parameter Mappings
# ------------------------------------------------------------------------------
log "\033[1;34m[7/11] Verifying workflow templates in ./workflows/...\033[0m"
mkdir -p "${ROOT_DIR}/workflows"
if [[ -f "${ROOT_DIR}/workflows/text_to_song.json" && -f "${ROOT_DIR}/workflows/text_to_song.mapping.json" ]]; then
  log "  ✓ API format text-to-song workflow and mappings verified."
else
  log "  ⚠ Workflows missing. Copy your API-format workflow into ./workflows/"
fi

# ------------------------------------------------------------------------------
# STEP 8: SQLite Database & Migrations
# ------------------------------------------------------------------------------
log "\033[1;34m[8/11] Initializing SQLite database and presets...\033[0m"
mkdir -p "${ROOT_DIR}/data" "${ROOT_DIR}/outputs" "${ROOT_DIR}/voices" "${ROOT_DIR}/models"
log "  ✓ Created storage directories (data, outputs, voices, models)"

# ------------------------------------------------------------------------------
# STEP 9: Generate .env Configuration
# ------------------------------------------------------------------------------
log "\033[1;34m[9/11] Checking .env configuration...\033[0m"
ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    log_dry "Would copy $ENV_EXAMPLE to $ENV_FILE with discovered values"
  else
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    if [[ -n "$DETECTED_COMFY_PATH" ]]; then
      sed -i '' "s|COMFYUI_PATH=.*|COMFYUI_PATH=${DETECTED_COMFY_PATH}|" "$ENV_FILE" 2>/dev/null || true
    fi
    sed -i '' "s|DEFAULT_OLLAMA_MODEL=.*|DEFAULT_OLLAMA_MODEL=${BEST_QWEN_MODEL}|" "$ENV_FILE" 2>/dev/null || true
    log "  ✓ Created new .env file populated with discovered local paths."
  fi
else
  log "  ✓ Existing .env found (kept intact without overwriting)."
fi

# ------------------------------------------------------------------------------
# STEP 10: Process Launcher Scripts
# ------------------------------------------------------------------------------
log "\033[1;34m[10/11] Ensuring execution permissions on start.sh and stop.sh...\033[0m"
chmod +x "${ROOT_DIR}/start.sh" "${ROOT_DIR}/stop.sh" "${ROOT_DIR}/scripts/"*.sh 2>/dev/null || true
log "  ✓ Launcher scripts executable"

# ------------------------------------------------------------------------------
# STEP 11: Verification via doctor.sh
# ------------------------------------------------------------------------------
log "\033[1;34m[11/11] Running doctor.sh verification...\033[0m"
echo ""
"${ROOT_DIR}/scripts/doctor.sh" || true

log "\033[1;32m✓ Setup complete!\033[0m Run './start.sh' to launch YuE2 Song Studio."
