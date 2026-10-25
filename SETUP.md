# Setup — Music Studio Ver 0.1

Project page: [Song Studio on Hugging Face](https://huggingface.co/spaces/dcvizcayno/song-studio)

This is the exact setup used on the target MacBook Air M5 (24 GB, macOS 26.7.1).
The app is local-only and binds to `127.0.0.1`.

## 1. Requirements

- Apple Silicon Mac (M1–M5), 24 GB unified memory recommended.
- macOS 14.2+ for M1–M4; **macOS 26.2+ for M5**.
- ~12 GB free disk for models, plus room for outputs.
- Python 3.12, Node 22, ffmpeg/ffprobe.
- Ollama for lyric drafting (optional; generation works without it).
- `demucs-onnx` (installed from `requirements.txt`) for Library stems; the
  htdemucs_6s model downloads on first use (~136 MB).
- Optional MIDI stack (`basic-pitch` ONNX + librosa/pretty_midi) for Library
  per-stem MIDI; see [docs/MIDI.md](docs/MIDI.md).

The repository itself is small. Model weights, the MLX engine checkout, virtual
environments, outputs, uploads and logs are intentionally not committed.

## 2. Directory layout

Everything lives under one workspace root:

```text
default-workspace/
├── Music_draft2/                 # this repo (app)
│   ├── backend/                  # FastAPI
│   ├── frontend/                 # React + Vite
│   ├── qa/                       # QA agent + deterministic gate
│   ├── start.sh / stop.sh
│   └── .env
├── engines/
│   └── mlx-Yue/                  # git clone + .venv
├── models/
│   ├── mlx-Yue2-3B/              # AR/NAR weights
│   ├── YuE2-Vae/                 # 48 kHz decoder
│   └── hf-cache/                 # stem model cache (first run)
└── tools/
    ├── node/                     # Node 22
    └── ffmpeg/bin/               # ffmpeg + ffprobe
```

If you use different paths, update `.env` (see section 5).

## 3. Toolchain

```bash
cd /path/to/default-workspace

# uv + Python 3.12
curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install 3.12

# Node 22 (official arm64 tarball)
mkdir -p tools/node
curl -L https://nodejs.org/dist/v22.23.4/node-v22.23.4-darwin-arm64.tar.gz \
  | tar -xz -C tools/node --strip-components=1

# ffmpeg + ffprobe (static arm64)
mkdir -p tools/ffmpeg/bin
curl -L https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64 \
  -o tools/ffmpeg/bin/ffmpeg
curl -L https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-darwin-arm64 \
  -o tools/ffmpeg/bin/ffprobe
chmod +x tools/ffmpeg/bin/*

# Verify
tools/node/bin/node -v       # v22.x
tools/ffmpeg/bin/ffmpeg -version | head -1
```

## 4. MLX engine and weights

```bash
git clone https://github.com/vanch007/mlx-Yue.git engines/mlx-Yue
cd engines/mlx-Yue
git checkout c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8
uv sync --frozen --no-dev --extra transcription
source .venv/bin/activate
export MLX_ENABLE_TF32=0
```

Download the weights into `models/`. The conversion manifest validates **all**
files, including `ar-bf16.safetensors`, so fetch the complete set:

```bash
cd /path/to/default-workspace
mkdir -p models/mlx-Yue2-3B models/YuE2-Vae

for f in config.json conversion.json qwen.tiktoken \
         ar-8bit.safetensors ar-bf16.safetensors nar-bf16.safetensors \
         LICENSE THIRD_PARTY_NOTICES.md \
         licenses/SnakeBeta-NVIDIA-MIT.txt licenses/stable-audio-tools-MIT.txt; do
  mkdir -p "models/mlx-Yue2-3B/$(dirname "$f")"
  curl -L --retry 10 --retry-all-errors -C - \
    "https://huggingface.co/vanch007/mlx-Yue2-3B/resolve/main/$f?download=true" \
    -o "models/mlx-Yue2-3B/$f"
done

for f in config.json model.safetensors weights_manifest.json; do
  curl -L --retry 10 --retry-all-errors -C - \
    "https://huggingface.co/vanch007/mlx-Yue2-3B/resolve/main/vae/$f?download=true" \
    -o "models/YuE2-Vae/$f"
done
```

Expected sizes: AR 8-bit 2.66 GB, AR bf16 4.33 GB, NAR 2.93 GB, VAE 0.53 GB.

Verify:
```bash
cd engines/mlx-Yue
.venv/bin/python - <<'PY'
from pathlib import Path
from lyra.conversion import verify_conversion
print(verify_conversion(Path('../../models/mlx-Yue2-3B'))['format'])
PY
```

## 5. App environment

```bash
cd /path/to/default-workspace/Music_draft2
cp .env.example .env
# Edit .env if your workspace path differs from the default.
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt   # includes demucs-onnx for stems

cd frontend
npm install
npm run build
```

The important `.env` values:

| Variable | Default |
|---|---|
| `MLX_YUE_BIN` | `.../engines/mlx-Yue/.venv/bin/mlx-yue` |
| `MLX_MODEL_DIR` | `.../models/mlx-Yue2-3B` |
| `MLX_VAE_DIR` | `.../models/YuE2-Vae` |
| `MLX_PRECISION` | `8bit` |
| `MLX_MEMORY_BUDGET_GB` | `14` |
| `MLX_DEFAULT_STEPS` | `8` |
| `MLX_FINAL_STEPS` | `32` |
| `FFMPEG_BIN` | `.../tools/ffmpeg/bin/ffmpeg` |
| `DEFAULT_OLLAMA_MODEL` | `qwen-fast:latest` |

## 6. Run

```bash
cd /path/to/default-workspace/Music_draft2
./start.sh
# open http://127.0.0.1:8000
./scripts/doctor.sh
```

Optional — start automatically after login/reboot:

```bash
./scripts/install-autostart.sh
```

See [docs/AUTOSTART.md](docs/AUTOSTART.md) for verification, stop/restart, and
uninstall.

`start.sh` detaches the backend with `nohup`/`disown`, so closing the terminal
does not stop it. `./stop.sh` stops it.

For frontend development only:

```bash
cd frontend
npm run dev        # http://127.0.0.1:3000, proxies /api to :8000
```

## 7. Generate

1. **Text to Song:** write/draft lyrics, choose a preset, set duration and NAR
   steps (8 draft, 16 standard, 32 final), then Generate. “Auto from lyrics & BPM”
   estimates length with the toolstud.io formula (bars × 4 × 60 ÷ BPM), up to 6
   minutes. “Plan score (ABC)” generates an editable melody; “No score · faster”
   skips planning. **Vocal Gender** (Male/Female) is optional and mutually
   exclusive; the chosen value replaces any male/female wording in the style tags
   and is sent directly to YuE2. The returned ABC is shown under the player and can
   be copied or downloaded as `score.abc`.
2. **Cover Studio:** upload a reference audio file (WAV/MP3/FLAC, ≤60 MB,
   ≤6 minutes), choose the target style, confirm rights, and Generate.
   SheetSage2 transcribes the melody; YuE2 renders a new arrangement.
   - **Max/Beast Mode** (default on) forces 32 NAR steps and adds vocal-consistency
     guidance.
   - **Style Influence** maps 0–100% to YuE2 guidance (50% = neutral 1.0).
   - **Audio Influence** maps 0–15% to reference-free generation, 20–75% to melody
     transcription, and 80–100% to the full transcribed score.
   - Production-only bracket tags are normalized to `[Verse]` / `[Chorus]` before
     generation; this is the practical lyric-adherence lever, not a hard guarantee.
   - Voice timbre is not cloned.
3. The Library keeps completed jobs and allows export to WAV/MP3/FLAC.

   **Split Stems** runs local `demucs-onnx` (`htdemucs_6s`, CPU) into Lead Vocal,
   Drums, Bass, Guitar, Piano/Keyboard and Synth/Other. Each is a 48 kHz WAV with
   player/download. The first split downloads the 136 MB model. Backing-vocal,
   kick/snare/hat and acoustic/electric-guitar sub-splits are not provided by this
   model; see [docs/STEMS.md](docs/STEMS.md).

   **Create MIDI** transcribes each completed stem. Pitched stems use Basic Pitch
   ONNX; drums use onset + spectral-band kick/snare/hi-hat. The UI shows note
   counts and downloadable `.mid` files.

   Below the MIDI panel, **Interactive ABC score** expands to the same abcjs
   engraving/playback used in Text to Song, with copy/download.

   **Use as Inspiration** prefills Text to Song with the song's style/tempo for a
   brand-new melody and lyrics; it never reuses the reference audio or melody.
4. Voice Personas/voice cloning are **not** a YuE2 feature. A real sample-based
   persona needs a separate singing-voice-conversion model such as
   [Seed-VC](https://github.com/Plachtaa/seed-vc) (Mac M-series supported), used on
   the vocal stem and remixed with the other stems. This is not part of v0.1; see
   [docs/VOICE_PERSONAS.md](docs/VOICE_PERSONAS.md).

Only one heavy job runs at a time. Quit ComfyUI/other model apps before generating.

The UI polls job status as a fallback, reconnects SSE, and resumes an active job
after a page reload. While a render runs, the backend holds `caffeinate` and the
browser requests a Screen Wake Lock so idle sleep does not interrupt the session.

## 8. QA gate

```bash
cd /path/to/default-workspace/Music_draft2
./qa/run_qa.sh --with-cover --with-resilience --with-audio-quality
```

- Runs backend pytest, frontend build, Playwright, a real 15 s text render, a
  real cover render, idle-disconnect recovery, ABC/interactive-score checks, and
  the sound-quality analysis.
- The release gate passes only at **score ≥ 8.00 / 10** with zero hard blockers.
- **7.99 fails**: independent second evaluation → findings → recode → full retest
  → redeploy → rescore. Maximum 3 cycles, then `BLOCKED`.
- Reports: `qa/reports/latest.json`, `evidence.json`, `latest.flac`, `cover.flac`,
  `ui.png`.

## 9. Troubleshooting

**“Failed to fetch” in Cover Studio** — the backend is not running:
```bash
./start.sh
curl -s http://127.0.0.1:8000/api/health
```
Hard-refresh the browser once (`Cmd+Shift+R`) after restarting.

**Engine not ready** — run `./scripts/doctor.sh` and check the model paths,
`engines/mlx-Yue/.venv/bin/mlx-yue`, and `tools/ffmpeg/bin/`.

**Slow generation / swap** — 24 GB is the minimum. Do not run ComfyUI and MLX
together. A reboot clears swap left by earlier ComfyUI sessions.

**Ollama offline** — lyric drafting is optional; generation still works. Start
Ollama and `ollama pull qwen-fast` (or use an installed Qwen tag).

**Stem split fails** — check `logs/backend.log`; verify
`.venv/bin/demucs-onnx` exists and the first model download can write to
`models/hf-cache`. CPU is intentional; CoreML was rejected by this ONNX graph.

**MIDI fails** — install the optional stack per [docs/MIDI.md](docs/MIDI.md) and
confirm `models/basic-pitch/nmp.onnx` exists. MIDI requires completed stems.

**Memory pressure during generation** — the backend uses 128-frame VAE chunks and
retries up to four times. If it still fails, close unused Safari tabs/apps and retry.

**Voice Persona** — not available in YuE2. See
[docs/VOICE_PERSONAS.md](docs/VOICE_PERSONAS.md); do not promise voice cloning
from the current UI.

## 10. License

- Application code: **MIT** — see [LICENSE](LICENSE).
- abcjs: MIT; FluidR3_GM samples: CC BY 3.0; see
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- YuE2 model weights: **CC BY-NC 4.0 with additional creator permission**.
  Personal creators may use and monetize outputs; companies need a commercial
  license from the YuE2 authors. The weights are not included in this repository.
- mlx-Yue: Apache-2.0. demucs-onnx / htdemucs_6s: MIT.

This repository does not grant rights to the model weights.
