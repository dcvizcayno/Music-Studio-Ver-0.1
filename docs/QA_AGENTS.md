# QA agents

Three independent agents cover different risks. None edits application source.

## 1. UI / release QA

- Contract: [`qa/agent.md`](../qa/agent.md)
- Rubric: [`qa/rubric.md`](../qa/rubric.md)
- Runner: `./qa/run_qa.sh --with-cover --with-resilience --with-audio-quality`
- Focus: real generation, audio validity, API/security, rendered UI, interactive
  ABC score, idle recovery.

The deterministic gate passes only at **score ≥ 8.00 / 10** with zero hard
blockers. A score of **7.99 fails**; the 7.99 protocol is in the rubric.

## 2. Sound Quality QA

- Contract: [`qa/audio_quality_agent.md`](../qa/audio_quality_agent.md)
- Script: `python3 qa/audio_quality.py --audio <master.flac>`
- Focus: true peak/clipping, LUFS, LRA, stereo, silence, flatness, plus a
  mandatory human headphone checklist.

The script reports a **humanization proxy score**, not proof that a render sounds
human. Metrics cannot judge lyrics, pronunciation, or one-performer consistency.

## 3. Memory QA

- Contract: [`qa/memory_agent.md`](../qa/memory_agent.md)
- Script: `.venv/bin/python qa/memory_qa.py`
- Focus: Qdrant health, Mem0 write/retrieval, prompt context, feedback persistence,
  and LangGraph approval checkpoints.

## 4. Integration QA

- Contract: [`qa/integration_agent.md`](../qa/integration_agent.md)
- Focus: Library stems, Use as Inspiration, and regression across Text to Song,
  Cover Studio, ABC, SSE recovery, and Library actions.

## Reports

All agents write under `qa/reports/`:

- `latest.json` — gate score and categories
- `evidence.json` — raw checks
- `audio_quality.json` — sound metrics
- `integration_findings.md` — integration observations
- screenshots and generated fixtures

`qa/reports/` is gitignored; it is local evidence, not source.
