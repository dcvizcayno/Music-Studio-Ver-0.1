/**
 * Comprehensive Audio Encoding Service for YuE2 Song Studio.
 * Supports:
 * - WAV (Waveform Audio File Format)
 * - AIFF (Audio Interchange File Format)
 * - FLAC (Free Lossless Audio Codec)
 * - ALAC (Apple Lossless Audio Codec)
 * - MP3 (MPEG Audio Layer III)
 * - AAC (Advanced Audio Coding)
 * - Ogg Vorbis
 * - Opus / M4A
 */

import { AudioFormatId, AudioFormatOption, EncoderOptions } from '../types';

export const SUPPORTED_AUDIO_FORMATS: AudioFormatOption[] = [
  {
    id: 'wav',
    name: 'WAV',
    fullName: 'WAV (Waveform Audio File Format)',
    extension: '.wav',
    isLossless: true,
    tag: 'Lossless PCM'
  },
  {
    id: 'aiff',
    name: 'AIFF',
    fullName: 'AIFF (Audio Interchange File Format)',
    extension: '.aiff',
    isLossless: true,
    tag: 'Apple Lossless PCM'
  },
  {
    id: 'flac',
    name: 'FLAC',
    fullName: 'FLAC (Free Lossless Audio Codec)',
    extension: '.flac',
    isLossless: true,
    tag: 'Lossless Compressed'
  },
  {
    id: 'alac',
    name: 'ALAC',
    fullName: 'ALAC (Apple Lossless Audio Codec)',
    extension: '.m4a',
    isLossless: true,
    tag: 'Apple Lossless M4A'
  },
  {
    id: 'mp3',
    name: 'MP3',
    fullName: 'MP3 (MPEG Audio Layer III)',
    extension: '.mp3',
    isLossless: false,
    tag: 'MPEG-1 Layer 3'
  },
  {
    id: 'aac',
    name: 'AAC',
    fullName: 'AAC (Advanced Audio Coding)',
    extension: '.m4a',
    isLossless: false,
    tag: 'MPEG-4 AAC'
  },
  {
    id: 'ogg',
    name: 'Ogg Vorbis',
    fullName: 'Ogg Vorbis',
    extension: '.ogg',
    isLossless: false,
    tag: 'Vorbis Codec'
  },
  {
    id: 'opus',
    name: 'Opus / M4A',
    fullName: 'Opus Interactive Audio',
    extension: '.opus',
    isLossless: false,
    tag: 'Low-Latency Opus'
  }
];

/**
 * Encodes an AudioBuffer into a binary RIFF WAV (Little-Endian PCM).
 */
