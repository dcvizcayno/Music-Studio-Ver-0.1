# Third-party notices

The application code is licensed under the MIT License in [LICENSE](LICENSE).
The following components, models, and assets have their own terms.

## Vendored in this repository

### abcjs 6.7.0

- Files: `frontend/public/vendor/abcjs-basic-min.js`,
  `frontend/public/vendor/abcjs-audio.css`
- Copyright © 2009–2026 Paul Rosen and Gregory Dyke
- License: MIT
- License text: `frontend/public/vendor/abcjs.LICENSE`
- Source: https://github.com/paulrosen/abcjs

### FluidR3_GM piano samples

- Files: `frontend/public/vendor/soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/`
- Source SoundFont: FluidR3 GM by Frank Wen
- Conversion/source layout: https://github.com/gleitz/midi-js-soundfonts
  (`FluidR3_GM`, generated from `FluidR3_GM.sf2`)
- License: **Creative Commons Attribution 3.0** (CC BY 3.0)
- License: https://creativecommons.org/licenses/by/3.0/
- Attribution: FluidR3 GM SoundFont by Frank Wen; converted samples from
  `midi-js-soundfonts`; local copy used for the interactive ABC score.
- The samples are redistributed here under CC BY 3.0 with the attribution above.

## External engines and models (not redistributed)

### mlx-Yue

- Repository: https://github.com/vanch007/mlx-Yue
- License: Apache-2.0
- Not included in this repository; installed by the setup instructions.

### YuE2-3B / YuE2-Vae

- Repository: https://huggingface.co/m-a-p/YuE2-3B
- License: **CC BY-NC 4.0 with additional creator permission**
- Not included in this repository; download separately after accepting the model
  terms. Personal creators may use and monetize outputs; companies need a
  commercial license from the YuE2 authors.

### demucs-onnx and htdemucs_6s

- Package: https://github.com/StemSplit/demucs-onnx (MIT)
- Model: https://huggingface.co/StemSplitio/htdemucs-6s-onnx (MIT per model card)
- Not included in this repository; downloaded on first stem split.

### Basic Pitch ONNX model

- Model: https://huggingface.co/AEmotionStudio/basic-pitch-onnx-models
- Upstream: https://github.com/spotify/basic-pitch
- License: Apache-2.0
- Not included in this repository; downloaded for Library MIDI.

### librosa / pretty_midi

- librosa: ISC
- pretty_midi: MIT
- Installed from `requirements-midi.txt`; not vendored.

### Fonts

The UI uses the macOS/system font stack. No Google Fonts files are bundled or
requested at runtime.

### Mnemosyne dependencies

- Qdrant: Apache-2.0 (native binary, not vendored in git)
- Mem0: Apache-2.0
- nomic-embed-text: model license from its Ollama distribution
- LangGraph: MIT
- SQLite checkpointing: standard Python/sqlite

### Qwen via Ollama

- Optional lyric-drafting models are downloaded separately through Ollama and
  remain subject to their own model licenses.

## Runtime dependencies

The Python and Node dependencies are not vendored in the repository. They are
installed from `requirements.txt`, `frontend/package.json`, and `qa/package.json`
and remain under their respective licenses (for example FastAPI/MIT,
React/MIT, Vite/MIT, Playwright/Apache-2.0).
