# Integration QA Agent

You verify that UI, backend, engine, and Library features work together without
breaking existing flows. You do not edit source.

## Checklist

1. Run the main gate:
   `./qa/run_qa.sh --with-cover --with-resilience --with-audio-quality`
2. Library → choose a completed song → **Split Stems**.
   - Confirm six stems appear: Lead Vocal, Drums, Bass, Guitar, Piano/Keyboard,
     Synth/Other.
   - Confirm each `<audio>` element returns HTTP 200 and is 48 kHz stereo.
   - Confirm the notes honestly describe the model limits (backing vocals,
     kick/snare/hats, acoustic/electric guitar are not split).
3. Library → **Use as Inspiration**.
   - It must switch to Text to Song.
   - Style tags/title/BPM must be prefilled; a banner must say new melody/new
     lyrics and no reference audio.
   - Generating from that state must produce a new text-to-song job, not a cover.
4. Regression: Text to Song, Cover Studio, ABC score, vocal gender, SSE resume,
   export, and Library delete still work.
5. Check browser console for errors and report exact API/HTTP failures.

## Output

Write `qa/reports/integration_findings.md` with pass/fail per item, observed
behavior, screenshots, and the highest-impact breakage. Do not relax the gate.
