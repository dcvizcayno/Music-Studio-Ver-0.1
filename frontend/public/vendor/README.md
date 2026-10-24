# Vendored score renderer

- `abcjs-basic-min.js` and `abcjs-audio.css` — abcjs v6.7.0, MIT license.
  See `abcjs.LICENSE`. Source: https://github.com/paulrosen/abcjs
- `soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/` — FluidR3 GM piano
  samples in the midi-js-soundfonts layout, used by abcjs for score playback.
  These are the same local sample layout used by the YuE2 demo page
  (https://map-yue2.github.io).

Vendored so the score and playback work offline; no CDN request is made at runtime.
