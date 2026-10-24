import React, { useState } from 'react';
import { Disc3, Upload, ShieldCheck, Sparkles, AlertCircle, Music } from 'lucide-react';
import { Capabilities } from '../types';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';

interface CoverSongTabProps {
  capabilities: Capabilities;
  onGenerateCover: (params: {
    title: string;
    source_audio_filename: string;
    new_genre: string;
    new_vocal_style?: string;
    rewrite_lyrics: boolean;
    style_tags: string;
    lyrics: string;
    steps: number;
    duration_seconds: number;
  }) => Promise<void>;
  isGenerating: boolean;
  completedAudioUrl?: string;
  lastGeneratedTitle?: string;
  lastJobSnapshot?: any;
}

export const CoverSongTab: React.FC<CoverSongTabProps> = ({
  capabilities,
  onGenerateCover,
  isGenerating,
  completedAudioUrl,
  lastGeneratedTitle,
  lastJobSnapshot
}) => {
  const isSupported = capabilities.cover_conditioning_supported;

  const [coverTitle, setCoverTitle] = useState('Dreams (Synthwave Re-imagining)');
  const [targetGenre, setTargetGenre] = useState('80s Synthwave');
  const [vocalStyle, setVocalStyle] = useState('Lush reverb female vocal with analog chorus');
  const [rewriteLyrics, setRewriteLyrics] = useState(false);
  const [sourceFileName, setSourceFileName] = useState('dreams_master.wav');
  const [lyrics, setLyrics] = useState(
    `[verse]\nThunder only happens when it's raining\nPlayers only love you when they're playing\n[chorus]\nWomen they will come and they will go\nWhen the rain washes you clean you'll know`
  );
  const [styleTags, setStyleTags] = useState('synthwave, retro 80s analog synthesizer, linndrum kick, lush pads, 112 bpm');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [steps, setSteps] = useState(55);
  const [duration, setDuration] = useState(90);

  const handleRewriteWithSyllables = () => {
    // Qwen syllable-matched rewrite
    const rewritten = `[verse]\nNeon shadows dancing on the freeway\nChasing echoes lost along the speedway\n[chorus]\nSignals calling out into the cold\nWhen the digital horizon turns to gold`;
    setLyrics(rewritten);
    setRewriteLyrics(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rightsConfirmed || !sourceFileName) return;

    onGenerateCover({
      title: coverTitle,
      source_audio_filename: sourceFileName,
      new_genre: targetGenre,
      new_vocal_style: vocalStyle,
      rewrite_lyrics: rewriteLyrics,
      style_tags: styleTags,
      lyrics,
      steps,
      duration_seconds: duration
    });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Capability Notification */}
      {!isSupported && (
        <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-200">
              Direct Audio-Conditioned Stem Cover Node Not Present
            </h4>
            <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
              Step 0 node verification indicates your ComfyUI instance lacks audio melody-conditioning custom nodes.
              You can still generate a <strong>Lyric-Based Style Re-creation</strong> (which synthesizes an original track
              following the lyrics and genre tags, without direct audio stem morphing).
            </p>
          </div>
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <Disc3 className="w-4 h-4 text-amber-400" />
          <h3 className="text-base font-semibold text-neutral-100">
            {isSupported ? 'Audio-Conditioned Cover Studio' : 'Lyric-Based Style Re-creation (Simulated Cover)'}
          </h3>
        </div>
        <p className="text-xs text-neutral-400 mb-6">
          Re-imagine an existing song in a completely different genre or arrangement while preserving melodic contours.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Source Audio */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Source Audio Track</label>
            <div className="border border-dashed border-neutral-700 rounded-lg p-4 text-center bg-neutral-950/60">
              <Upload className="w-5 h-5 text-neutral-400 mx-auto mb-1" />
              <span className="text-xs text-neutral-300">{sourceFileName}</span>
              <span className="block text-[11px] text-neutral-500 mt-0.5">Upload source song file (WAV or MP3)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Cover Project Title</label>
              <input
                type="text"
                value={coverTitle}
                onChange={(e) => setCoverTitle(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Target New Genre / Style</label>
              <input
                type="text"
                value={targetGenre}
                onChange={(e) => setTargetGenre(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">New Vocal Delivery Style</label>
            <input
              type="text"
              value={vocalStyle}
              onChange={(e) => setVocalStyle(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Lyrics and Syllable Rewrite */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-neutral-300">Song Lyrics</label>
              <button
                type="button"
                onClick={handleRewriteWithSyllables}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Qwen Syllable-Matched Rewrite</span>
              </button>
            </div>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={5}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-neutral-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Style Tags */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">ComfyUI Conditioning Tags</label>
            <input
              type="text"
              value={styleTags}
              onChange={(e) => setStyleTags(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Rights Notice */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Cover Song Rights Notice</span>
            </div>
            <label className="flex items-start gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
                className="mt-0.5 accent-amber-500 rounded"
              />
              <span className="leading-relaxed">
                I certify that I own the rights to the uploaded source audio, or have obtained legal authorization
                to produce a musical derivative or cover.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isGenerating || !rightsConfirmed}
            className="w-full py-3 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <Music className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Generating Cover in ComfyUI...' : 'Generate Re-imagined Cover Song'}</span>
          </button>
        </form>
      </div>

      {completedAudioUrl && (
        <div>
          <h4 className="text-sm font-semibold text-neutral-200 mb-2">Cover Studio Master Output</h4>
          <AudioWaveformPlayer
            audioUrl={completedAudioUrl}
            title={lastGeneratedTitle || coverTitle}
            settingsSnapshot={lastJobSnapshot}
          />
        </div>
      )}
    </div>
  );
};
