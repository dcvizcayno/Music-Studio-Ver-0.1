# Voice Personas — assessment and integration plan

## Short answer

**YuE2 cannot use a recorded voice sample.** It has no speaker embedding, no
reference-audio input, and no voice-cloning condition. Adding an upload box that
claims otherwise would be misleading.

Covers preserve the **melody** of a reference and re-sing it in a style described
in text; they do not copy the reference singer's timbre.

## Applicable open-source route

A real sample-based voice persona needs a **separate voice-conversion stage**, not
YuE2. The applicable project is:

- [Seed-VC](https://github.com/Plachtaa/seed-vc) — zero-shot voice conversion and
  **singing voice conversion**, with documented Apple Silicon setup
  (`requirements-mac.txt`). Several checkpoints are available; the 200M
  singing-VC model is the relevant one.

### Proposed pipeline

```text
completed song
  → stem split (already implemented)
  → Lead Vocal stem
  → Seed-VC singing voice conversion with a 1–30 s reference voice
  → remix converted vocal + drums + bass + guitar + piano + other
  → master limiter
```

### Why it is not in v0.1

- Separate Python/torch environment and checkpoint (hundreds of MB).
- Singing-VC inference on a 3-minute song is substantially slower than stem
  separation.
- Voice cloning requires explicit consent and a rights gate; the voice sample
  must belong to the uploader or have documented permission.
- Quality varies with the reference; it can introduce robotic artifacts, so it
  needs its own sound-QA pass.

### If approved

1. Create `engines/seed-vc` with Python 3.10/3.12 and the Mac requirements.
2. Add a `voice_profiles` upload flow (1–30 s, consent required).
3. Add `POST /api/jobs/{id}/voice` that converts the lead stem and remixes.
4. Add a Library “Apply Voice Persona” action after stems exist.
5. Gate it behind the Sound QA agent and a human listening check.

Until then, vocal character is controlled with the text style prompt and the
Vocal Gender selector.
