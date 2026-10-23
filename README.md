# YuE2 Song Studio

A local, sovereign song studio designed specifically for **Apple Silicon Macs (M5 / M4 / M3 / M2 / M1 with 24GB Unified Memory)**. Draft expressive lyrics with **Qwen (via Ollama)** and synthesize full-length songs or covers with **YuE2 (via your existing ComfyUI install)** without sending any data to cloud services.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────────┐
                      │    React + Vite + TypeScript Frontend    │
                      │         (Dark Studio Dashboard)          │
                      └────────────────────┬─────────────────────┘
                                           │ HTTP / SSE / WS
                      ┌────────────────────▼─────────────────────┐
                      │          Python FastAPI Backend          │
                      │  (Pydantic v2, SQLite, Memory Guard)     │
                      └─────────────┬─────────────────┬──────────┘
                                    │                 │
                1. Free ComfyUI GPU │                 │ 2. Free Ollama RAM
                POST /free          │                 │ keep_alive=0
                                    │                 │
                      ┌─────────────▼──────┐   ┌──────▼──────────┐
                      │    Local Ollama    │   │  Local ComfyUI  │
                      │  (Qwen 7B-14B LLM) │   │  (YuE2 Engine)  │
                      │   Lyrics & Tags    │   │ Full Music Gen  │
                      └────────────────────┘   └─────────────────┘
```

### Memory Management Strategy
Apple Silicon's 24GB unified memory allocates up to ~16GB to the GPU. Running YuE2 diffusion models and large language models simultaneously can trigger memory pressure and swap thrashing.
The backend enforces **Single-Heavy-Task Isolation**:
- Prior to lyric drafting: calls ComfyUI `POST /free` (`unload_models=true`, `free_memory=true`) to evacuate GPU VRAM.
- Prior to music synthesis: calls Ollama with `keep_alive=0` to release model weights from memory.
- Enforces a strict local queue (max 1 heavy job at a time) and actively monitors unified memory headroom.

---

## Quick Start Commands

### 1. Clone & Pre-flight Doctor Check
```bash
# Clone the repository
git clone <your-private-repo-url> yue2-song-studio
cd yue2-song-studio

# Run the read-only diagnostic check
./scripts/doctor.sh
```

### 2. Automated Setup
The automated setup script is idempotent, never uses `sudo`, and backs up existing configs.
```bash
# Preview actions without making changes
./scripts/setup.sh --dry-run

# Run automated setup
./scripts/setup.sh
```

### 3. Launching the Studio
```bash
# Start both FastAPI backend and React frontend
./start.sh

# Open your browser at:
# http://localhost:3000
```

### 4. Stopping the Studio
```bash
./stop.sh
```

---

## Project Structure

```
├── backend/                   # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py            # FastAPI application entry & CORS
│   │   ├── config.py          # Strict Pydantic settings (.env)
│   │   ├── db.py              # SQLite aiosqlite database connection & migrations
│   │   ├── routers/
│   │   │   ├── capabilities.py# ComfyUI /object_info probe & capabilities
│   │   │   ├── models.py      # Ollama & ComfyUI live model tags
│   │   │   ├── prompt.py      # Qwen lyric encoder & style guide
│   │   │   ├── songs.py       # Generation pipeline & progress streaming
│   │   │   ├── voices.py      # Vocal reference profiles
│   │   │   ├── library.py     # Past jobs, duplication, playback
│   │   │   └── status.py      # System doctor checks API
│   │   ├── services/
│   │   │   ├── comfy_client.py# ComfyUI REST & WebSocket client
│   │   │   ├── ollama_client.py# Ollama API client & memory unloader
│   │   │   ├── memory_guard.py# Apple Silicon memory monitor & lock
│   │   │   └── workflow_builder.py# Parameter injection into ComfyUI graphs
│   │   ├── schemas/           # Pydantic v2 request/response contracts
│   │   └── workers/           # Asynchronous job queue worker
│   └── tests/                 # Pytest test suite
├── frontend/                  # React + Vite + TypeScript UI
│   ├── src/
│   │   ├── components/        # Studio panels, waveform player, modal dialogs
│   │   ├── hooks/             # SSE / WebSocket generation listeners
│   │   └── types/             # TypeScript interfaces matching Pydantic schemas
│   ├── package.json
│   └── vite.config.ts
├── workflows/                 # ComfyUI API-format JSON templates
│   ├── text_to_song.json
│   ├── text_to_song.mapping.json
│   ├── cover.json
│   ├── cover.mapping.json
│   ├── voice_reference.json
│   └── voice_reference.mapping.json
├── config/                    # Default configurations & presets
│   ├── capabilities.json      # Dynamic node capability map
│   ├── default_settings.json  # Pop, Rock, Acoustic, Ballad, Hip-hop presets
│   └── lyric_guide.json       # Editable Lyric Style Guide rules
├── scripts/                   # Shell and Python automation
│   ├── doctor.sh              # Read-only health check
│   ├── setup.sh               # Idempotent system setup
│   ├── teardown.sh            # Safe cleanup script
│   └── setup_helpers.py       # ComfyUI detection & port tester
├── data/                      # SQLite studio.db
├── outputs/                   # Synthesized WAV/MP3 files by job ID
├── voices/                    # User reference vocal samples
├── logs/                      # Runtime server and setup logs
├── start.sh                   # Process launcher with PID management
├── stop.sh                    # Process terminator
├── requirements.txt           # Python dependencies
├── .env.example               # Template environment configuration
└── .gitignore                 # Safe git ignore rules
```

---

## Troubleshooting Guide

### 1. ComfyUI: "YuE2 custom node missing in /object_info"
- Verify that your ComfyUI has custom YuE / YuE2 nodes installed:
  ```bash
  cd /path/to/ComfyUI/custom_nodes
  ls -la
  ```
- If you use a custom node naming scheme, check `workflows/text_to_song.mapping.json` and adjust the node class names to match your install.
- Always export your ComfyUI workflow using **"Save (API Format)"** (enabled via Settings -> "Enable Dev mode Options").

### 2. Ollama: "Cannot reach Ollama at http://localhost:11434"
- Ensure Ollama is running:
  ```bash
  ollama serve
  ```
- Check that a Qwen model is downloaded:
  ```bash
  ollama list
  # Recommended for 24GB Unified Memory:
  ollama pull qwen2.5:7b-instruct
  ```
  *(Note: Models larger than 14B are discouraged to avoid memory pressure during music generation).*

### 3. Memory Pressure / Crash During Generation
- Verify `AUTO_UNLOAD_MODELS=true` is set in your `.env`.
- Check memory pressure in macOS Activity Monitor.
- In `config/default_settings.json`, reduce `duration_seconds` (e.g. from 90s to 45s) or run with `precision: "bf16"` or quantized checkpoints.

### 4. Port Conflict
If port `8000` or `3000` is already in use:
- Adjust `PORT` and `FRONTEND_PORT` in `.env`.
- Run `./scripts/doctor.sh` to see port availability.
