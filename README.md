# Music Studio Ver 0.1 — YuE2 Song Studio

A local, Apple-Silicon-native song studio. Full install guide: [SETUP.md](SETUP.md). Lyrics are drafted with Qwen through Ollama;
songs and covers are synthesized with **YuE2-3B through [mlx-Yue](https://github.com/vanch007/mlx-Yue)**
on Metal. Nothing is sent to a cloud service.

![stack](https://img.shields.io/badge/engine-MLX-black) ![ui](https://img.shields.io/badge/UI-React%2019-blue)

## What actually runs

```
React 19 + Vite  →  FastAPI (127.0.0.1:8000)  →  mlx-Yue subprocess  →  Metal / MLX
                              │
                              ├─ Ollama (Qwen) for lyrics only, unloaded before generation
                              └─ ffmpeg for WAV / MP3 / FLAC export
```

- **Text-to-song:** style + lyrics → YuE2 plan → 48 kHz stereo audio.
  Includes a lyrics/BPM auto-duration estimate (bars × 4 × 60 ÷ BPM, up to 6 min),
  a **Plan score / No score** toggle, a mutually exclusive **Vocal Gender**
  selector (fed directly to YuE2 as “male vocal” / “female vocal”), and a
  readable/exportable ABC melody.
- **Cover:** reference audio → SheetSage2 melody transcription → YuE2 melody mode.
- **No voice cloning.** YuE2 conditions on text style and an optional ABC score. It does not
  accept a speaker embedding; covers preserve melody, not the original singer's timbre.
- **One heavy job at a time.** The MLX engine runs alone with a 14 GB budget.

## Requirements

- Apple Silicon Mac (M1–M5), 24 GB unified memory recommended.
- macOS 14.2+ for M1–M4; **macOS 26.2+ for M5** (this machine: 26.7.1).
- Python 3.12, Node 22, ffmpeg. This repo installs them under the workspace:
  - `tools/python/cpython-3.12…`
  - `tools/node/`
  - `tools/ffmpeg/bin/{ffmpeg,ffprobe}`
- MLX weights under `models/mlx-Yue2-3B/` and `models/YuE2-Vae/` (≈10.5 GB).
- Engine checkout under `engines/mlx-Yue/` (pinned commit + `.venv`).

## Quick start

```bash
cd Music_draft2
cp .env.example .env
./start.sh
open http://127.0.0.1:8000
```

`start.sh` starts the FastAPI server, serves the production frontend build, and leaves the
MLX engine idle until a job is submitted. Logs are in `logs/`.

For frontend development:

```bash
cd frontend
npm run dev          # http://127.0.0.1:3000, proxies /api to :8000
```

## Install from scratch

```bash
# 1. Toolchain (workspace-local)
curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install 3.12

# Node 22
curl -L https://nodejs.org/dist/v22.23.4/node-v22.23.4-darwin-arm64.tar.gz \
  | tar -xz -C tools/node --strip-components=1

# ffmpeg (static arm64)
mkdir -p tools/ffmpeg/bin
curl -L https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64 \
  -o tools/ffmpeg/bin/ffmpeg
curl -L https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-darwin-arm64 \
  -o tools/ffmpeg/bin/ffprobe
chmod +x tools/ffmpeg/bin/*

# 2. MLX engine
git clone https://github.com/vanch007/mlx-Yue.git engines/mlx-Yue
cd engines/mlx-Yue
uv sync --frozen --no-dev --extra transcription
source .venv/bin/activate
export MLX_ENABLE_TF32=0
# download the 8-bit + NAR + VAE files into ../../models/
```

The MLX model repository is [vanch007/mlx-Yue2-3B](https://huggingface.co/vanch007/mlx-Yue2-3B).
The conversion manifest validates **all** files, including `ar-bf16.safetensors`; download the
complete repository (10.45 GB) or `verify_conversion` will reject the directory.

## Configuration

See `.env.example`. The important values:

| Variable | Default | Meaning |
|---|---|---|
| `MLX_PRECISION` | `8bit` | 8-bit AR; `bf16` is slower and larger |
| `MLX_DEFAULT_STEPS` | `8` | NAR ODE steps for drafts |
| `MLX_FINAL_STEPS` | `32` | NAR steps for final renders |
| `MLX_MEMORY_BUDGET_GB` | `14` | engine guard; leaves room for macOS |
| `MLX_MAX_DURATION` | `360` | hard cap in seconds (6 min) |
| `DEFAULT_OLLAMA_MODEL` | `qwen-fast:latest` | lyric drafting only |
| `MAX_CONCURRENT_HEAVY_JOBS` | `1` | keep at 1 on 24 GB |

Before a job the backend unloads Ollama (`keep_alive=0`), then spawns `mlx-yue`.
Do not run ComfyUI or another multi-GB model at the same time.

## Measured limits on a 24 GB M5 Air

The previous ComfyUI adapter is retained only as a reference: completed ComfyUI prompts on
this machine took **45 min – 4 h 21 min**, and one job consumed 24 GB of swap. That path is
not used by this app.

The MLX path is the supported engine. The QA fixture (15 s, 8 NAR steps, `cot=off`) is the
fast gate; full 60 s / 180 s renders are release tests. Do not run two heavy jobs.

## QA gate

```bash
./qa/run_qa.sh
```

The QA agent is independent: it runs checks and writes evidence, but does not edit source.
The deterministic gate passes only at **score ≥ 8.00 / 10 with zero hard blockers**. A score of
**7.99 fails**: a second independent evaluation runs, then the coding agent fixes findings,
the full suite reruns, the app redeploys, and the new build is rescored. Maximum 3 cycles,
then the release is reported **BLOCKED**. Thresholds are never lowered.

Artifacts: `qa/reports/evidence.json`, `qa/reports/latest.json`, `qa/reports/latest.flac`,
`qa/reports/ui.png`, and `qa/reports/findings.md` on failure.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/songs/generate` | text-to-song job |
| `POST /api/songs/cover` | multipart cover job |
| `GET /api/songs/{id}/events` | SSE stage/progress |
| `GET /api/outputs/{id}/audio.flac` | master audio |
| `GET /api/audio/download/{id}?format=mp3` | transcode |
| `GET /api/capabilities` | live engine/Ollama state |
| `GET /api/status` | system doctor |

The server binds to `127.0.0.1` only and has no authentication. Do not expose it.

## Troubleshooting

### Cover Studio says "Failed to fetch"

The backend is not running. `Failed to fetch` is a browser network error, not an
upload validation error. Start it and check health:

```bash
./start.sh
curl -s http://127.0.0.1:8000/api/health
```

`start.sh` now launches uvicorn with `nohup` and detaches it, so closing the
terminal does not stop the studio. If you previously ran an older build, run
`./stop.sh` once and start again.

### Screen goes idle or the progress stream disconnects

The studio is built to survive this:

- The UI polls `/api/songs/{id}` every 4 seconds as a safety net, and reconnects
  the SSE stream with backoff if it drops.
- Reloading the page resumes the active job from `localStorage` instead of losing it.
- While a render is active, the backend runs `caffeinate -dimsu` and the browser
  requests a Screen Wake Lock, so macOS does not idle-sleep mid-render.

The job itself always continues in the backend; a dropped progress stream no longer
marks it failed.

### The page loads but the engine is not ready

```bash
./scripts/doctor.sh
```

Check that the MLX weights exist under `models/`, the binary is at
`engines/mlx-Yue/.venv/bin/mlx-yue`, and `ffmpeg`/`ffprobe` are under
`tools/ffmpeg/bin/`.

### Generation is slow or the machine swaps

Only one heavy job may run at a time. Quit ComfyUI and other multi-GB model apps.
A reboot clears swap left behind by earlier ComfyUI sessions (the MLX engine itself
uses no swap when it has ~14 GB of headroom).

## License

YuE2 model weights are **CC BY-NC 4.0 with additional creator permission**. Personal creators
may use and monetize outputs; companies need a commercial license from the YuE2 authors.
The mlx-Yue code is Apache-2.0. This application is a local UI and does not grant model rights.

## Non-goals

- Voice cloning / timbre transfer.
- Public hosting / multi-user accounts.
- Cloud generation.
- Running YuE2 and a large LLM simultaneously on 24 GB.