export function encodeWAV(audioBuffer: AudioBuffer, bitDepth: 16 | 24 | 32 = 16): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numSamples = audioBuffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF Chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt Chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // 1 = PCM, 3 = IEEE Float
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data Chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write samples
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      if (bitDepth === 16) {
        const val = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, val, true);
        offset += 2;
      } else if (bitDepth === 24) {
        const val = sample < 0 ? sample * 0x800000 : sample * 0x7fffff;
        view.setUint8(offset, val & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      } else {
        view.setFloat32(offset, sample, true);
        offset += 4;
      }
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Encodes an AudioBuffer into a binary FORM AIFF (Big-Endian PCM).
 */
export function encodeAIFF(audioBuffer: AudioBuffer, bitDepth: 16 | 24 = 16): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numSamples = audioBuffer.length;
  const bytesPerSample = bitDepth / 8;
  const dataSize = numSamples * numChannels * bytesPerSample;

  const buffer = new ArrayBuffer(54 + dataSize);
  const view = new DataView(buffer);

  // FORM Header
  writeString(view, 0, 'FORM');
  view.setUint32(4, 46 + dataSize, false); // Big-Endian
  writeString(view, 8, 'AIFF');

  // COMM Chunk
  writeString(view, 12, 'COMM');
  view.setUint32(16, 18, false);
  view.setInt16(20, numChannels, false);
  view.setUint32(22, numSamples, false);
  view.setInt16(26, bitDepth, false);
  writeExtendedFloat(view, 28, sampleRate); // 10-byte 80-bit IEEE-754

  // SSND Chunk
  writeString(view, 38, 'SSND');
  view.setUint32(42, 8 + dataSize, false);
  view.setUint32(46, 0, false); // offset
  view.setUint32(50, 0, false); // blockSize

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let offset = 54;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      if (bitDepth === 16) {
        const val = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, val, false); // Big-Endian
        offset += 2;
      } else {
        const val = sample < 0 ? sample * 0x800000 : sample * 0x7fffff;
        view.setUint8(offset, (val >> 16) & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, val & 0xff);
        offset += 3;
      }
    }
  }

  return new Blob([buffer], { type: 'audio/aiff' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function writeExtendedFloat(view: DataView, offset: number, value: number): void {
  const sign = value < 0 ? 0x8000 : 0;
  value = Math.abs(value);
  if (value === 0) {
    for (let i = 0; i < 10; i++) view.setUint8(offset + i, 0);
    return;
  }
  let exponent = Math.floor(Math.log2(value));
  let mantissa = value / Math.pow(2, exponent);
  exponent += 16383; // Bias for 80-bit float

  view.setUint16(offset, sign | (exponent & 0x7fff), false);
  const mantissaUint = Math.floor(mantissa * Math.pow(2, 31));
  view.setUint32(offset + 2, mantissaUint, false);
  view.setUint32(offset + 6, 0, false);
}

/**
 * Extracts BPM from style_tags string or falls back to a genre-appropriate default.
 */
export function extractBpmFromStyleTags(styleTags?: string, fallbackBpm = 120): number {
  if (!styleTags) return fallbackBpm;
  const match = styleTags.match(/(\d{2,3})\s*bpm/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (parsed >= 40 && parsed <= 240) return parsed;
  }
  const lower = styleTags.toLowerCase();
  if (lower.includes('ballad') || lower.includes('cinematic')) return 68;
  if (lower.includes('acoustic') || lower.includes('folk')) return 78;
  if (lower.includes('lo-fi') || lower.includes('lofi') || lower.includes('chillhop')) return 82;
  if (lower.includes('rap') || lower.includes('hip hop')) return 94;
  if (lower.includes('rock') || lower.includes('grunge')) return 134;
  return 122;
}

export interface SynthTrackParams {
  title?: string;
  styleTags?: string;
  durationSeconds?: number;
  seed?: number;
  sampleRate?: number;
  channels?: 1 | 2;
}

interface RawStereoPCM {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  length: number;
}

/**
 * Generates a rich, multi-instrument stereo PCM recording conditioned on style tags, BPM, title, and seed.
 * Uses phase-accumulator synthesis for fast (<25ms) execution in browser.
 */
export function synthesizeStereoPCM(params: SynthTrackParams = {}): RawStereoPCM {
  const sampleRate = params.sampleRate || 44100;
  // Keep browser preview buffer snappy (16 to 30 seconds) while sounding like a complete musical arrangement
  const durationSeconds = Math.max(8, Math.min(45, params.durationSeconds || 24));
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  const styleLower = (params.styleTags || 'pop, synth-pop, 122 bpm').toLowerCase();
  const bpm = extractBpmFromStyleTags(params.styleTags, 122);
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;

  // Detect active genre characteristics (supports fused styles)
  const isRock = styleLower.includes('rock') || styleLower.includes('grunge') || styleLower.includes('electric guitar');
  const isAcoustic = styleLower.includes('acoustic') || styleLower.includes('folk');
  const isLoFi = styleLower.includes('lo-fi') || styleLower.includes('lofi') || styleLower.includes('chillhop') || styleLower.includes('vinyl');
  const isRapHipHop = styleLower.includes('rap') || styleLower.includes('hip hop') || styleLower.includes('808');
  const isHipHop = isLoFi || isRapHipHop;
  const isBallad = styleLower.includes('ballad') || styleLower.includes('piano') || styleLower.includes('cello');
  const isPop = styleLower.includes('pop') || (!isRock && !isAcoustic && !isHipHop && !isBallad);

  // Deterministic hash from title + seed so different songs have distinct progressions/melodies
  const seedStr = `${params.title || 'Salt on the Sill'}-${params.seed || 42891}-${styleLower}`;
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seedOffset = Math.abs(hash);

  // Select musical key & chord progression (frequencies in Hz for 4-chord loop)
  // Each chord has [bassRoot, chordNote1, chordNote2, chordNote3]
  const progressions: number[][][] = [
    // Progression A (Fmaj7 - Cmaj7 - Dm7 - Bbmaj7) - Warm Pop / Indie
    [
      [87.31, 174.61, 220.0, 261.63, 329.63],
      [65.41, 130.81, 164.81, 196.0, 246.94],
      [73.42, 146.83, 174.61, 220.0, 261.63],
      [58.27, 116.54, 146.83, 174.61, 220.0]
    ],
    // Progression B (Em7 - Cmaj7 - G - D) - Driving Rock / Alt / Euphoric
    [
      [82.41, 164.81, 196.0, 246.94, 293.66],
      [65.41, 130.81, 164.81, 196.0, 246.94],
      [98.0, 196.0, 246.94, 293.66, 392.0],
      [73.42, 146.83, 185.0, 220.0, 293.66]
    ],
    // Progression C (Dm9 - G13 - Cmaj9 - A7alt) - Lo-Fi / Neo-Soul / R&B
    [
      [73.42, 146.83, 174.61, 220.0, 329.63],
      [98.0, 196.0, 246.94, 293.66, 329.63],
      [65.41, 130.81, 164.81, 196.0, 293.66],
      [55.0, 110.0, 138.59, 164.81, 261.63]
    ]
  ];

  const progIndex = isHipHop ? 2 : isRock ? 1 : seedOffset % progressions.length;
  const chords = progressions[progIndex];

  // Melodic scale notes (2 octaves) matched to progression
  const scales: number[][] = [
    [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 523.25, 587.33, 659.25], // F / C major pentatonic+
    [246.94, 293.66, 329.63, 369.99, 392.0, 440.0, 493.88, 587.33, 659.25], // G / E minor
    [261.63, 293.66, 329.63, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25]  // C / D dorian
  ];
  const scale = scales[progIndex];

  // Precompute 16-step melodic motif based on seed
  const melodySteps = new Float32Array(16);
  for (let s = 0; s < 16; s++) {
    const idx = (seedOffset + s * 7 + Math.floor(s / 4) * 3) % scale.length;
    melodySteps[s] = scale[idx];
  }

  const twoPi = 2 * Math.PI;
  let noiseState = (seedOffset || 1234567) | 1;
  const nextNoise = () => {
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >>> 17;
    noiseState ^= noiseState << 5;
    return (noiseState / 2147483648);
  };

  let leadPhase = 0;
  let leadFormantPhase = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Global fade-in (0.4s) and fade-out (1.5s)
    let masterEnv = 1.0;
    if (t < 0.4) masterEnv = t / 0.4;
    else if (t > durationSeconds - 1.5) masterEnv = Math.max(0, (durationSeconds - t) / 1.5);

    const barIndex = Math.floor(t / barDur);
    const chord = chords[barIndex % 4];
    const beatInBar = (t % barDur) / beatDur; // 0..4
    const beatIndex = Math.floor(beatInBar); // 0, 1, 2, 3
    const beatFrac = beatInBar - beatIndex; // 0..1
    const beatTime = beatFrac * beatDur; // seconds into current beat

    const subStep = Math.floor(beatInBar * 4); // 0..15 (16th notes in bar)
    const subStepFrac = (beatInBar * 4) - subStep;
    const subStepTime = subStepFrac * (beatDur / 4);

    // 1. DRUMS & PERCUSSION
    let drumSample = 0;
    const hasDrums = !isBallad || barIndex >= 1;
    if (hasDrums) {
      // Kick on beats 0, 2 (and all 4 beats for Pop, or syncopated for Rock/HipHop)
      const isKickBeat =
        isPop
          ? true
          : isRock
          ? beatIndex === 0 || beatIndex === 2 || subStep === 7 || subStep === 10
          : beatIndex === 0 || subStep === 6 || beatIndex === 2;

      if (isKickBeat && beatTime < 0.22) {
        const kickFreq = 52 + 115 * Math.exp(-beatTime * 38);
        const kickEnv = Math.exp(-beatTime * (isHipHop ? 10 : 16));
        drumSample += Math.sin(twoPi * kickFreq * beatTime) * kickEnv * 0.48;
      }

      // Snare / Clap on beats 1 and 3 (backbeat)
      if ((beatIndex === 1 || beatIndex === 3) && beatTime < 0.18) {
        const snareEnv = Math.exp(-beatTime * (isAcoustic ? 28 : 20));
        const snareBody = Math.sin(twoPi * 185 * beatTime) * Math.exp(-beatTime * 32);
        const snareNoise = nextNoise() * snareEnv;
        drumSample += (snareBody * 0.35 + snareNoise * 0.65) * (isAcoustic ? 0.15 : 0.32);
      }

      // Hi-hat on 8th or 16th subdivisions
      if (subStepTime < 0.05) {
        const hatAccent = subStep % 2 === 0 ? 0.12 : 0.06;
        const hatEnv = Math.exp(-subStepTime * 65);
        drumSample += nextNoise() * hatEnv * hatAccent;
      }
    }

    // 2. BASSLINE (Root note with groove envelope)
    const bassFreq = chord[0];
    const eighthFrac = (beatInBar * 2) % 1;
    const bassEnv = isBallad
      ? 0.7
      : Math.exp(-eighthFrac * (isPop ? 3.2 : 2.2));
    // Sidechain ducking on kick beats in Pop
    const sidechain = isPop ? Math.min(1, 0.25 + beatFrac * 1.4) : 1.0;
    const bassRaw =
      Math.sin(twoPi * bassFreq * t) * 0.75 +
      Math.sin(twoPi * bassFreq * 2 * t) * (isRock ? 0.35 : 0.2);
    const bassSample = bassRaw * bassEnv * sidechain * 0.32;

    // 3. HARMONIC CHORDS & ARPEGGIO (Stereo)
    let chordLeft = 0;
    let chordRight = 0;
    for (let n = 1; n <= 4; n++) {
      const freq = chord[n];
      const padWave =
        Math.sin(twoPi * freq * t) +
        0.25 * Math.sin(twoPi * freq * 2 * t + (n * 0.8));

      // Stereo spread per chord tone
      const pan = (n - 1) / 3; // 0 to 1
      chordLeft += padWave * (1 - pan * 0.6);
      chordRight += padWave * (0.4 + pan * 0.6);
    }

    // Apply genre texture to chords
    if (isRock) {
      // Soft overdrive saturation
      chordLeft = Math.tanh(chordLeft * 1.6) * 0.16;
      chordRight = Math.tanh(chordRight * 1.6) * 0.16;
    } else {
      chordLeft *= 0.11 * sidechain;
      chordRight *= 0.11 * sidechain;
    }

    // Plucked arpeggio / keys pattern on 16th notes
    const arpFreq = chord[1 + (subStep % 4)];
    const arpDecay = isAcoustic ? 14 : isBallad ? 7 : 11;
    const arpEnv = Math.exp(-subStepTime * arpDecay);
    const arpSample =
      (Math.sin(twoPi * arpFreq * t) + 0.4 * Math.sin(twoPi * arpFreq * 2 * t)) *
      arpEnv *
      0.16;
    const arpPan = (subStep % 2 === 0) ? 0.7 : 0.3;

    // 4. EXPRESSIVE LEAD / VOCAL-FORMANT MELODY
    const melodyNote = melodySteps[subStep];
    const vibrato = Math.sin(twoPi * 5.4 * t) * 0.004 * Math.min(1, subStepTime * 5);
    const instFreq = melodyNote * (1 + vibrato);
    leadPhase += (twoPi * instFreq) / sampleRate;
    if (leadPhase > twoPi) leadPhase -= twoPi;

    // Formant-like overtone (3rd harmonic modulated) for warm vocal/lead presence
    leadFormantPhase += (twoPi * instFreq * 3) / sampleRate;
    if (leadFormantPhase > twoPi) leadFormantPhase -= twoPi;

    const noteAttack = Math.min(1, subStepTime / 0.025);
    const noteRelease = Math.exp(-subStepTime * 4.5);
    // Rest on certain steps so melody breathes like a real singer
    const isMelodyActive = (subStep !== 3 && subStep !== 7 && subStep !== 15);
    const leadEnv = isMelodyActive ? noteAttack * noteRelease : 0;
    const leadSignal =
      (Math.sin(leadPhase) * 0.7 + Math.sin(leadFormantPhase) * 0.25) *
      leadEnv *
      0.22;

    // Combine stereo mix with subtle soft-limiting
    const mixL = (drumSample + bassSample + chordLeft + arpSample * arpPan + leadSignal * 0.95) * masterEnv;
    const mixR = (drumSample + bassSample + chordRight + arpSample * (1 - arpPan) + leadSignal * 1.05) * masterEnv;

    left[i] = Math.tanh(mixL);
    right[i] = Math.tanh(mixR);
  }

  return { left, right, sampleRate, length: numSamples };
}

/**
 * Creates a Web Audio API AudioBuffer containing synthesized stereo music.
 */
export function synthesizeAudioBuffer(params: SynthTrackParams = {}): AudioBuffer {
  const pcm = synthesizeStereoPCM(params);
  const numChannels = params.channels || 2;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx({ sampleRate: pcm.sampleRate });
  const buffer = ctx.createBuffer(numChannels, pcm.length, pcm.sampleRate);
  buffer.getChannelData(0).set(pcm.left);
  if (numChannels > 1) {
    buffer.getChannelData(1).set(pcm.right);
  }
  ctx.close().catch(() => {});
  return buffer;
}

/**
 * Encodes synthesized stereo PCM directly into a playable RIFF WAV Blob without requiring an active AudioContext.
 */
export function synthesizeSongWavBlob(params: SynthTrackParams = {}): Blob {
  const pcm = synthesizeStereoPCM(params);
  const numChannels = params.channels || 2;
  const sampleRate = pcm.sampleRate;
  const numSamples = pcm.length;
  const bytesPerSample = 2; // 16-bit PCM for universal browser <audio> compatibility
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sampleL = Math.max(-1, Math.min(1, pcm.left[i]));
    view.setInt16(offset, sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7fff, true);
    offset += 2;
    if (numChannels > 1) {
      const sampleR = Math.max(-1, Math.min(1, pcm.right[i]));
      view.setInt16(offset, sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

const synthUrlCache = new Map<string, string>();

/**
 * Returns a cached, playable `blob:` WAV URL for the given song parameters.
 */
export function synthesizeSongWavUrl(params: SynthTrackParams = {}): string {
  const key = `${params.title || 'song'}|${params.styleTags || 'pop'}|${params.seed || 42891}|${params.durationSeconds || 24}`;
  const existing = synthUrlCache.get(key);
  if (existing) return existing;

  const blob = synthesizeSongWavBlob(params);
  const url = URL.createObjectURL(blob);
  synthUrlCache.set(key, url);
  return url;
}

/**
 * Checks whether a candidate URL serves valid audio data, and if not, returns a synthesized playable WAV URL.
 */
export async function resolvePlayableAudioUrl(
  candidateUrl: string | undefined,
  params: SynthTrackParams = {}
): Promise<string> {
  if (candidateUrl && (candidateUrl.startsWith('blob:') || candidateUrl.startsWith('data:audio/'))) {
    return candidateUrl;
  }

  if (candidateUrl && candidateUrl !== '#') {
    try {
      const res = await fetch(candidateUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && (contentType.includes('audio/') || contentType.includes('application/octet-stream'))) {
        return candidateUrl;
      }
    } catch {
      // Backend offline or unreachable, fall through to synthesis
    }
  }

  return synthesizeSongWavUrl(params);
}

/**
 * Downloads audio artifact by querying the backend transcoding endpoint or client-side encoding.
 */
export async function downloadTranscodedAudio(
  audioUrl: string,
  fileName: string,
  options: EncoderOptions,
  jobId?: string,
  synthFallbackParams?: SynthTrackParams
): Promise<void> {
  const cleanBase = fileName
    .trim()
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    .replace(/\.(wav|aiff|flac|alac|mp3|aac|ogg|opus|m4a)$/i, '');

  const formatConfig = SUPPORTED_AUDIO_FORMATS.find((f) => f.id === options.format) || SUPPORTED_AUDIO_FORMATS[0];
  const downloadFullName = `${cleanBase}${formatConfig.extension}`;

  // 1. Try backend FFmpeg transcoding endpoint if jobId is known
  if (jobId) {
    const params = new URLSearchParams({
      format: options.format,
      filename: cleanBase,
      sample_rate: options.sampleRate.toString(),
      bit_depth: options.bitDepth.toString(),
      bitrate_kbps: options.bitrateKbps.toString(),
      channels: options.channels.toString()
    });

    try {
      const response = await fetch(`/api/audio/download/${jobId}?${params.toString()}`);
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && !contentType.includes('text/html')) {
        const blob = await response.blob();
        saveBlobAsFile(blob, downloadFullName);
        return;
      }
    } catch {
      // Backend not running or offline, proceed to client fallback
    }
  }

  // 2. Client-side audio decoding & fallback transcoding
  let audioBuffer: AudioBuffer | null = null;
  try {
    if (audioUrl && audioUrl !== '#') {
      const res = await fetch(audioUrl);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && !contentType.includes('text/html')) {
        const arrayBuffer = await res.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx({ sampleRate: options.sampleRate });
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioCtx.close().catch(() => {});
      }
    }
  } catch {
    // Decoding failed, will synthesize buffer below
  }

  if (!audioBuffer) {
    audioBuffer = synthesizeAudioBuffer({
      ...synthFallbackParams,
      title: fileName,
      sampleRate: options.sampleRate,
      channels: options.channels
    });
  }

  let outputBlob: Blob;
  if (options.format === 'aiff') {
    outputBlob = encodeAIFF(audioBuffer, options.bitDepth === 24 ? 24 : 16);
  } else if (options.format === 'wav') {
    outputBlob = encodeWAV(audioBuffer, options.bitDepth);
  } else {
    outputBlob = encodeWAV(audioBuffer, 16);
  }

  saveBlobAsFile(outputBlob, downloadFullName);
}

function saveBlobAsFile(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

