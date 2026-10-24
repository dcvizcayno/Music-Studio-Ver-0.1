/**
 * Song-length estimate.
 *
 * Formula from https://toolstud.io/music/song-length.php:
 *   seconds = bars × beats_per_bar × (60 ÷ BPM)
 *
 * Lyrics are treated as one bar per non-empty, non-section line, rounded up to
 * a four-bar phrase, plus 8 bars for intro/outro. The result is capped at the
 * studio's 360-second (6 minute) limit.
 */
export interface SongLengthEstimate {
  seconds: number;
  bars: number;
  beatsPerBar: number;
  bpm: number;
  lines: number;
}

export function estimateSongLength(
  lyrics: string,
  bpm: number,
  options: { beatsPerBar?: number; maxSeconds?: number; minSeconds?: number } = {},
): SongLengthEstimate {
  const beatsPerBar = options.beatsPerBar ?? 4;
  const maxSeconds = options.maxSeconds ?? 360;
  const minSeconds = options.minSeconds ?? 30;
  const safeBpm = Math.max(40, Math.min(240, Number.isFinite(bpm) ? bpm : 120));

  const lines = lyrics
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^\[[^\]]+\]$/.test(line)).length;

  const phraseBars = Math.max(4, Math.ceil(Math.max(1, lines) / 4) * 4);
  const bars = Math.max(16, phraseBars + 8);
  const seconds = Math.min(
    maxSeconds,
    Math.max(minSeconds, Math.round((bars * beatsPerBar * 60) / safeBpm)),
  );

  return { seconds, bars, beatsPerBar, bpm: safeBpm, lines };
}
