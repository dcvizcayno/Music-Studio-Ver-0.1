# Mnemosyne — local AI memory

Mnemosyne gives every local agent a shared, persistent memory of the user's
preferences and post-song feedback.

## Stack

```text
React feedback form
  → FastAPI /api/memory/*
      → Mem0 (semantic memory layer)
          → Qdrant 1.20.0 (native arm64, 127.0.0.1:6333)
          → nomic-embed-text via Ollama (768-d)
          → Qwen/DeepSeek via Ollama (optional extraction/summary)
      → Mnemosyne prompt hook
          → Qwen lyric system prompt
          → DeepSeek/LangGraph planning
          → YuE style/lyrics produced by Qwen
```

## Qdrant

- Binary: `mnemosyne/qdrant/bin/qdrant` (Apple Silicon, pinned 1.20.0)
- Storage: `mnemosyne/qdrant/storage/`
- Health: `curl http://127.0.0.1:6333/healthz`
- Collection: `mnemosyne`, 768-dimensional cosine vectors
- Telemetry: disabled
- Qdrant is lightweight for a 24 GB Mac; the substantial memory cost is the
  Ollama embedding model and the song models, not Qdrant itself.

Install/start manually:

```bash
./scripts/install-qdrant.sh
./scripts/start-qdrant.sh
curl http://127.0.0.1:6333/healthz
```

The backend also ensures Qdrant is running at startup if the binary is present.

## Mem0

Configuration lives in `mnemosyne/memory_engine.py`:

- Vector store: Qdrant
- Embedder: `nomic-embed-text:latest` via local Ollama
- LLM: `qwen-fast:latest` via local Ollama (configurable to
  `deepseek-r1:14b` with `MNEMOSYNE_LLM_MODEL`)
- User namespace: `song-studio`
- Telemetry: `MEM0_TELEMETRY=false`

Feedback is stored with `infer=False`, preserving the exact text rather than
letting a small local LLM rewrite it. Mem0 still embeds/dedupes and retrieves it
semantically.

## Agent registry

| Agent | Local runtime | Memory use |
|---|---|---|
| Qwen | Ollama | Lyric/style system prompt |
| DeepSeek | Ollama | LangGraph planning/review |
| YuE2 | mlx-Yue | Receives memory-conditioned style/lyrics from Qwen plus a compact memory suffix in the YuE style prompt |
| UI | React | Feedback capture and workflow |

Prompt context is injected through `mnemosyne/prompt_hook.py`; it is trimmed to
1,600 characters and only includes retrieved memories.

## Feedback loop

After a song completes, expand it in **Library** and use **Teach the studio**:

1. Rate 1–5.
2. Add notes such as “keep choruses shorter” or “less reverb.”
3. Save.

Text to Song also has **Summarize lyrics**, which reads the lyrics with Qwen,
writes a ≤500-character summary of feel, emotional anchor and story, and stores
it in Qdrant. The summary replaces the premise field so it can guide the current
song and future prompts.

The feedback/summary is embedded in Qdrant immediately. Deleting a song from
Library (single or bulk) removes feedback with that `job_id` and song summaries
with the matching title from Qdrant. Future Qwen prompts retrieve the
most relevant memories and prepend them to the system prompt. The feedback is
also available to the DeepSeek planning graph.

API:

```http
GET  /api/memory/health
GET  /api/memory/context?query=...&agent=qwen
GET  /api/memory
POST /api/memory/remember
POST /api/memory/feedback
```

## LangGraph approval checkpoint

`mnemosyne/checkpoint_graph.py` is a coding/architecture workflow with:

- SQLite checkpoint persistence (`mnemosyne/checkpoints.sqlite`)
- `interrupt_before=["write_code"]`
- A write node that refuses to run without `approved=True`
- Writes only to `mnemosyne/proposals/`, never application source

To use the local DeepSeek planner instead of the deterministic planner:

```bash
MNEMOSYNE_PLANNER=deepseek .venv/bin/python -m mnemosyne.checkpoint_graph "Add a preference badge"
```

Run:

```bash
# Plan only; stops before write_code
.venv/bin/python -m mnemosyne.checkpoint_graph "Add a preference badge"

# After reviewing the checkpoint, approve and resume
.venv/bin/python -m mnemosyne.checkpoint_graph "Add a preference badge" --approve
```

## Install

```bash
uv pip install -r requirements-memory.txt
./scripts/install-qdrant.sh
./scripts/start-qdrant.sh
```

The backend starts Qdrant automatically if it is installed but not running.

## Air-gap notes

- Qdrant telemetry is disabled.
- Mem0 telemetry is disabled before import.
- Embeddings and LLM calls go to `127.0.0.1:11434`.
- Qdrant is `127.0.0.1:6333`.
- The memory stack adds no outbound runtime dependency.

## Limitations

- Memory retrieval is semantic, not a guarantee of relevance.
- A 1–5 rating plus free text is intentionally simple; no automatic fine-tuning.
- YuE does not accept a native memory channel; the backend appends a compact
  preference hint (max 260 chars) to the YuE style prompt. Cover Studio is still
  directed primarily by its explicit style controls.
- Qdrant data is local and unencrypted at rest in `mnemosyne/qdrant/storage/`.
