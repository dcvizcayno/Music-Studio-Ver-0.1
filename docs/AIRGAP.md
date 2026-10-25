# Air-gapped operation

The studio can run without outbound network access **after the one-time model
and toolchain install**. This page records the runtime guarantees and how to
verify them.

## What is local at runtime

- UI: React/Vite assets served by FastAPI from `frontend/dist/`
- Notation: `frontend/public/vendor/abcjs-basic-min.js`
- Piano playback: `frontend/public/vendor/soundfonts/FluidR3_GM/`
- Fonts: system font stack; the UI no longer calls Google Fonts
- API: `127.0.0.1:8000`
- Lyrics: local Ollama at `127.0.0.1:11434`
- Generation: local `mlx-yue` subprocess and local YuE2 weights
- Covers: local SheetSage2/MERT weights + `--offline`
- Stems: local `demucs-onnx` + cached htdemucs_6s model
- MIDI: local Basic Pitch ONNX + librosa
- Export: local `ffmpeg`/`ffprobe`

## Fixes applied

1. Removed the three Google Fonts `<link>` tags from `frontend/index.html`.
   The UI was already using the system stack, so no visual font bundle is needed.
2. `MlxEngine.run` sets, when `MLX_OFFLINE=true`:
   - `HF_HUB_OFFLINE=1`
   - `TRANSFORMERS_OFFLINE=1`
   - `HF_DATASETS_OFFLINE=1`
   - `HF_HUB_DISABLE_TELEMETRY=1`
   - `DO_NOT_TRACK=1`
3. Cover transcription now receives `--offline` as well as generated songs.
4. `stems._run` sets the same HF offline/telemetry environment for demucs-onnx.

## One-time network requirements

These are needed before the first air-gapped run and are cached afterward:

- Python/Node/ffmpeg installers
- YuE2 MLX weights + VAE
- SheetSage2/MERT cover models
- htdemucs_6s ONNX model (first stem split)
- Basic Pitch `nmp.onnx` (first MIDI)
- Ollama and any Qwen model
- npm/pip dependencies

Once cached, `mlx_offline=true` prevents downloads. If a model is missing, the
offline engine fails instead of silently reaching the internet.

## Verify

Static audit:

```bash
./scripts/airgap_audit.sh
```

It checks for remote fonts/CDNs in the served HTML, required local assets, HF
offline env wiring, and the cover `--offline` flag.

Runtime browser audit (requires the studio and Playwright):

```bash
cd qa
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" node airgap.mjs
```

Expected:

```json
{ "studio": "http://127.0.0.1:8000", "external": [] }
```

A stronger OS-level check is Little Snitch, `nettop`, or `lsof -i` while
generating; browser extensions and macOS services are outside the app's scope.

## Scope caveat

This guarantees the **application components** do not make outbound requests.
It does not control macOS updates, browser extensions, Ollama model pulls you
initiate, or third-party software installed on the Mac.
