import React, { useRef, useState } from 'react';
import { AlertCircle, Disc3, Music, ShieldCheck, Upload } from 'lucide-react';
import { Capabilities } from '../types';

interface CoverSongTabProps {
  capabilities: Capabilities;
  onGenerateCover: (form: FormData) => Promise<void>;
  isGenerating: boolean;
  completedAudioUrl?: string;
  lastGeneratedTitle?: string;
}

export const CoverSongTab: React.FC<CoverSongTabProps> = ({
  capabilities,
  onGenerateCover,
  isGenerating,
  completedAudioUrl,
  lastGeneratedTitle,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('Midnight Drive (Cover)');
  const [styleTags, setStyleTags] = useState(
    'English, synthwave, warm female vocal, analog synth bass, gated drums, 108 BPM, cinematic night drive'
  );
  const [lyrics, setLyrics] = useState('');
  const [rights, setRights] = useState(false);
  const [steps, setSteps] = useState(8);
  const [duration, setDuration] = useState(120);
  const [maxMode, setMaxMode] = useState(true);
  const [styleInfluence, setStyleInfluence] = useState(50);
  const [audioInfluence, setAudioInfluence] = useState(50);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supported = capabilities.cover_conditioning_supported;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    if (!supported) {
      setLocalError('The MLX engine is not ready. Check System Status.');
      return;
    }
    if (!title.trim()) {
      setLocalError('Cover title is required.');
      return;
    }
    if (!file) {
      setLocalError('Choose a reference audio file.');
      return;
    }
    if (!rights) {
      setLocalError('Confirm you own or have permission to use this recording.');
      return;
    }
    if (!styleTags.trim()) {
      setLocalError('Describe the target style.');
      return;
    }
    const form = new FormData();
    form.append('audio_file', file);
    form.append('title', title.trim());
    form.append('style_tags', styleTags);
    form.append('lyrics', lyrics);
    form.append('rights_acknowledged', 'true');
    form.append('steps', String(steps));
    form.append('duration_seconds', String(duration));
    form.append('max_mode', String(maxMode));
    form.append('style_influence', String(styleInfluence));
    form.append('audio_influence', String(audioInfluence));
    await onGenerateCover(form);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {!supported && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h4 className="text-sm font-semibold text-amber-200">Cover engine not ready</h4>
            <p className="mt-1 text-xs text-amber-300/80">
              {capabilities.status_summary}. Covers need the MLX engine, SheetSage2, and ffmpeg.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex items-center gap-2">
          <Disc3 className="h-4 w-4 text-amber-400" />
          <h3 className="text-base font-semibold text-neutral-100">Cover Studio</h3>
        </div>
        <p className="text-xs text-neutral-400">
          The reference recording is transcribed to an ABC melody, then YuE2 sings it in a new style.
          Melody is preserved; the original singer's timbre is not cloned.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
          className="cursor-pointer rounded-lg border border-dashed border-neutral-700 bg-neutral-950/60 p-6 text-center"
        >
          <Upload className="mx-auto mb-2 h-5 w-5 text-neutral-400" />
          <div className="text-xs text-neutral-200">{file ? file.name : 'Choose or drop a WAV / MP3 / FLAC'}</div>
          <div className="mt-1 text-[11px] text-neutral-500">Up to 60 MB · 15–360 seconds</div>
          <input
            ref={inputRef}
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.aiff,.aif,.ogg,.opus,audio/*"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-neutral-300">
            Cover title <span className="text-amber-400">*</span>
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Required"
              aria-required="true"
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-500 focus:outline-none"
            />
          </label>
          <label className="text-xs text-neutral-300">
            Target style <span className="text-neutral-500">(max 1000)</span>
            <textarea
              value={styleTags}
              onChange={(event) => setStyleTags(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Genre, vocals, instruments, mood, tempo, production..."
              className="mt-1 w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-500 focus:outline-none"
            />
            <span className="mt-1 block text-right font-mono text-[10px] text-neutral-500">{styleTags.length}/1000</span>
          </label>
        </div>

        {/* Cover generation controls */}
        <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
          <label className="flex items-start gap-2.5 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={maxMode}
              onChange={(event) => setMaxMode(event.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <span>
              <span className="font-semibold text-neutral-200">Max / Beast Mode</span>
              <span className="ml-2 text-[10px] text-emerald-400">on by default</span>
              <span className="mt-0.5 block text-[10px] text-neutral-500">
                Aims for one consistent lead vocal throughout, with full-quality NAR steps and explicit vocal-consistency guidance.
              </span>
            </span>
          </label>

          <div>
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <label className="font-medium">Style Influence</label>
              <span className="font-mono tabular-nums text-amber-300">{styleInfluence}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={styleInfluence}
              onChange={(event) => setStyleInfluence(Number(event.target.value))}
              className="mt-1 w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>0% · free</span>
              <span>50% · neutral</span>
              <span>100% · strict</span>
            </div>
            <p className="mt-1 text-[10px] text-neutral-500">
              How strongly YuE2 follows the genre, instruments, vocal and mood text. Maps to the AR guidance scale.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <label className="font-medium">Audio Influence</label>
              <span className="font-mono tabular-nums text-amber-300">{audioInfluence}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={audioInfluence}
              onChange={(event) => setAudioInfluence(Number(event.target.value))}
              className="mt-1 w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>0% · reference off</span>
              <span>50% · melody</span>
              <span>100% · full score</span>
            </div>
            <p className="mt-1 text-[10px] text-neutral-500">
              0–15% generates from lyrics/style without the reference. 20–75% keeps the transcribed melody. 80–100% uses the full transcribed score.
            </p>
          </div>
        </div>

        <label className="block text-xs text-neutral-300">
          New lyrics (leave blank to let YuE2 use the transcribed melody)
          <textarea
            value={lyrics}
            onChange={(event) => setLyrics(event.target.value)}
            rows={7}
            placeholder="[Verse]&#10;...&#10;[Chorus]&#10;..."
            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-100 focus:border-amber-500 focus:outline-none"
          />
        </label>

        <p className="text-[10px] text-neutral-500">
          YuE2 sings the supplied lyrics. Production-only bracket tags are normalized to
          [Verse] / [Chorus] before generation. Lyric timing remains model-controlled;
          raise Style Influence for stronger adherence.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-neutral-300">
            NAR steps
            <select
              value={steps}
              onChange={(event) => setSteps(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-500 focus:outline-none"
            >
              <option value={8}>8 — draft</option>
              <option value={16}>16 — standard</option>
              <option value={32}>32 — final</option>
            </select>
          </label>
          <label className="text-xs text-neutral-300">
            Max duration (seconds)
            <input
              type="number"
              min={15}
              max={360}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-500 focus:outline-none"
            />
          </label>
        </div>

        <label className="flex items-start gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={rights}
            onChange={(event) => setRights(event.target.checked)}
            className="mt-0.5 accent-amber-500"
          />
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            I own this recording or have explicit permission to transform it.
          </span>
        </label>

        {localError && <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-xs text-red-200">{localError}</div>}

        <button
          type="submit"
          disabled={isGenerating || !supported}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Music className="h-4 w-4" />
          {isGenerating ? 'Rendering cover…' : 'Generate cover'}
        </button>
      </form>

      {completedAudioUrl && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-2 text-sm font-semibold text-neutral-100">{lastGeneratedTitle || 'Latest render'}</div>
          <audio controls src={completedAudioUrl} className="w-full" />
        </div>
      )}
    </div>
  );
};
