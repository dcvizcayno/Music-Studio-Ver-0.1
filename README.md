# Music Studio Ver 0.1 — YuE2 Song Studio

A local, Apple-Silicon-native song studio. Full install guide: [SETUP.md](SETUP.md).
Project page: **[Song Studio on Hugging Face](https://huggingface.co/spaces/dcvizcayno/song-studio)**.
Feature deep-dives: [stems](docs/STEMS.md), [QA agents](docs/QA_AGENTS.md),
[Voice Personas](docs/VOICE_PERSONAS.md). Lyrics are drafted with Qwen through Ollama;
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
  Includes a **6-minute default** target duration (30–360 s, override for a quick
  sample), a required working title, **Male** as the default vocal gender, a
  mutually exclusive **Vocal Gender** selector, a **Summarize lyrics** action
  that saves an emotional/story summary to memory, a **Plan score / No score**
  toggle, and a rendered, playable **Interactive ABC score** (abcjs + local FluidR3 piano
  samples, no CDN request), with copy/download of the ABC source.
- **Library navigation:** two-pane layout with a searchable left rail (title,
  created/updated dates, version, BPM, key), per-song and bulk delete (including
  associated Mnemosyne memories), and **SONG DETAILS** on the right. The style
  field is editable; Re-run/Inspiration use the edited style. Audio exports show
  an estimated size for the selected format, and every Interactive ABC score can
  be downloaded as a complete multi-page PDF with title/date/BPM/key.
- **Library stems:** local 6-stem split with htdemucs_6s ONNX
  (Lead Vocal, Drums, Bass, Guitar, Piano/Keyboard, Synth/Other) plus individual
  48 kHz WAV players/downloads. Backing-vocal, kick/snare/hi-hat and
  acoustic/electric-guitar sub-splits are not provided by this model — see
  [docs/STEMS.md](docs/STEMS.md).
- **Library MIDI:** per-stem MIDI via Basic Pitch ONNX for pitched stems, plus
  onset/band kick-snare-hi-hat for drums. Each stem downloads as `.mid`.
- **Library ABC:** a collapsible **Interactive ABC score** per song, matching the
  Text to Song player (engraving, local piano playback, copy/download).
- **Mnemosyne memory:** local Qdrant + Mem0 + Ollama (`nomic-embed-text`) memory.
  Song feedback is embedded and injected into future Qwen prompts; DeepSeek uses
  the same memory in the LangGraph planning graph. See [docs/MEMORY.md](docs/MEMORY.md).
- **Memory-pressure recovery:** VAE decode uses 128-frame chunks and a job retries
  twice if macOS reports high memory pressure; the error tells you to close unused
  Safari tabs/apps.
- **Use as Inspiration:** reuse a Library song's style, tempo and instrumentation
  to generate a brand-new melody and lyrics — no audio or melody is copied. It
  opens Text to Song with style/BPM prefilled and a new-lyrics prompt.
- **Cover:** reference audio → SheetSage2 melody transcription → YuE2.
  Includes Max/Beast Mode (vocal consistency), Style Influence and Audio Influence
  sliders, a **15–360 s Target Duration slider (default 360)**, a required cover
  title, 60 MB uploads, production-tag lyric cleanup, and an **Interactive ABC
  score** with copy/download. A master limiter targets -1 dBFS true peak.
- **Interactive score:** generated ABC is engraved as sheet music and can be played
  with a local piano soundfont. Both Text to Song and Cover Studio show Song Title,
  Date Written, BPM and Key, and keep the raw ABC available for copying/export.
- **Live resources:** the global status bar polls CPU %, Apple GPU % (via IOReg),
  Ollama readiness and MLX readiness every 3 seconds; the generation banner shows
  elapsed time as `(0m 00s)`.
- **Air-gapped runtime.** No remote fonts or CDNs; HF offline env is enforced for
  covers and stems. See [docs/AIRGAP.md](docs/AIRGAP.md).
- **No native voice cloning.** YuE2 conditions on text style and an optional ABC
  score; it has no speaker embedding. A sample-based Voice Persona needs a separate
  singing-voice-conversion stage (Seed-VC). See [docs/VOICE_PERSONAS.md](docs/VOICE_PERSONAS.md).
- **One heavy job at a time.** The MLX engine runs alone with a 14 GB budget.
  If macOS raises memory pressure (for example, many Safari tabs), the job waits
  and retries up to four times instead of failing immediately.

## Requirements

- Apple Silicon Mac (M1–M5), 24 GB unified memory recommended.
- macOS 14.2+ for M1–M4; **macOS 26.2+ for M5** (this machine: 26.7.1).
- Python 3.12, Node 22, ffmpeg. This repo installs them under the workspace:
  - `tools/python/cpython-3.12…`
  - `tools/node/`
  - `tools/ffmpeg/bin/{ffmpeg,ffprobe}`
- MLX weights under `models/mlx-Yue2-3B/` and `models/YuE2-Vae/` (≈10.5 GB).
- Engine checkout under `engines/mlx-Yue/` (pinned commit + `.venv`).
- Stem model: `htdemucs_6s` ONNX (136 MB fp16), downloaded on first stem split.
- Python packages include `demucs-onnx`, `onnxruntime`, `soundfile`, `soxr`.
- Optional memory stack: `qdrant-client`, `mem0ai`, `ollama`, `langgraph`
  (`requirements-memory.txt`) and the native Qdrant arm64 binary.

## Quick start

```bash
cd Music_draft2
cp .env.example .env
./start.sh
open http://127.0.0.1:8000
```

`start.sh` starts the FastAPI server, serves the production frontend build, and leaves the
MLX engine idle until a job is submitted. Logs are in `logs/`.

To start the studio automatically after login/reboot, install the launchd agent:
[`docs/AUTOSTART.md`](docs/AUTOSTART.md) or `./scripts/install-autostart.sh`.

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

Install the app requirements after cloning (this includes `demucs-onnx` for
Library stems):

```bash
cd Music_draft2
uv venv --python 3.12 .venv
uv pip install -r requirements.txt
uv pip install -r requirements-memory.txt
./scripts/install-qdrant.sh
cd frontend && npm install && npm run build && cd ..
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
| `MAX_UPLOAD_MB` | `60` | cover reference upload limit |
| `DEMUCS_BIN` | `.venv/bin/demucs-onnx` | stem splitter executable |

Before a job the backend unloads Ollama (`keep_alive=0`), then spawns `mlx-yue`.
Do not run ComfyUI or another multi-GB model at the same time.

## Measured limits on a 24 GB M5 Air

The previous ComfyUI adapter is retained only as a reference: completed ComfyUI prompts on
this machine took **45 min – 4 h 21 min**, and one job consumed 24 GB of swap. That path is
not used by this app.

The MLX path is the supported engine. A 15 s fixture completes in roughly 30–40 s
including planning and 8 NAR steps; cover renders add SheetSage2 transcription.
Stem separation takes about 5.4 s for 15 s of audio on CPU. Do not run two heavy
jobs (generation + stem split) at once.

## QA gate

```bash
./qa/run_qa.sh --with-cover --with-resilience --with-audio-quality
```

The sound-quality agent (`qa/audio_quality_agent.md`) runs FFmpeg loudness/peak/
dynamic-range checks and a human listening checklist. `qa/integration_agent.md`
covers Library stems, inspiration, and regressions. Neither replaces listening.
See [docs/QA_AGENTS.md](docs/QA_AGENTS.md) for the four-agent split.
See [docs/MIDI.md](docs/MIDI.md) for the MIDI model and accuracy limits.

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
| `GET /api/songs/{id}/abc` | generated ABC score |
| `POST /api/jobs/{id}/stems` | start 6-stem separation |
| `GET /api/jobs/{id}/stems` | stem status + metadata |
| `GET /api/jobs/{id}/stems/{stem}` | one stem WAV |
| `POST /api/jobs/{id}/midi` | start per-stem MIDI |
| `GET /api/jobs/{id}/midi` | MIDI status + note counts |
| `GET /api/jobs/{id}/midi/{stem}.mid` | one MIDI file |
| `GET /api/memory/health` | Qdrant/Mem0 health |
| `GET /api/memory/context?query=&agent=` | retrieved preferences |
| `GET /api/memory` | stored memories |
| `POST /api/memory/remember` | add a memory |
| `POST /api/memory/feedback` | save song feedback |
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

### `System memory pressure is not normal (level=2)`

macOS is under memory pressure during generation, usually from many Safari tabs
or another memory-heavy app. The backend now retries up to four times after a 30 s wait and
uses 128-frame VAE chunks. If it still fails, close unused tabs/apps and retry;
the job error includes this instruction.

### Cover fails with `Another Lyra process owns the GPU`

A previous engine process survived a backend restart and still holds Lyra's
per-user GPU lock. The backend now reaps orphaned workspace `mlx-yue` processes
at startup. If it happens while the service is running, stop/start the studio:

```bash
./stop.sh && ./start.sh
```

### Generation is slow or the machine swaps

Only one heavy job may run at a time. Quit ComfyUI and other multi-GB model apps.
A reboot clears swap left behind by earlier ComfyUI sessions (the MLX engine itself
uses no swap when it has ~14 GB of headroom).

## AI memory

The **Teach the studio** form in Library stores feedback locally in Qdrant via
Mem0. Future Qwen prompts receive the most relevant preferences automatically;
DeepSeek's LangGraph planning graph retrieves the same memory, and YuE receives a
compact preference suffix in its style prompt. Qdrant runs on `127.0.0.1:6333`;
embeddings use local `nomic-embed-text` through Ollama.

```bash
./scripts/install-qdrant.sh
./scripts/start-qdrant.sh
curl http://127.0.0.1:6333/healthz
.venv/bin/python qa/memory_qa.py
```

See [docs/MEMORY.md](docs/MEMORY.md) for architecture, LangGraph approval
checkpoints, and limitations. Set `MNEMOSYNE_PLANNER=deepseek` to use local
`deepseek-r1:14b` for planning instead of the deterministic planner.

## Air-gapped operation

After the one-time model/toolchain install, the UI, API, generation, covers,
stems, MIDI, abcjs and piano samples all run locally. Google Fonts was removed;
the UI uses the system font stack. Cover and stem subprocesses force Hugging Face
offline mode.

```bash
./scripts/airgap_audit.sh
cd qa && PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" node airgap.mjs
```

Details and the one-time network requirements: [docs/AIRGAP.md](docs/AIRGAP.md).

## Library and Inspiration

Open **Library**, expand a completed render, and use:

- **Split Stems** — six local stems with players/downloads.
- **Use as Inspiration** — prefill Text to Song with the source style, BPM and
  instrumentation; new lyrics and a new melody are generated without copying the
  reference audio or melody.

A sample-based **Voice Persona** is not a YuE2 feature; see
[docs/VOICE_PERSONAS.md](docs/VOICE_PERSONAS.md) for the Seed-VC plan.

## License

- **Application code:** MIT — see [LICENSE](LICENSE).
- **Vendored abcjs:** MIT — see `frontend/public/vendor/abcjs.LICENSE`.
- **FluidR3_GM piano samples:** CC BY 3.0 (Frank Wen / midi-js-soundfonts) —
  attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **YuE2 model weights:** **CC BY-NC 4.0 with additional creator permission**.
  Personal creators may use and monetize outputs; companies need a commercial
  license from the YuE2 authors. The weights are not included in this repository.
- **mlx-Yue:** Apache-2.0; **demucs-onnx / htdemucs_6s:** MIT; both are external
  and downloaded separately.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the complete notice file.
Model weights are not redistributed; downloading them does not grant rights beyond
their own licenses.

## Non-goals

- Native voice cloning / sample-based Voice Personas in v0.1 (a Seed-VC phase is documented in `docs/VOICE_PERSONAS.md`).
- Public hosting / multi-user accounts.
- Cloud generation.
- Running YuE2 and a large LLM simultaneously on 24 GB.
