#!/usr/bin/env bash
# ==============================================================================
# YuE2 Song Studio - Safe Teardown Script
# Stops running services and cleans ephemeral PID and log files.
# Never deletes database or generated song outputs without explicit confirmation.
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Stopping YuE2 Song Studio services..."
"${ROOT_DIR}/stop.sh" || true

echo ""
echo "Cleaning runtime PID files..."
rm -f "${ROOT_DIR}/logs/"*.pid 2>/dev/null || true

read -r -p "Do you want to clean logs in ./logs/ as well? [y/N]: " clean_logs
clean_logs="${clean_logs:-n}"
if [[ "$clean_logs" =~ ^[Yy]$ ]]; then
  rm -f "${ROOT_DIR}/logs/"*.log
  echo "Cleaned logs."
fi

read -r -p "Do you want to delete your Python virtualenv (.venv)? [y/N]: " clean_venv
clean_venv="${clean_venv:-n}"
if [[ "$clean_venv" =~ ^[Yy]$ ]]; then
  rm -rf "${ROOT_DIR}/.venv"
  echo "Removed .venv."
fi

echo "Teardown complete."
