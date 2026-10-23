# YuE2 Song Studio: Comprehensive Feature Verification, Hardening & GitHub Sync

Comprehensive execution plan to retest every feature across the YuE2 Song Studio workstation, fix any identified issues, verify UI/API/encoder pipelines, and sync the clean repository with your remote GitHub repository.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed User Decisions (from Clarification Phase):**
> - **GitHub Synchronization**: You indicated you will provide your GitHub repository URL now. The system is prepared to immediately attach your remote (`git remote add origin <URL>`) and push the clean `main` branch, while also detailing manual fallback commands if personal access tokens or SSH authentication are required on your local Apple Silicon machine.
> - **Prioritized Verification Scope**: Full suite verification prioritized across all 4 operational layers:
>   1. Frontend UI build, type check (`tsc`), and layout styling.
>   2. Audio Encoders: all 8 formats (WAV, AIFF, FLAC, ALAC, MP3, AAC, Ogg Vorbis, Opus) via FFmpeg transcode pipeline.
>   3. Lyric & Section Rules: strict 5,000-character lyric limit, 1,000-character style tags limit, genre-specific structure markers (Pop, Rock/Alt Rock/Grunge with solo, Acoustic, Alt R&B, and Rap/Hip Hop/Lo-Fi).
>   4. API endpoints & server contract compliance.

---

### 1. Overview & Core Concept

- **What It Does**: YuE2 Song Studio is a self-hosted, professional-grade AI music creation workstation designed specifically for Apple Silicon Macs (M2 Max 32-core GPU / 24GB Unified Memory on macOS Sequoia). It connects local Ollama LLMs (`qwen2.5:7b-instruct`) for intelligent style fusion and lyric structuring with ComfyUI running the YuE2 workflow on port 8188.
- **Target Audience**: Music producers, songwriters, and audio engineers seeking local, private, and fully customizable generative music composition without cloud subscription lock-in.
- **Key Value**: Guarantees zero latency and privacy, exact genre section markers, unified memory guardrails (protecting 24GB unified RAM with single-job serialization), 8 high-fidelity export formats, and custom download file naming.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Prompt & Style Fusion*: Select 1–3 style tags (defaulting to Modern Pop). BPM automatically updates with contextual genre recommendations. Input custom emotional premise (limited to 500 chars, 3 lines with scrollbar).
  2. *Lyric Conditioning*: Live genre section template insertion matching exact industry standards (Pop with pre/post-chorus, Rock/Grunge with instrumental solo, Rap/Lo-Fi with hook/verse alternating). Monitored with live character counters (1,000 chars for combined style tags, 5,000 chars for lyrics).
  3. *Generation & Hardware Telemetry*: Single-job serialization dispatches to ComfyUI/YuE2 while displaying real-time Unified Memory headroom.
  4. *Mastering & Export*: Custom filename input field paired with multi-format audio transcoder supporting WAV (lossless 24-bit), AIFF, FLAC, ALAC (M4A), MP3 (320kbps), AAC (256kbps), Ogg Vorbis, and Opus.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Dark slate audio workstation aesthetic inspired by professional DAWs (Ableton, Logic Pro), emphasizing clarity, precise metrics, and zero-distraction focus.
  - *Color Palette*: Slate-950 canvas (`#020617`), slate-900 panels (`#0f172a`), emerald-500 accents (`#10b981`) for nominal states, violet-500 (`#8b5cf6`) for creative LLM actions, amber-500 (`#f59e0b`) for memory warnings, and rose-500 (`#f43f5e`) for errors.
  - *Typography*: Plus Jakarta Sans for clean structural navigation, paired with tabular monospace (`JetBrains Mono` / `font-mono tabular-nums`) for BPM, timecodes, sample rates, and character counts.
  - *Layout & Controls*: Clean 3-zone header, zero unboxed pill capsules, single-line buttons with ellipsis fallback, and high-density audio controls.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Audio Transcoder Architecture (Server-Side FFmpeg)**
  - *Chosen Approach*: Backend asynchronous streaming transcode with pure FFmpeg subprocesses handling raw PCM to 8 destination container formats.
  - *Why*: Apple Silicon hardware encoders provide near-instantaneous export without browser WebAssembly memory bottlenecks or client-side stutter.
