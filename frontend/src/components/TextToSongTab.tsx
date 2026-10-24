import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Dices,
  Music,
  Sliders,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle,
  Info,
  Check,
  Layers,
  RotateCcw,
  Gauge
} from 'lucide-react';
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

interface FusedStyleResult {
  combinedGenre: string;
  combinedInstruments: string;
  combinedMood: string;
  combinedVocal: string;
  blendedTempo: number;
  blendedSteps: number;
  blendedCfg: number;
  blendedDuration: number;
  combinedStyleTags: string;
  presetNames: string[];
}

function fuseStyles(selectedIds: string[], presetList: Preset[]): FusedStyleResult {
  const activePresets = presetList.filter((p) => selectedIds.includes(p.id));
  const fallback = presetList.find((p) => p.id === 'pop') || presetList[0];
  const list = activePresets.length > 0 ? activePresets : fallback ? [fallback] : [];

  if (list.length === 0) {
    return {
      combinedGenre: 'pop, synth-pop, upbeat',
      combinedInstruments: 'punchy kick, sub bass, bright synth chords, crisp claps',
      combinedMood: 'euphoric, vibrant, danceable',
      combinedVocal: 'clear modern female lead, doubled chorus, autotune sheen',
      blendedTempo: 122,
      blendedSteps: 50,
      blendedCfg: 3.2,
      blendedDuration: 90,
      combinedStyleTags: 'pop, synth-pop, upbeat, punchy kick, sub bass, bright synth chords, crisp claps, euphoric, vibrant, danceable, clear modern female lead, doubled chorus, autotune sheen, 122 bpm',
      presetNames: ['Modern Pop']
    };
  }

  // Deduplicate helper
  const dedupe = (items: string[]) => Array.from(new Set(items.map((s) => s.trim()))).filter(Boolean);

  const allGenres = dedupe(list.flatMap((p) => p.genre.split(',')));
  const allInstruments = dedupe(list.flatMap((p) => p.instruments.split(',')));
  const allMoods = dedupe(list.flatMap((p) => p.mood.split(',')));
  const allVocals = dedupe(list.flatMap((p) => p.vocal_type.split(',')));

  const blendedTempo = Math.round(list.reduce((sum, p) => sum + p.tempo_bpm, 0) / list.length);
  const blendedSteps = Math.round(list.reduce((sum, p) => sum + p.steps, 0) / list.length);
  const blendedCfg = parseFloat((list.reduce((sum, p) => sum + p.cfg, 0) / list.length).toFixed(1));
  const blendedDuration = Math.round(list.reduce((sum, p) => sum + p.duration_seconds, 0) / list.length);

  const combinedGenre = allGenres.join(', ');
  const combinedInstruments = allInstruments.join(', ');
  const combinedMood = allMoods.join(', ');
  const combinedVocal = allVocals.join(', ');

  const combinedStyleTags = `${combinedGenre}, ${combinedInstruments}, ${combinedMood}, ${combinedVocal}, ${blendedTempo} bpm`.slice(0, 1000);

  return {
    combinedGenre,
    combinedInstruments,
    combinedMood,
    combinedVocal,
    blendedTempo,
    blendedSteps,
    blendedCfg,
    blendedDuration,
    combinedStyleTags,
    presetNames: list.map((p) => p.name)
  };
}

