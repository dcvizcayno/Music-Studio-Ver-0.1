import React, { useState } from 'react';
import { Sparkles, Dices, Music, Sliders, Lock, Unlock, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { Preset } from '../types';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';

interface TextToSongTabProps {
  presets: Preset[];
  onDraftLyrics: (params: {
    idea: string;
    title?: string;
    genre?: string;
    vocal_style?: string;
    tempo?: string;
  }) => Promise<{
    title: string;
    lyrics: string;
    style_tags: string;
    writing_note: string;
    banned_words_found: string[];
    has_em_dash: boolean;
  }>;
  onGenerateSong: (params: {
    title: string;
    idea?: string;
    lyrics: string;
    style_tags: string;
    seed?: number;
    steps: number;
    cfg: number;
    duration_seconds: number;
    precision: string;
  }) => Promise<void>;
  isDrafting: boolean;
  isGenerating: boolean;
  completedAudioUrl?: string;
  lastGeneratedTitle?: string;
  lastJobSnapshot?: any;
}

const BANNED_WORDS = ['narrator', 'delve', 'tapestry', 'foster'];

export const TextToSongTab: React.FC<TextToSongTabProps> = ({
  presets,
  onDraftLyrics,
  onGenerateSong,
  isDrafting,
  isGenerating,
  completedAudioUrl,
  lastGeneratedTitle,
  lastJobSnapshot
}) => {
  // Encoder Form State
  const [idea, setIdea] = useState(
    'A quiet late-night realization after leaving an old apartment, finding freedom in an empty room.'
  );
  const [songTitle, setSongTitle] = useState('Salt on the Sill');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('acoustic');
  const [language, setLanguage] = useState('English');

  // Drafted / Editable Content
  const [lyrics, setLyrics] = useState(
    `[verse]\nA cracked ceramic mug sits cold upon the sill\nThe kitchen clock counts seconds that the shadows cannot fill\nI keep your jacket hanging where the morning catches light\nNot waiting for your footsteps, just remembering the night\n\n[chorus]\nThere is salt on the sill where the winter broke through\nA quiet kind of peace that came after you\nI do not want the storm back, I do not want the rain\nJust this still golden hour where I learned my own name\n\n[verse 2]\nThe tea kettle rattles on the copper heating ring\nA postcard from October with a message paper-thin\nI walked across the river bridge before the frost took hold\nLearning how an empty room can feel like quiet gold\n\n[chorus]\nThere is salt on the sill where the winter broke through\nA quiet kind of peace that came after you\nI do not want the storm back, I do not want the rain\nJust this still golden hour where I learned my own name\n\n[bridge]\nIt started with wondering if fences ever mend\nThen fighting every shadow like a stranger or a friend\nNow the iron latch is resting and the doorway opens wide\nNothing left to prove and nowhere left to hide\n\n[outro]\nSalt on the sill\nThe quiet settles in\nThe morning begins`
  );
  const [styleTags, setStyleTags] = useState('indie folk, acoustic guitar, upright bass, warm room, intimate male vocal, 82 bpm');
  const [writingNote, setWritingNote] = useState(
    'Anchored the narrative around the tangible tactile image of a cracked mug and winter salt on the sill. The emotional arc transitions from quiet reflection to realization and peaceful acceptance without forced drama.'
  );
  const [isPromptLocked, setIsPromptLocked] = useState(false);

  // Decoder / Sampler Settings
  const [seed, setSeed] = useState<number>(42891);
  const [steps, setSteps] = useState<number>(50);
  const [cfg, setCfg] = useState<number>(3.0);
  const [durationSeconds, setDurationSeconds] = useState<number>(75);
  const [precision, setPrecision] = useState<string>('bf16');

  // Lyric Style Guide Validation
  const charCount = lyrics.length;
  const hasEmDash = lyrics.includes('—');
  const detectedBannedWords = BANNED_WORDS.filter((word) =>
    new RegExp(`\\b${word}\\b`, 'i').test(lyrics)
  );
  const isStyleGuideCompliant = charCount <= 3000 && !hasEmDash && detectedBannedWords.length === 0;

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const p = presets.find((item) => item.id === presetId);
    if (!p) return;
    setStyleTags(`${p.genre}, ${p.instruments}, ${p.mood}, ${p.vocal_type}, ${p.tempo_bpm} bpm`);
    setSteps(p.steps);
    setCfg(p.cfg);
    setDurationSeconds(p.duration_seconds);
  };

  const handleDraft = async () => {
    if (!idea.trim() || isPromptLocked) return;
    const p = presets.find((item) => item.id === selectedPresetId);
    const result = await onDraftLyrics({
      idea,
      title: songTitle,
      genre: p?.genre || 'indie folk',
      vocal_style: p?.vocal_type,
      tempo: p ? `${p.tempo_bpm} bpm` : 'moderate'
    });
    if (result) {
      setSongTitle(result.title);
      setLyrics(result.lyrics);
      setStyleTags(result.style_tags);
      setWritingNote(result.writing_note);
    }
  };

  const handleGenerate = () => {
    onGenerateSong({
      title: songTitle || 'Untitled Song',
      idea,
      lyrics,
      style_tags: styleTags,
      seed,
      steps,
      cfg,
      duration_seconds: durationSeconds,
      precision
    });
  };

  return (
    <div className="space-y-8">
      {/* Top Split: Prompt Encoder (Left) & Generation Decoder (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 cols): Prompt Encoder & Lyrics */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-100">01. Prompt Encoder (Qwen LLM)</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Translates your story premise into structured style tags and evocative human lyrics.
                </p>
              </div>

              {/* Preset Segmented Selector */}
              <div className="flex items-center gap-1 p-1 bg-neutral-950 border border-neutral-800 rounded-lg">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      selectedPresetId === preset.id
                        ? 'bg-neutral-800 text-amber-300 shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Idea & Working Title */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Song Premise / Emotional Idea
                </label>
                <textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  disabled={isPromptLocked}
                  rows={2}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  placeholder="Describe what the song is about and what it felt like..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Working Title</label>
                  <input
                    type="text"
                    value={songTitle}
                    onChange={(e) => setSongTitle(e.target.value)}
                    disabled={isPromptLocked}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                    placeholder="e.g. Salt on the Sill"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={isPromptLocked}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500 disabled:opacity-50 cursor-pointer"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="Japanese">Japanese</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Draft Lyrics Button */}
            <div className="flex items-center justify-between border-t border-neutral-800/80 pt-4">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <span>Lyric Style Guide Active</span>
                <span aria-hidden="true">·</span>
                <span>Story first, no em dashes, no banned words</span>
              </div>

              <button
                onClick={handleDraft}
                disabled={isDrafting || isPromptLocked || !idea.trim()}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isDrafting ? 'animate-spin' : ''}`} />
                <span>{isDrafting ? 'Drafting with Qwen...' : 'Draft Lyrics with Qwen'}</span>
              </button>
            </div>
          </div>

          {/* Lyrics and Style Tags Editor */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-semibold text-neutral-100">Lyrics & Style Conditioning</h4>
                <button
                  onClick={() => setIsPromptLocked(!isPromptLocked)}
                  className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border transition-colors ${
                    isPromptLocked
                      ? 'border-amber-500/40 text-amber-300 bg-amber-950/20'
                      : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title={isPromptLocked ? 'Unlock for editing' : 'Lock to prevent accidental edits'}
                >
                  {isPromptLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  <span>{isPromptLocked ? 'Locked' : 'Unlocked'}</span>
                </button>
              </div>

              {/* Style Guide Checker Status */}
              <div className="flex items-center gap-2 text-xs">
                {isStyleGuideCompliant ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Style Guide Pass</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Style Guide Alert</span>
                  </span>
                )}
                <span className="text-neutral-500">·</span>
                <span className="font-mono tabular-nums text-neutral-400">{charCount} / 3000 chars</span>
              </div>
            </div>

            {/* Validation Alerts */}
            {hasEmDash && (
              <p className="text-xs text-red-400 mb-2">
                Warning: Contains em dash (—). Replace with commas or line breaks per Lyric Style Guide.
              </p>
            )}
            {detectedBannedWords.length > 0 && (
              <p className="text-xs text-red-400 mb-2">
                Warning: Contains banned word(s): {detectedBannedWords.join(', ')}. Replace with natural phrasing.
              </p>
            )}

            {/* Style Tags Input */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Style Tags (Genre, Instruments, Mood, Vocal Style, Tempo)
              </label>
              <input
                type="text"
                value={styleTags}
                onChange={(e) => setStyleTags(e.target.value)}
                disabled={isPromptLocked}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                placeholder="e.g. indie folk, acoustic guitar, intimate male vocal, 85 bpm"
              />
            </div>

            {/* Lyrics Textarea */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Lyrics (with [verse], [chorus], [bridge] markers)
              </label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                disabled={isPromptLocked}
                rows={12}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-neutral-200 leading-relaxed focus:outline-none focus:border-amber-500 disabled:opacity-50"
              />
            </div>

            {/* Creative Writing Decision Note */}
            {writingNote && (
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-3 text-xs text-neutral-400">
                <div className="flex items-center gap-1.5 text-neutral-300 font-medium mb-1">
                  <Info className="w-3.5 h-3.5 text-amber-400" />
                  <span>Qwen Writing Decisions Note</span>
                </div>
                <p className="leading-relaxed">{writingNote}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Decoder Settings & Generation CTA */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="text-base font-semibold text-neutral-100 mb-1">02. YuE2 Music Decoder Settings</h3>
            <p className="text-xs text-neutral-400 mb-5">
              Parameters matched directly to ComfyUI YuE2Sampler execution graph.
            </p>

            <div className="space-y-4">
              {/* Seed */}
              <div>
                <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                  <label className="font-medium">Seed</label>
                  <button
                    onClick={() => setSeed(Math.floor(Math.random() * 900000000) + 100000)}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Randomize</span>
                  </button>
                </div>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Steps Slider */}
              <div>
                <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                  <label className="font-medium">Inference Steps</label>
                  <span className="font-mono tabular-nums text-neutral-400">{steps} steps</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="5"
                  value={steps}
                  onChange={(e) => setSteps(parseInt(e.target.value))}
                  className="w-full accent-amber-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-neutral-500 mt-1 font-mono">
                  <span>Fast (25)</span>
                  <span>Balanced (50)</span>
                  <span>Detailed (80)</span>
                </div>
              </div>

              {/* CFG Scale */}
              <div>
                <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                  <label className="font-medium">Guidance Scale (CFG)</label>
                  <span className="font-mono tabular-nums text-neutral-400">{cfg.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="7.0"
                  step="0.2"
                  value={cfg}
                  onChange={(e) => setCfg(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>

              {/* Duration Slider */}
              <div>
                <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                  <label className="font-medium">Target Duration</label>
                  <span className="font-mono tabular-nums text-neutral-400">{durationSeconds} seconds</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="180"
                  step="15"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(parseInt(e.target.value))}
                  className="w-full accent-amber-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>

              {/* Precision */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Precision / Quantization</label>
                <select
                  value={precision}
                  onChange={(e) => setPrecision(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="bf16">bf16 — Bfloat16 (Standard Apple Silicon MPS)</option>
                  <option value="fp16">fp16 — Float16 (Half precision)</option>
                  <option value="fp32">fp32 — Float32 (High memory)</option>
                </select>
              </div>
            </div>

            {/* Memory Interlock Assurance */}
            <div className="bg-neutral-950/80 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-400 mt-5 space-y-1">
              <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                <span>Memory Interlock Active</span>
              </div>
              <p>
                Prior to generation, Qwen will be unloaded from Ollama to ensure the full ~16GB GPU memory pool is available to YuE2 in ComfyUI.
              </p>
            </div>

            {/* Generate Song CTA Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !lyrics.trim() || !styleTags.trim()}
              className="w-full mt-5 py-3 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Music className={`w-4 h-4 ${isGenerating ? 'animate-bounce' : ''}`} />
              <span>{isGenerating ? 'Synthesizing Full Song...' : 'Generate Full Song in ComfyUI'}</span>
            </button>
          </div>

          {/* Master Audio Playback Result */}
          {completedAudioUrl && (
            <div>
              <h4 className="text-sm font-semibold text-neutral-200 mb-2">Latest Master Audio Artifact</h4>
              <AudioWaveformPlayer
                audioUrl={completedAudioUrl}
                title={lastGeneratedTitle || songTitle}
                settingsSnapshot={lastJobSnapshot}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
