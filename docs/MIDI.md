# Library MIDI from stems

After **Split Stems**, open a Library song and choose **Create MIDI**. MIDI is
generated per separated stem and downloaded as a Standard MIDI File.

## Methods

| Stem | Method |
|---|---|
| Lead Vocal | Basic Pitch ONNX (polyphonic, pitch bends) |
| Bass | Basic Pitch ONNX |
| Guitar | Basic Pitch ONNX |
| Piano / Keyboard | Basic Pitch ONNX |
| Synth / Other | Basic Pitch ONNX |
| Drums | onset detection + spectral-band kick/snare/hi-hat map |

Pitched stems use Spotify's
[Basic Pitch](https://github.com/spotify/basic-pitch) ICASSP 2022 model,
converted to ONNX and run with ONNX Runtime. The 225 KB `nmp.onnx` model is
Apache-2.0 and requires no TensorFlow.

The drum track is heuristic: onsets from librosa, then low/mid/high spectral
energy mapped to General MIDI kick (36), snare (38), and closed hi-hat (42).
It is intentionally not a full drum transcription model.

## Accuracy and limitations

- MIDI is an **estimate of the separated stem**, not of the original master.
- Stem bleed (for example, piano leaking into vocals) can produce extra notes.
- Basic Pitch can merge or split fast notes; pitch bends are approximate.
- The drum map only emits kick/snare/closed hi-hat; no toms, open hi-hat, ride,
  or cymbal crashes.
- Reverb/effects can create spurious onsets or sustained notes.

For the cleanest MIDI, start with a well-separated stem and edit the result in a
DAW. The UI shows note counts and the method used for each stem.

## Install

The model and Python extras are optional because Basic Pitch normally pulls in
TensorFlow. This project uses the ONNX path instead:

```bash
# from the repo root
uv pip install --no-deps basic-pitch==0.4.0
uv pip install -r requirements-midi.txt

mkdir -p ../models/basic-pitch
curl -L https://huggingface.co/AEmotionStudio/basic-pitch-onnx-models/resolve/main/nmp.onnx \
  -o ../models/basic-pitch/nmp.onnx
```

`BASIC_PITCH_MODEL` defaults to
`<workspace>/models/basic-pitch/nmp.onnx`.

## API

```http
POST /api/jobs/{job_id}/midi          # start (requires completed stems)
GET  /api/jobs/{job_id}/midi          # status + per-stem note counts
GET  /api/jobs/{job_id}/midi/{stem}.mid
```

`stem` is one of `vocals`, `drums`, `bass`, `guitar`, `piano`, `other`.
Results are cached in `outputs/{job_id}/midi/`.

## License

Basic Pitch is Apache-2.0. The model mirror is Apache-2.0. librosa is ISC,
pretty_midi is MIT. See `THIRD_PARTY_NOTICES.md`.
