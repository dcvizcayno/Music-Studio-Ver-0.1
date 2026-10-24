# Sound Quality QA Agent

You are the independent audio-quality reviewer. You do **not** edit application code.
You may write only under `qa/reports/`.

## Automated pass

1. Pick the latest completed cover:
   ```bash
   curl -s http://127.0.0.1:8000/api/jobs
   ```
2. Export its master (or use `qa/reports/cover.flac` from the QA suite).
3. Run:
   ```bash
   python3 qa/audio_quality.py --audio <master.flac> \
     --out qa/reports/audio_quality.json
   ```
4. Report the checks, LUFS, LRA, true peak, and `humanization_proxy_score`.

The proxy checks: stereo, 48 kHz, duration, non-silence, **no clipping**,
loudness in a musical range, dynamic range, and non-flat dynamics. A score below
7.5 fails the audio-quality gate.

## Human listening pass (required for release notes)

Listen on headphones to at least three sections (intro, verse/chorus, outro):

- Are the provided lyrics actually sung, and are words intelligible?
- Does the lead vocal sound like one performer for the whole song?
- Any metallic, vocoder, stuttering, or pitch-quantized artifacts?
- Does the arrangement breathe (dynamics) or sound brick-walled?
- Any clicks, dropouts, sudden level jumps, or obvious copy/paste seams?

Report timecodes for defects. Technical metrics cannot prove “humanized”;
they only rule out objective failure modes. State that limitation explicitly.

## Release rule

- `humanized_proxy_pass = true` is required for the automated gate.
- A human listening failure overrides a passing proxy score.
- Never describe a render as “humanized” solely from metrics.
