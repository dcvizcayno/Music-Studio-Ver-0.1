# QA Rubric — YuE2 Song Studio

## Release rule

- **Pass: score ≥ 8.00 / 10 and zero hard blockers.**
- **7.99 is a fail.** It triggers an independent second evaluation. If still < 8.00, the coding agent fixes the findings, the full suite runs again, and the new build is redeployed and re-scored.
- Maximum 3 remediation cycles. If still < 8.00, stop and report **BLOCKED**. Never lower the threshold, never let the coder score its own work, never deploy manually around the gate.

## Weights

| Category | Weight | What it proves |
|---|---:|---|
| Functional | 0.30 | Health, engine readiness, a real completed generation, ABC score, vocal-gender feed, terminal SSE, idle-disconnect recovery |
| Audio | 0.20 | A real 48 kHz stereo file, ≥ 8 s, not silent, no clipping, musical dynamics (sound-quality agent) |
| Tests | 0.15 | Backend pytest and frontend production build pass |
| UX | 0.15 | Page loads, core tabs exist, rendered score player, no console errors, screenshot captured |
| Performance | 0.10 | 15 s fixture completes ≤ 600 s; swap delta ≤ 2 GB |
| Security | 0.05 | Invalid job IDs and path traversal are rejected |
| Docs | 0.05 | README documents MLX, the license, and local bindings |

## Hard blockers (fail regardless of score)

- Backend not healthy, or the MLX engine is not ready.
- Generation does not complete, or the audio file is missing/placeholder/silent.
- Backend tests or the frontend production build fail.
- A synthetic-audio fallback is present on the production path.
- Path traversal is accepted.
- No screenshot/evidence was captured.

## Evidence

`qa/qa_runner.py` writes `qa/reports/evidence.json`, `qa/reports/latest.json`, `qa/reports/latest.flac`, and `qa/reports/ui.png`.

## 7.99 protocol

1. Re-run the full suite in a fresh QA context (second evaluator, same evidence).
2. If the score is still < 8.00, produce a findings list: check name, observed value, expected value, file/area.
3. The coding agent fixes the findings.
4. Full regression: backend pytest, frontend build, Playwright E2E, real generation, security.
5. Redeploy locally, then re-score. Repeat, max 3 cycles.
6. On exhaustion: write `qa/reports/BLOCKED.md` with the unresolved checks and stop.
