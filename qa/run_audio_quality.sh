#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIO="${1:-$ROOT_DIR/qa/reports/cover.flac}"
python3 "$ROOT_DIR/qa/audio_quality.py" --audio "$AUDIO" \
  --out "$ROOT_DIR/qa/reports/audio_quality.json"
