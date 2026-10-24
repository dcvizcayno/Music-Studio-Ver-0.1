# Implementation log

## Scope

Replaced the simulated ComfyUI engine with a real local `mlx-Yue` engine on Apple Silicon (M5, 24 GB), kept the React/FastAPI/SQLite shell, removed the fake WAV fallback, added real SSE/upload/cancel, and added an independent QA gate.

## Environment

- Workspace: `/path/to/default-workspace`
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

- `qa/run_qa.sh --with-cover`, independently re-run by the QA agent
- Text fixture: 15 s, 8 steps, `cot=off`; output 14.9987 s, generation 30.0 s
- Cover fixture: 15 s reference → 59.9987 s cover; 95.1 s end-to-end render
- Independent QA elapsed: 128.3 s; 26/26 checks passed, 0 skipped
- Final score: **10.00 / 10**, gate **PASS**, commit `caeff6e`
- Release tag: `qa-pass-10.00-caeff6e`

## Admin notes

- No system-wide settings changed.
- No `sudo` used.
- ComfyUI was stopped; its models were not modified.
- The app binds to `127.0.0.1` only.
- Inspiration race fixed: preset initialization no longer overwrites the inspired style/BPM; completed stems preload when a Library card expands.
- Auto-start: per-user launchd agent (`com.danielvizcayno.musicstudio`) at login with crash restart, plus `install-autostart.sh` / `uninstall-autostart.sh`; `start.sh` falls back to manual launch if bootstrap is unavailable.
- Library: local 6-stem splitter via demucs-onnx/htdemucs_6s CPU (vocals, drums, bass, guitar, piano, other), 48 kHz WAV export; Use as Inspiration prefills a new text-to-song job from style/tempo without audio or melody reuse.
- Cover controls: Max/Beast Mode (32 NAR steps + vocal-consistency prompt), Style Influence (0.5–1.6 cfg_scale), Audio Influence (reference-free / melody / full-score), 60 MB upload cap, source-duration check, production-tag lyric cleanup, and a master limiter at -1 dBFS true peak for clipping.
- Sound QA: FFmpeg loudness/peak/dynamics analyzer + human listening checklist in `qa/audio_quality_agent.md`; gate check `audio_quality_pass`.
- Interactive ABC score: vendored abcjs 6.7 + local FluidR3 piano samples; engraves the generated ABC, adds piano playback controls, copy/download, and raw-source disclosure.
- Vocal Gender: optional Male/Female selector before Style Fusion, mutually exclusive, sent as `vocal_gender` and applied to the YuE2 style prompt after removing conflicting gender wording.
- Text-to-song: auto duration from lyric lines + BPM using `bars × beats × 60 ÷ BPM` (toolstud.io formula), 360 s cap; Plan score / No score toggle; ABC score shown after render and served at `/api/songs/{id}/abc`.
- Idle resilience: UI polls job status, reconnects SSE, resumes after reload; backend runs `caffeinate -dimsu` during renders and releases it on completion/cancel.
- Cover Studio "Failed to fetch" root cause: `start.sh` did not detach the backend, so it stopped when the launcher shell exited. Fixed with `nohup` + `disown`; log/PID paths are now absolute under the repo `logs/`.
