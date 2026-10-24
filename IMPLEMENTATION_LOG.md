# Implementation log

## Scope

Replaced the simulated ComfyUI engine with a real local `mlx-Yue` engine on Apple Silicon (M5, 24 GB), kept the React/FastAPI/SQLite shell, removed the fake WAV fallback, added real SSE/upload/cancel, and added an independent QA gate.

## Environment

- Workspace: `/Users/danielvizcayno/Documents/deepseek-harness/default-workspace`
- App: `Music_draft2`
- Engine: `engines/mlx-Yue` at commit `c5b5a8190f78c74aa671a4caa19dae8b8e04b3d8`
- Models: `models/mlx-Yue2-3B` (8-bit + bf16 + NAR) and `models/YuE2-Vae`
- Python 3.12 via `uv`; Node 22 via official arm64 tarball; ffmpeg 6.0 static arm64
- No reboot; the active ComfyUI job was interrupted and ComfyUI was stopped to free memory.

## Measured MLX gate (15 s fixture, 8 NAR steps)

- AR: 400 tokens at 43.8 tokens/s (9.1 s)
- NAR: 5.7 s; VAE: 1.8 s; end-to-end 18.2 s
- Peak RSS: 6.37 GB; swaps: 0
- Output: 15.999 s, 48 kHz stereo FLAC

## QA

- `qa/run_qa.sh --with-cover`
- Text fixture: 15 s, 8 steps, `cot=off`
- Cover fixture: 17.6 s render from a 16 s reference
- Final score: **10.00 / 10**, gate **PASS**

## Admin notes

- No system-wide settings changed.
- No `sudo` used.
- ComfyUI was stopped; its models were not modified.
- The app binds to `127.0.0.1` only.
