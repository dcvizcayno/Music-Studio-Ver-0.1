# Library Stem Splitter

The Library can split any completed Text to Song or Cover Studio render into six
stems. Everything runs locally; no audio leaves the Mac.

## Model

- Engine: [`demucs-onnx`](https://github.com/StemSplit/demucs-onnx) 0.3.4
- Model: `htdemucs_6s` (`StemSplitio/htdemucs-6s-onnx`, 136 MB fp16 weights)
- Runtime: ONNX Runtime, **CPU** provider
- No PyTorch, no CUDA, no CoreML required

CoreML was tested on this Mac and rejected the model graph
(`generic_general_slice` error), so the backend pins the CPU provider. The first
run downloads the model into the workspace Hugging Face cache
(`models/hf-cache`); later runs are offline.

## Output stems

| File | UI label | Contents |
|---|---|---|
| `vocals.wav` | Lead Vocal | Vocal stem; backing vocals may remain |
| `drums.wav` | Drums (full kit) | Whole drum mix |
| `bass.wav` | Bass | Bass |
| `guitar.wav` | Guitar (acoustic + electric) | Combined guitar |
| `piano.wav` | Piano / Keyboard | Piano |
| `other.wav` | Synth / Other | Synths, strings, effects, remaining instruments |

All stems are written as **48 kHz, stereo, 24-bit WAV** and served with individual
players and download links.

## What this model does not split

`htdemucs_6s` is a six-stem model, not an unlimited instrument separator:

- **Background Vocal** is not separated from lead vocals. A dedicated
  lead/backing model (UVR/MVSEP-style) would be required.
- **Kick / snare / hi-hat** are not separated. They remain inside the drum stem;
  a dedicated drum-component model (e.g. drumsep/Magenta) is required.
- **Acoustic vs. electric guitar** is not separated. The guitar stem contains both.
- **Synth vs. other instruments** is combined in `other`.

The UI displays these limitations alongside the stems.

## Performance

Measured on the target M5 Air, 15-second input: **~5.4 seconds** on CPU. A
three-minute render is expected to take roughly a minute, but this is not a
hard guarantee.

## API

```http
POST /api/jobs/{job_id}/stems          # start (202-style status)
GET  /api/jobs/{job_id}/stems          # status + metadata
GET  /api/jobs/{job_id}/stems/{stem}   # vocals|drums|bass|guitar|piano|other
```

Only completed jobs can be split. Results are cached in
`outputs/{job_id}/stems/`; later requests do not re-run separation.

## Troubleshooting

- **First run is slow** — the 136 MB model downloads once.
- **`Operation not permitted` for the HF cache** — the backend must set
  `HF_HOME` to the workspace cache; this is done in `backend/app/services/stems.py`.
- **No stems appear** — check `logs/backend.log`; verify
  `.venv/bin/demucs-onnx` exists and `requirements.txt` was installed.
