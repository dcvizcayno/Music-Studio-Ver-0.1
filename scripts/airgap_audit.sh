#!/usr/bin/env bash
# Static air-gap audit for the browser UI and optional Hugging Face subprocesses.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0

note_fail() { echo "FAIL: $*" >&2; fail=1; }

# 1. The served HTML must not reference remote fonts or CDNs.
if grep -nE 'https?://' frontend/index.html frontend/dist/index.html >/dev/null 2>&1; then
  note_fail "frontend HTML contains a remote URL"
  grep -nE 'https?://' frontend/index.html frontend/dist/index.html >&2 || true
fi

if grep -RInE 'fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare|huggingface\.co|api\.openai\.com' \
    frontend/dist frontend/index.html >/dev/null 2>&1; then
  note_fail "built UI references a known remote host"
fi

# 2. Runtime assets must be local.
for asset in \
  frontend/public/vendor/abcjs-basic-min.js \
  frontend/public/vendor/abcjs-audio.css \
  frontend/public/vendor/soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/C4.mp3 \
  frontend/dist/vendor/abcjs-basic-min.js; do
  [[ -f "$asset" ]] || note_fail "missing local asset: $asset"
done

# 3. Both HF subprocess paths must force offline mode.
grep -q 'HF_HUB_OFFLINE' backend/app/services/engine.py || note_fail "engine missing HF_HUB_OFFLINE"
grep -q 'HF_HUB_OFFLINE' backend/app/services/stems.py || note_fail "stems missing HF_HUB_OFFLINE"
grep -q 'TRANSFORMERS_OFFLINE' backend/app/services/engine.py || note_fail "engine missing TRANSFORMERS_OFFLINE"

# 4. Cover transcription must receive --offline.
grep -q 'base.append("--offline")' backend/app/services/engine.py || note_fail "cover --offline not wired"

if [[ $fail -ne 0 ]]; then
  echo "Air-gap static audit: FAILED" >&2
  exit 1
fi

echo "Air-gap static audit: PASS"
echo "Browser: no remote fonts/CDNs in served HTML or built assets."
echo "Backend: HF_HUB_OFFLINE, TRANSFORMERS_OFFLINE, and cover --offline are wired."
