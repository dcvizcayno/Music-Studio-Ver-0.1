# Vendored score renderer

- `abcjs-basic-min.js` and `abcjs-audio.css` — abcjs v6.7.0, MIT license.
  See `abcjs.LICENSE`. Source: https://github.com/paulrosen/abcjs
- `soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/` — FluidR3 GM piano
  samples in the midi-js-soundfonts layout, used by abcjs for score playback.
  FluidR3 GM by Frank Wen; samples converted by
  https://github.com/gleitz/midi-js-soundfonts; licensed **CC BY 3.0**
  (https://creativecommons.org/licenses/by/3.0/). See
  `soundfonts/FluidR3_GM/LICENSE.md` and the root `THIRD_PARTY_NOTICES.md`.

Vendored so the score and playback work offline; no CDN request is made at runtime.