export function getDefaultLyricsTemplate(selectedPresetIds: string[]): {
  formatName: string;
  markers: string[];
  lyrics: string;
} {
  const isHipHop = selectedPresetIds.includes('hiphop');
  const isRock = selectedPresetIds.includes('rock');
  const isPop = selectedPresetIds.includes('pop');

  if (isHipHop) {
    return {
      formatName: 'Rap / Hip Hop / Lo-Fi',
      markers: ['[intro]', '[hook/chorus]', '[verse 1]', '[hook/chorus]', '[verse 2]', '[hook/chorus]', '[outro]'],
      lyrics: (
        "[intro]\n" +
        "Dust on the needle, tape hiss in the headphones\n" +
        "Counting streetlights where the midnight traffic groans\n\n" +
        "[hook/chorus]\n" +
        "Leave the keys on the counter, leave the doubt at the door\n" +
        "Walking through the city like I never did before\n" +
        "Nobody calling, nobody checking in\n" +
        "Where the concrete ends and the quiet begins\n\n" +
        "[verse 1]\n" +
        "Steam rising off a subway grate at two AM\n" +
        "Pocket full of transit tokens, learning who I am\n" +
        "Storefront shutters pulled down tight against the breeze\n" +
        "Finding rhythm in the breathing of the sycamore trees\n\n" +
        "[hook/chorus]\n" +
        "Leave the keys on the counter, leave the doubt at the door\n" +
        "Walking through the city like I never did before\n" +
        "Nobody calling, nobody checking in\n" +
        "Where the concrete ends and the quiet begins\n\n" +
        "[verse 2]\n" +
        "Cold condensation on a diner window pane\n" +
        "Watching headlights smear against the late-fall rain\n" +
        "Every heavy silence turned to room to breathe\n" +
        "Nothing left behind that I was scared to leave\n\n" +
        "[hook/chorus]\n" +
        "Leave the keys on the counter, leave the doubt at the door\n" +
        "Walking through the city like I never did before\n" +
        "Nobody calling, nobody checking in\n" +
        "Where the concrete ends and the quiet begins\n\n" +
        "[outro]\n" +
        "Quiet begins\n" +
        "Nothing left behind\n" +
        "Just the groove"
      )
    };
  }

  if (isRock) {
    return {
      formatName: 'Alt Rock / Grunge',
      markers: ['[intro]', '[verse 1]', '[pre-chorus]', '[chorus]', '[verse 2]', '[pre-chorus]', '[chorus]', '[instrumental solo]', '[bridge]', '[final chorus]', '[outro]'],
      lyrics: (
        "[intro]\n" +
        "Overdriven feedback hums through the speaker cone\n" +
        "Static in the corner where the amplifiers moan\n\n" +
        "[verse 1]\n" +
        "A cracked ceramic mug sits cold upon the sill\n" +
        "The kitchen clock counts seconds that the shadows cannot fill\n" +
        "I keep your jacket hanging where the morning catches light\n" +
        "Not waiting for your footsteps, just remembering the night\n\n" +
        "[pre-chorus]\n" +
        "Wires sparking on the floorboards, tension getting tight\n" +
        "I stopped trying to make the static sound polite\n\n" +
        "[chorus]\n" +
        "There is salt on the sill where the winter broke through\n" +
        "A quiet kind of peace that came after you\n" +
        "I do not want the storm back, I do not want the rain\n" +
        "Just this raw open room where I learned my own name\n\n" +
        "[verse 2]\n" +
        "The tea kettle rattles on the copper heating ring\n" +
        "A postcard from October with a message paper-thin\n" +
        "I kicked the door open before the frost took hold\n" +
        "Learning how an empty room can feel like quiet gold\n\n" +
        "[pre-chorus]\n" +
        "Wires sparking on the floorboards, tension getting tight\n" +
        "I stopped trying to make the static sound polite\n\n" +
        "[chorus]\n" +
        "There is salt on the sill where the winter broke through\n" +
        "A quiet kind of peace that came after you\n" +
        "I do not want the storm back, I do not want the rain\n" +
        "Just this raw open room where I learned my own name\n\n" +
        "[instrumental solo]\n" +
        "Distorted lead guitar climbs through soaring bends and screaming harmonics, shifting from tension to liberation\n\n" +
        "[bridge]\n" +
        "It started with wondering if fences ever mend\n" +
        "Then fighting every shadow like a stranger or a friend\n" +
        "Now the iron latch is resting and the doorway opens wide\n" +
        "Nothing left to prove and nowhere left to hide\n\n" +
        "[final chorus]\n" +
        "There is salt on the sill where the winter broke through\n" +
        "A quiet kind of peace that came after you\n" +
        "I do not want the storm back, I do not want the rain\n" +
        "Just this raw open room where I learned my own name\n\n" +
        "[outro]\n" +
        "Salt on the sill\n" +
        "Feedback fades away\n" +
        "The morning begins"
      )
    };
  }

  if (isPop) {
    return {
      formatName: 'Modern Pop (with post-chorus)',
      markers: ['[intro]', '[verse 1]', '[pre-chorus]', '[chorus]', '[post-chorus]', '[verse 2]', '[pre-chorus]', '[chorus]', '[post-chorus]', '[bridge]', '[final chorus]', '[outro]'],
      lyrics: (
        "[intro]\n" +
        "Synthesizer pulse ticking down the neon glow\n" +
        "Echoes in the hallway, ready for the show\n\n" +
        "[verse 1]\n" +
        "A cracked ceramic mug sits cold upon the sill\n" +
        "The kitchen clock counts seconds that the shadows cannot fill\n" +
        "I keep your jacket hanging where the morning catches light\n" +
        "Not waiting for your footsteps, just remembering the night\n\n" +
        "[pre-chorus]\n" +
        "Counting down the heartbeats, turning on the room\n" +
        "Watching all the shadows turn to electric bloom\n\n" +
        "[chorus]\n" +
        "There is salt on the sill where the winter broke through\n" +
        "A quiet kind of peace that came after you\n" +
        "I do not want the storm back, I do not want the rain\n" +
        "Just this high golden beat where I learned my own name\n\n" +
        "[post-chorus]\n" +
        "Ooh, let the rhythm reset\n" +
        "Every color brighter than the day we met\n\n" +
        "[verse 2]\n" +
        "The tea kettle rattles on the copper heating ring\n" +
        "A postcard from October with a message paper-thin\n" +
        "I walked across the river bridge before the frost took hold\n" +
        "Learning how an empty room can feel like quiet gold\n\n" +
        "[pre-chorus]\n" +
        "Counting down the heartbeats, turning on the room\n" +
        "Watching all the shadows turn to electric bloom\n\n" +
        "[chorus]\n" +
        "There is salt on the sill where the winter broke through\n" +
        "A quiet kind of peace that came after you\n" +
        "I do not want the storm back, I do not want the rain\n" +
        "Just this high golden beat where I learned my own name\n\n" +
        "[post-chorus]\n" +
        "Ooh, let the rhythm reset\n" +
        "Every color brighter than the day we met\n\n" +
        "[bridge]\n" +
        "It started with wondering if fences ever mend\n" +
        "Then fighting every shadow like a stranger or a friend\n" +
        "Now the iron latch is resting and the doorway opens wide\n" +
        "Nothing left to prove and nowhere left to hide\n\n" +
        "[final chorus]\n" +
        "There is salt on the sill where the winter broke through\n" +
        "A quiet kind of peace that came after you\n" +
        "I do not want the storm back, I do not want the rain\n" +
        "Just this high golden beat where I learned my own name\n\n" +
        "[outro]\n" +
        "Salt on the sill\n" +
        "Let the music play\n" +
        "The morning begins"
      )
    };
  }

  // Acoustic, Alt R&B, Ballad
  return {
    formatName: 'Acoustic / Alt R&B / Ballad',
    markers: ['[intro]', '[verse 1]', '[pre-chorus]', '[chorus]', '[verse 2]', '[pre-chorus]', '[chorus]', '[bridge]', '[final chorus]', '[outro]'],
    lyrics: (
      "[intro]\n" +
      "Fingerpicked chords ringing through the quiet floor\n" +
      "Morning sunlight slipping underneath the heavy door\n\n" +
      "[verse 1]\n" +
      "A cracked ceramic mug sits cold upon the sill\n" +
      "The kitchen clock counts seconds that the shadows cannot fill\n" +
      "I keep your jacket hanging where the morning catches light\n" +
      "Not waiting for your footsteps, just remembering the night\n\n" +
      "[pre-chorus]\n" +
      "I held my breath so long I forgot the sound of air\n" +
      "Now every corner answers that nobody is there\n\n" +
      "[chorus]\n" +
      "There is salt on the sill where the winter broke through\n" +
      "A quiet kind of peace that came after you\n" +
      "I do not want the storm back, I do not want the rain\n" +
      "Just this still golden hour where I learned my own name\n\n" +
      "[verse 2]\n" +
      "The tea kettle rattles on the copper heating ring\n" +
      "A postcard from October with a message paper-thin\n" +
      "I walked across the river bridge before the frost took hold\n" +
      "Learning how an empty room can feel like quiet gold\n\n" +
      "[pre-chorus]\n" +
      "I held my breath so long I forgot the sound of air\n" +
      "Now every corner answers that nobody is there\n\n" +
      "[chorus]\n" +
      "There is salt on the sill where the winter broke through\n" +
      "A quiet kind of peace that came after you\n" +
      "I do not want the storm back, I do not want the rain\n" +
      "Just this still golden hour where I learned my own name\n\n" +
      "[bridge]\n" +
      "It started with wondering if fences ever mend\n" +
      "Then fighting every shadow like a stranger or a friend\n" +
      "Now the iron latch is resting and the doorway opens wide\n" +
      "Nothing left to prove and nowhere left to hide\n\n" +
      "[final chorus]\n" +
      "There is salt on the sill where the winter broke through\n" +
      "A quiet kind of peace that came after you\n" +
      "I do not want the storm back, I do not want the rain\n" +
      "Just this still golden hour where I learned my own name\n\n" +
      "[outro]\n" +
      "Salt on the sill\n" +
      "The quiet settles in\n" +
      "The morning begins"
    )
  };
}

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
  // 1 to 3 Styles Checkbox Selection (Default: Modern Pop)
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>(['pop']);

  // Compute Initial Fused Style (Modern Pop default)
  const initialFused = fuseStyles(['pop'], presets);

  // Editable Tempo / BPM State
  const [customBpm, setCustomBpm] = useState<number>(initialFused.blendedTempo);

  // Encoder Form State (Song Premise limited to 500 chars)
  const [idea, setIdea] = useState(
    'A quiet late-night realization after leaving an old apartment, finding freedom in an empty room.'
  );
  const [songTitle, setSongTitle] = useState('Salt on the Sill');
  const [language, setLanguage] = useState('English');

  // Drafted / Editable Content (Style Tags limited to 1000 chars, Lyrics up to 5000 chars)
  const [lyrics, setLyrics] = useState(getDefaultLyricsTemplate(['pop']).lyrics);

  const [styleTags, setStyleTags] = useState(initialFused.combinedStyleTags);
  const [writingNote, setWritingNote] = useState(
    'Anchored the narrative around the tangible tactile image of a cracked mug and winter salt on the sill. The emotional arc transitions through curiosity, hope, conflict, realization, and peaceful acceptance without forced drama.'
  );
  const [isPromptLocked, setIsPromptLocked] = useState(false);

  // Decoder / Sampler Settings (Initialized from default Modern Pop)
  const [seed, setSeed] = useState<number>(42891);
  const [steps, setSteps] = useState<number>(8);
  const [cfg, setCfg] = useState<number>(1.0);
  const [durationSeconds, setDurationSeconds] = useState<number>(initialFused.blendedDuration);
  const [precision, setPrecision] = useState<string>('8bit');

  // Active Fused Style Calculation
  const currentFused = fuseStyles(selectedPresetIds, presets);
  const currentLyricsTemplate = getDefaultLyricsTemplate(selectedPresetIds);

  // Appropriate BPM Hint Calculation based on selected styles
  const activePresetObjects = presets.filter((p) => selectedPresetIds.includes(p.id));
  const minPresetBpm = activePresetObjects.length > 0
    ? Math.min(...activePresetObjects.map((p) => p.tempo_bpm))
    : 122;
  const maxPresetBpm = activePresetObjects.length > 0
    ? Math.max(...activePresetObjects.map((p) => p.tempo_bpm))
    : 122;

  let bpmHintText = '';
  if (activePresetObjects.length <= 1) {
    const p = activePresetObjects[0];
    const base = p ? p.tempo_bpm : 122;
    bpmHintText = `Recommended: ${base - 5}–${base + 6} BPM (Standard: ${base} BPM)`;
  } else {
    bpmHintText = `Recommended range: ${minPresetBpm}–${maxPresetBpm} BPM (Blended: ${currentFused.blendedTempo} BPM)`;
  }

  // Update style tags and decoder when presets list loads if initially empty
  useEffect(() => {
    if (presets.length > 0 && selectedPresetIds.length === 1 && selectedPresetIds[0] === 'pop') {
      const fused = fuseStyles(['pop'], presets);
      setCustomBpm(fused.blendedTempo);
      setStyleTags(fused.combinedStyleTags);
      setSteps(8);
      setCfg(fused.blendedCfg);
      setDurationSeconds(fused.blendedDuration);
    }
  }, [presets]);

  // Lyric Style Guide Validation (Limit: 5000 characters maximum)
  const charCount = lyrics.length;
  const hasEmDash = lyrics.includes('—');
  const detectedBannedWords = BANNED_WORDS.filter((word) =>
    new RegExp(`\\b${word}\\b`, 'i').test(lyrics)
  );
  const isStyleGuideCompliant = charCount <= 5000 && !hasEmDash && detectedBannedWords.length === 0;

  // Handler for direct BPM editing
  const handleBpmChange = (newBpm: number) => {
    const clamped = Math.max(40, Math.min(240, newBpm));
    setCustomBpm(clamped);

    if (!isPromptLocked) {
      setStyleTags((prev) => {
        const bpmRegex = /\b\d+\s*bpm\b/i;
        if (bpmRegex.test(prev)) {
          return prev.replace(bpmRegex, `${clamped} bpm`).slice(0, 1000);
        } else {
          const trimmed = prev.trim();
          const updated = trimmed.length > 0 ? `${trimmed}, ${clamped} bpm` : `${clamped} bpm`;
          return updated.slice(0, 1000);
        }
      });
    }
  };

  // Toggle Style Checkbox (Enforces 1 to 3 styles)
  const handleToggleStyle = (presetId: string) => {
    let newSelection: string[];

    if (selectedPresetIds.includes(presetId)) {
      if (selectedPresetIds.length <= 1) {
        return; // Enforce minimum 1 style
      }
      newSelection = selectedPresetIds.filter((id) => id !== presetId);
    } else {
      if (selectedPresetIds.length >= 3) {
        return; // Enforce maximum 3 styles
      }
      newSelection = [...selectedPresetIds, presetId];
    }

    setSelectedPresetIds(newSelection);

    // Compute fused styles and update both Prompt Encoder and Music Generation settings
    const fused = fuseStyles(newSelection, presets);
    setCustomBpm(fused.blendedTempo);

    if (!isPromptLocked) {
      setStyleTags(fused.combinedStyleTags);
    }
    setSteps(8);
    setCfg(fused.blendedCfg);
    setDurationSeconds(fused.blendedDuration);
  };

  const handleResetToModernPop = () => {
    setSelectedPresetIds(['pop']);
    const fused = fuseStyles(['pop'], presets);
    setCustomBpm(fused.blendedTempo);
    if (!isPromptLocked) {
      setStyleTags(fused.combinedStyleTags);
    }
    setSteps(8);
    setCfg(fused.blendedCfg);
    setDurationSeconds(fused.blendedDuration);
  };

  const handleInsertMarker = (marker: string) => {
    if (isPromptLocked) return;
    setLyrics((prev) => {
      const trimmed = prev.trimEnd();
      const nextLyrics = trimmed ? `${trimmed}\n\n${marker}\n` : `${marker}\n`;
      return nextLyrics.slice(0, 5000);
    });
  };

  const handleApplyTemplate = (presetKey: 'pop' | 'rock' | 'acoustic' | 'hiphop') => {
    if (isPromptLocked) return;
    const tpl = getDefaultLyricsTemplate([presetKey]);
    setLyrics(tpl.lyrics);
  };

  const handleDraft = async () => {
    if (!idea.trim() || isPromptLocked) return;
    const fused = currentFused;
    const result = await onDraftLyrics({
      idea,
      title: songTitle,
      genre: fused.combinedGenre,
      vocal_style: fused.combinedVocal,
      tempo: `${customBpm} bpm`
    });
    if (result) {
      setSongTitle(result.title);
      setLyrics(result.lyrics);
      setStyleTags((result.style_tags || '').slice(0, 1000));
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
      steps: steps >= 32 ? 32 : steps >= 16 ? 16 : 8,
      cfg: 1.0,
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
            <div className="mb-4">
              <h3 className="text-base font-semibold text-neutral-100">01. Prompt Encoder (Qwen LLM)</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Translates your story premise into structured style tags and evocative human lyrics.
              </p>
            </div>

            {/* Style Fusion Checkboxes (1 to 3 styles) */}
            <div className="mb-5 bg-neutral-950/70 border border-neutral-800 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-200">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Style Fusion</span>
                  <span className="text-neutral-500 font-normal">(Select 1 to 3 styles to blend)</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                      selectedPresetIds.length === 3
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                        : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                    }`}
                  >
                    {selectedPresetIds.length} of 3 selected
                  </span>

                  {selectedPresetIds.length > 1 && (
                    <button
                      onClick={handleResetToModernPop}
                      className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-amber-400 transition-colors cursor-pointer"
                      title="Reset to default Modern Pop"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Checkboxes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {presets.map((preset) => {
                  const isChecked = selectedPresetIds.includes(preset.id);
                  const isLimitReached = selectedPresetIds.length >= 3 && !isChecked;
                  const isSingleSelected = selectedPresetIds.length === 1 && isChecked;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleToggleStyle(preset.id)}
                      disabled={isLimitReached}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        isChecked
                          ? 'border-amber-500/70 bg-amber-950/20 text-neutral-100 shadow-sm'
                          : isLimitReached
                          ? 'border-neutral-850 bg-neutral-950/40 text-neutral-600 cursor-not-allowed opacity-50'
                          : 'border-neutral-800/90 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100'
                      }`}
                      title={
                        isSingleSelected
                          ? 'At least 1 style must remain selected'
                          : isLimitReached
                          ? 'Maximum 3 styles can be fused'
                          : `Toggle ${preset.name}`
                      }
                    >
                      {/* Checkbox box */}
                      <div
                        className={`w-4 h-4 rounded mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
                          isChecked
                            ? 'bg-amber-400 text-neutral-950'
                            : 'border border-neutral-700 bg-neutral-950'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate leading-tight flex items-center justify-between gap-1">
                          <span>{preset.name}</span>
                          {preset.id === 'pop' && (
                            <span className="text-[9px] text-amber-400/80 font-mono">Default</span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-0.5 truncate font-mono">
                          {preset.tempo_bpm} BPM · {preset.genre.split(',')[0]}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Fused Style: Editable Tempo/BPM with Hints on Right */}
              <div className="pt-2.5 border-t border-neutral-850 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
                  {/* Left: Fused Style Names & Editable Tempo Input */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-neutral-300 font-medium">Fused Style:</span>
                      <span className="text-amber-300 font-medium truncate">
                        {currentFused.presetNames.join(' + ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded px-2 py-0.5 focus-within:border-amber-500 transition-colors">
                      <Gauge className="w-3 h-3 text-amber-400" />
                      <span className="text-neutral-400 font-medium select-none">BPM:</span>
                      <input
                        type="number"
                        min={40}
                        max={240}
                        value={customBpm}
                        onChange={(e) => handleBpmChange(parseInt(e.target.value) || 0)}
                        className="w-12 bg-transparent text-xs font-mono font-bold text-amber-300 focus:outline-none text-center"
                        title="Click to edit tempo in BPM"
                        aria-label="Editable Tempo BPM"
                      />
                    </div>
                  </div>

                  {/* Right: Appropriate BPM Hints for Selected Styles */}
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono bg-neutral-900/60 px-2.5 py-1 rounded border border-neutral-800/80">
                    <span className="text-neutral-500 select-none">Hint:</span>
                    <span className="text-amber-300/90 font-medium">{bpmHintText}</span>
                  </div>
                </div>

                {/* Synthesis Recommendations */}
                <div className="flex items-center justify-end gap-2 font-mono text-[10px] text-neutral-500">
                  <span>Steps: <strong className="text-neutral-300">{currentFused.blendedSteps}</strong></span>
                  <span>·</span>
                  <span>CFG: <strong className="text-neutral-300">{currentFused.blendedCfg}</strong></span>
                  <span>·</span>
                  <span>Duration: <strong className="text-neutral-300">{currentFused.blendedDuration}s</strong></span>
                </div>
              </div>
            </div>

            {/* Song Premise / Emotional Idea (3 lines, max 500 chars with scrollbar if lines exceed 3) */}
            <div className="space-y-3 mb-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-neutral-300">
                    Song Premise / Emotional Idea
                  </label>
                  <span
                    className={`text-[10px] font-mono ${
                      idea.length >= 480 ? 'text-amber-400' : 'text-neutral-500'
                    }`}
                  >
                    {idea.length} / 500 characters
                  </span>
                </div>
                <textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value.slice(0, 500))}
                  disabled={isPromptLocked}
                  rows={3}
                  maxLength={500}
                  style={{ maxHeight: '4.8rem' }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-amber-500 disabled:opacity-50 overflow-y-auto leading-relaxed resize-none"
                  placeholder="Describe what the song is about and what it felt like (up to 500 characters)..."
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
                <span>Fusing {currentFused.presetNames.length} Style{currentFused.presetNames.length > 1 ? 's' : ''}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-amber-300">{customBpm} BPM</span>
              </div>

              <button
                onClick={handleDraft}
                disabled={isDrafting || isPromptLocked || !idea.trim()}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
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
                  className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border transition-colors cursor-pointer ${
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
                <span className={`font-mono tabular-nums ${charCount > 5000 ? 'text-red-400 font-bold' : 'text-neutral-400'}`}>
                  {charCount} / 5000 chars
                </span>
              </div>
            </div>

            {/* Validation Alerts */}
            {charCount > 5000 && (
              <p className="text-xs text-red-400 mb-2">
                Warning: Lyrics exceed maximum allowed 5000 characters ({charCount} / 5000).
              </p>
            )}
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

            {/* Combined Style Tags (3 lines, max 1000 chars with scrollbar if lines exceed 3) */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-neutral-300">
                  Combined Style Tags (Genre, Instruments, Mood, Vocal Style, Tempo)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-amber-400/90 font-mono">
                    Fused from: {currentFused.presetNames.join(' + ')}
                  </span>
                  <span className="text-neutral-600">·</span>
                  <span
                    className={`text-[10px] font-mono ${
                      styleTags.length >= 950 ? 'text-amber-400' : 'text-neutral-500'
                    }`}
                  >
                    {styleTags.length} / 1000 characters
                  </span>
                </div>
              </div>
              <textarea
                value={styleTags}
                onChange={(e) => setStyleTags(e.target.value.slice(0, 1000))}
                disabled={isPromptLocked}
                rows={3}
                maxLength={1000}
                style={{ maxHeight: '4.8rem' }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500 disabled:opacity-50 overflow-y-auto leading-relaxed resize-none"
                placeholder="e.g. pop, synth-pop, acoustic guitar, 122 bpm (up to 1000 characters)..."
              />
            </div>

            {/* Lyrics Section with Genre Format Loaders and Section Marker Bar */}
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-neutral-300">
                  Lyrics (with [verse], [chorus], [bridge] markers)
                </label>

                {/* Genre Structure Template Selectors */}
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-neutral-500 select-none">Format:</span>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('pop')}
                    disabled={isPromptLocked}
                    className="px-1.5 py-0.5 rounded bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-amber-300 text-[10px] font-mono transition-colors disabled:opacity-50 cursor-pointer"
                    title="Load Pop format (with post-chorus)"
                  >
                    Pop
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('rock')}
                    disabled={isPromptLocked}
                    className="px-1.5 py-0.5 rounded bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-amber-300 text-[10px] font-mono transition-colors disabled:opacity-50 cursor-pointer"
                    title="Load Rock / Alt Rock / Grunge format (with [instrumental solo])"
                  >
                    Rock/Grunge
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('acoustic')}
                    disabled={isPromptLocked}
                    className="px-1.5 py-0.5 rounded bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-amber-300 text-[10px] font-mono transition-colors disabled:opacity-50 cursor-pointer"
                    title="Load Acoustic & Alt R&B standard format"
                  >
                    Acoustic / R&B
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('hiphop')}
                    disabled={isPromptLocked}
                    className="px-1.5 py-0.5 rounded bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-amber-300 text-[10px] font-mono transition-colors disabled:opacity-50 cursor-pointer"
                    title="Load Rap / Hip Hop / Lo-Fi format (with [hook/chorus])"
                  >
                    Rap / Lo-Fi
                  </button>
                </div>
              </div>

              {/* Quick Section Marker Insertion Bar */}
              <div className="flex flex-wrap items-center gap-1 p-1.5 bg-neutral-950/80 border border-neutral-800/90 rounded-lg">
                <span className="text-[10px] text-neutral-500 px-1 font-mono select-none">Add marker:</span>
                {[
                  '[intro]',
                  '[verse 1]',
                  '[pre-chorus]',
                  '[chorus]',
                  '[post-chorus]',
                  '[verse 2]',
                  '[instrumental solo]',
                  '[bridge]',
                  '[final chorus]',
                  '[hook/chorus]',
                  '[outro]'
                ].map((marker) => (
                  <button
                    key={marker}
                    type="button"
                    onClick={() => handleInsertMarker(marker)}
                    disabled={isPromptLocked}
                    className="px-1.5 py-0.5 text-[10px] font-mono bg-neutral-900 hover:bg-amber-950/50 text-neutral-300 hover:text-amber-300 border border-neutral-800 hover:border-amber-600/50 rounded transition-colors disabled:opacity-40 cursor-pointer"
                    title={`Insert ${marker}`}
                  >
                    {marker}
                  </button>
                ))}
              </div>

              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value.slice(0, 5000))}
                disabled={isPromptLocked}
                rows={12}
                maxLength={5000}
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
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-neutral-100">02. YuE2 Music Decoder Settings</h3>
              <span className="text-[10px] text-amber-300/80 font-mono bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                Fused: {currentFused.presetNames.join(' + ')}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mb-5">
              Parameters map directly to the mlx-Yue request (NAR steps, planning mode, duration).
            </p>

            <div className="space-y-4">
              {/* Seed */}
              <div>
                <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                  <label className="font-medium">Seed</label>
                  <button
                    onClick={() => setSeed(Math.floor(Math.random() * 900000000) + 100000)}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 cursor-pointer"
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
                  <label className="font-medium">NAR Steps (quality / time)</label>
                  <span className="font-mono tabular-nums text-neutral-400">{steps} steps</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="32"
                  step="8"
                  value={steps}
                  onChange={(e) => setSteps(parseInt(e.target.value))}
                  className="w-full accent-amber-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-neutral-500 mt-1 font-mono">
                  <span>8 · draft</span>
                  <span>16 · standard</span>
                  <span>32 · final</span>
                </div>
              </div>

              {/* CFG Scale */}
              <div>
                <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                  <label className="font-medium">Guidance (MLX fixed 1.0)</label>
                  <span className="font-mono tabular-nums text-neutral-400">1.0</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="1.0"
                  step="0.01"
                  value={1.0}
                  disabled
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
                  step="5"
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
                  <option value="8bit">8bit — MLX quantized AR (recommended)</option>
                  <option value="bf16">bf16 — Full precision (slower, more memory)</option>
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
                Prior to generation, Qwen is unloaded from Ollama and the MLX engine runs alone with a 14 GB memory budget.
              </p>
            </div>

            {/* Generate Song CTA Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !lyrics.trim() || !styleTags.trim()}
              className="w-full mt-5 py-3 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Music className={`w-4 h-4 ${isGenerating ? 'animate-bounce' : ''}`} />
              <span>
                {isGenerating
                  ? `Synthesizing ${currentFused.presetNames.join(' + ')} Song...`
                  : `Generate Full ${currentFused.presetNames.join(' + ')} Song (${customBpm} BPM)`}
              </span>
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