- **Decision 2: Genre Marker Validation & Fallback Rules**
  - *Chosen Approach*: Dual enforcement — both client-side interactive chips/templates and backend template injectors in `ollama_client.py` and `lyric_guide.json`.
  - *Why*: Guarantees that whether a user writes lyrics manually, utilizes LLM generation via Ollama, or pastes lyrics from external sources, the required section tags (`[intro]`, `[verse]`, `[chorus]`, `[instrumental solo]`, `[hook/chorus]`) are verified and preserved.
- **Decision 3: Character Limit Guardrails**
  - *Chosen Approach*: Hard ceiling at 1,000 characters for combined style tags and 5,000 characters for lyrics with visual warning thresholds at 90% capacity.
  - *Why*: Prevents prompt truncation in YuE2/ComfyUI tokenizers and avoids out-of-context memory leaks in the local LLM.

---

### 4. Technical Architecture & Data Strategy

#### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        YuE2 Song Studio UI                             │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ 01. Prompt & Style Tab  │  │ 02. Lyrics & Conditioning Tab       │  │
│  │ • 1-3 Style Checkboxes  │  │ • Style Tags (Max 1000 chars)       │  │
│  │ • Editable BPM + Hints  │  │ • Genre Markers Engine              │  │
│  │ • Premise (Max 500 ch)  │  │ • Lyrics Area (Max 5000 chars)      │  │
│  └────────────┬────────────┘  └──────────────────┬──────────────────┘  │
│               │                                  │                     │
│               ▼                                  ▼                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                Generation & Hardware Monitor                     │  │
│  │ • Memory Guard (24GB Unified RAM)  • Single Job Serialization    │  │
│  └────────────────────────────┬─────────────────────────────────────┘  │
│                               ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   Audio Master & Export Engine                   │  │
│  │ • Custom Filename Box  • 8 Encoders (WAV, FLAC, MP3, OPUS...)    │  │
│  └────────────────────────────┬─────────────────────────────────────┘  │
└───────────────────────────────┼────────────────────────────────────────┘
                                │ HTTP / REST API
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (/backend/app)                       │
│  ┌───────────────────────────┐      ┌───────────────────────────────┐  │
│  │   /api/generate (YuE2)    │      │  /api/audio/transcode (FFmpeg)│  │
│  └─────────────┬─────────────┘      └───────────────┬───────────────┘  │
│                │                                    │                  │
│                ▼                                    ▼                  │
│  ┌───────────────────────────┐      ┌───────────────────────────────┐  │
│  │ Ollama (Qwen 2.5:7b)      │      │ FFmpeg Audio Pipeline         │  │
│  │ Port 11434                │      │ 8 Formats Transcode           │  │
│  └───────────────────────────┘      └───────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

#### Verification & Test Execution Plan

1. **Audio Encoders Test Suite (`scripts/test_audio_encoders.py`)**:
   - Transcode synthetic PCM test stream to WAV, AIFF, FLAC, ALAC, MP3, AAC, OGG, and OPUS.
   - Assert file integrity, non-zero byte size, and correct headers for each format.
2. **Lyric Rules & Genre Markers Test Suite (`scripts/test_lyric_rules.py`)**:
   - Validate 5,000 char max lyric boundaries.
   - Validate 1,000 char combined style tags limit.
   - Verify marker requirements for Pop, Rock/Grunge (verifying `[instrumental solo]`), Acoustic, Alt R&B, and Rap/Lo-Fi (`[hook/chorus]`).
3. **Frontend Compilation & Static Analysis**:
   - Run TypeScript compiler `npm run lint` (`tsc --noEmit`) to verify strict typing.
   - Run `compile_applet` to verify Vite production bundle build.
4. **Git Repository Remote Binding & Push**:
   - Check current git working tree status on `main`.
   - Configure user's remote GitHub repository once provided, or prepare the exact push execution commands.
