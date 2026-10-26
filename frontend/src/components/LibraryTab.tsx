import React, { useEffect, useState } from 'react';
import { Search, Play, Pause, Trash2, Copy, RefreshCw, Calendar, Music, Sparkles, Layers, Wand2, Loader2, Download, ChevronDown, FileMusic, Check } from 'lucide-react';
import { Job } from '../types';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import { AbcScorePlayer } from './AbcScorePlayer';
import { MemoryFeedback } from './MemoryFeedback';
import { MidiState, StemState, createMidi, fetchJobAbc, fetchMidi, fetchStems, splitStems } from '../services/api';

interface LibraryTabProps {
  jobs: Job[];
  onDeleteJob: (id: string) => Promise<void>;
  onDuplicateJob: (job: Job) => void;
  onRerunJob: (job: Job) => void;
  onUseAsInspiration: (job: Job) => void;
}

export const LibraryTab: React.FC<LibraryTabProps> = ({
  jobs,
  onDeleteJob,
  onDuplicateJob,
  onRerunJob,
  onUseAsInspiration
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(jobs[0]?.id || null);
  const [stemsByJob, setStemsByJob] = useState<Record<string, StemState>>({});
  const [stemBusy, setStemBusy] = useState<string | null>(null);
  const [midiByJob, setMidiByJob] = useState<Record<string, MidiState>>({});
  const [midiBusy, setMidiBusy] = useState<string | null>(null);
  const [abcOpen, setAbcOpen] = useState<Record<string, boolean>>({});
  const [abcText, setAbcText] = useState<Record<string, string>>({});
  const [abcLoading, setAbcLoading] = useState<string | null>(null);
  const [abcCopied, setAbcCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedJobId) return;
    let active = true;
    fetchStems(selectedJobId)
      .then((state) => {
        if (active && state.status === 'completed') {
          setStemsByJob((prev) => ({ ...prev, [selectedJobId]: state }));
        }
      })
      .catch(() => undefined);
    fetchMidi(selectedJobId)
      .then((state) => {
        if (active && state.status === 'completed') {
          setMidiByJob((prev) => ({ ...prev, [selectedJobId]: state }));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedJobId]);

  const handleStems = async (job: Job) => {
    setStemBusy(job.id);
    try {
      let state = await fetchStems(job.id);
      if (state.status !== 'completed') {
        state = await splitStems(job.id);
        setStemsByJob((prev) => ({ ...prev, [job.id]: state }));
        for (let i = 0; i < 120; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          state = await fetchStems(job.id);
          setStemsByJob((prev) => ({ ...prev, [job.id]: state }));
          if (state.status === 'completed' || state.status === 'failed') break;
        }
      } else {
        setStemsByJob((prev) => ({ ...prev, [job.id]: state }));
      }
    } catch (err) {
      setStemsByJob((prev) => ({
        ...prev,
        [job.id]: {
          status: 'failed',
          stems: [],
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    } finally {
      setStemBusy(null);
    }
  };

  const handleMidi = async (job: Job) => {
    setMidiBusy(job.id);
    try {
      let state = await fetchMidi(job.id);
      if (state.status !== 'completed') {
        state = await createMidi(job.id);
        setMidiByJob((prev) => ({ ...prev, [job.id]: state }));
        for (let i = 0; i < 80; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          state = await fetchMidi(job.id);
          setMidiByJob((prev) => ({ ...prev, [job.id]: state }));
          if (state.status === 'completed' || state.status === 'failed') break;
        }
      } else {
        setMidiByJob((prev) => ({ ...prev, [job.id]: state }));
      }
    } catch (err) {
      setMidiByJob((prev) => ({
        ...prev,
        [job.id]: {
          status: 'failed',
          stems: [],
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    } finally {
      setMidiBusy(null);
    }
  };

  const toggleAbc = async (job: Job) => {
    const open = !abcOpen[job.id];
    setAbcOpen((prev) => ({ ...prev, [job.id]: open }));
    if (!open || abcText[job.id] || !job.abc_url) return;
    setAbcLoading(job.id);
    try {
      const text = await fetchJobAbc(job.id);
      setAbcText((prev) => ({ ...prev, [job.id]: text }));
    } catch {
      setAbcText((prev) => ({ ...prev, [job.id]: '' }));
    } finally {
      setAbcLoading(null);
    }
  };

  const copyAbc = async (job: Job) => {
    const text = abcText[job.id];
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setAbcCopied(job.id);
    setTimeout(() => setAbcCopied(null), 1500);
  };

  const downloadAbc = (job: Job) => {
    const text = abcText[job.id];
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.title.replace(/[^a-z0-9]+/gi, '_') || 'score'}.abc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredJobs = jobs.filter((j) => {
    const q = searchQuery.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      (j.style_tags && j.style_tags.toLowerCase().includes(q)) ||
      (j.lyrics && j.lyrics.toLowerCase().includes(q))
    );
  });

  const versionByJob = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  [...jobs]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach((job) => {
      const key = (job.title || 'untitled').trim().toLowerCase();
      const next = (titleCounts.get(key) || 0) + 1;
      titleCounts.set(key, next);
      versionByJob.set(job.id, next);
    });

  const formatDate = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const jobBpm = (job: Job) => job.score_meta?.bpm || job.style_tags?.match(/(\d{2,3})\s*bpm/i)?.[1] || '—';
  const jobKey = (job: Job) => job.score_meta?.key || '—';
  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) || null;

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-neutral-100">Song Library & Output History</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Past synthesized songs with master stems, settings snapshots, and playback.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, genre, or lyrics..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="text-center py-16 bg-neutral-900 border border-dashed border-neutral-800 rounded-xl p-8">
          <Music className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-neutral-300">No Song Artifacts Found</h4>
          <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
            {searchQuery ? 'No tracks matched your query.' : 'Draft lyrics and hit Generate to produce your first song artifact.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2.6fr)]">
          <aside className="min-w-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Song Navigation</span>
              <span className="font-mono text-[10px] text-neutral-600">{filteredJobs.length}</span>
            </div>
            <div className="max-h-[calc(100vh-250px)] space-y-2 overflow-y-auto pr-1">
              {filteredJobs.map((job) => {
                const active = job.id === selectedJobId;
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? 'border-amber-500/60 bg-amber-500/10'
                        : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-900/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-xs font-semibold text-neutral-100">{job.title || 'Untitled'}</span>
                      <span className="shrink-0 rounded bg-neutral-950 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400">
                        v{versionByJob.get(job.id) || 1}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-neutral-500">
                      <span className={`h-1.5 w-1.5 rounded-full ${job.status === 'completed' ? 'bg-emerald-400' : job.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
                      <span>{job.type === 'cover' ? 'Cover' : 'Text to Song'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job.status}</span>
                    </div>
                    <div className="mt-2 space-y-0.5 text-[10px] text-neutral-500">
                      <div><span className="text-neutral-600">Created</span> {formatDate(job.created_at)}</div>
                      <div><span className="text-neutral-600">Updated</span> {formatDate(job.updated_at)}</div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 font-mono text-[10px]">
                      <span className="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-amber-300">{jobBpm(job)} BPM</span>
                      <span className="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-violet-300">Key {jobKey(job)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0">
            {!selectedJob ? (
              <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900 p-10 text-center text-xs text-neutral-500">
                Select a song from the navigation list.
              </div>
            ) : (
            <div className="space-y-4">
          {filteredJobs.filter((job) => job.id === selectedJobId).map((job) => {
            const isExpanded = true;
            return (
              <div
                key={job.id}
                className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden transition-all"
              >
                {/* Summary Strip */}
                <div className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Music className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-neutral-100 truncate">{job.title}</h4>
                      <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                        <span>{job.type === 'cover' ? 'Cover Track' : 'Original Text-to-Song'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{job.duration_seconds || 60}s</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-[200px]">{job.style_tags || 'Acoustic'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDuplicateJob(job)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                      title="Copy lyrics & tags into Prompt Encoder"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicate & Edit</span>
                    </button>

                    <button
                      onClick={() => onUseAsInspiration(job)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/50 rounded-lg transition-colors"
                      title="Create a brand-new track with the same mood, tempo and instrumentation — no audio or melody copied"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Use as Inspiration</span>
                    </button>

                    <button
                      onClick={() => handleStems(job)}
                      disabled={stemBusy === job.id}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
                      title="Split into 6 stems (lead vocal, drums, bass, guitar, piano, synth/other)"
                    >
                      {stemBusy === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                      <span>{stemsByJob[job.id]?.status === 'completed' ? 'View Stems' : 'Split Stems'}</span>
                    </button>

                    <button
                      onClick={() => onRerunJob(job)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                      title="Re-run with the same settings"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Re-run</span>
                    </button>

                    <button
                      onClick={() => onDeleteJob(job.id)}
                      className="p-1.5 text-neutral-500 hover:text-red-400 rounded-lg hover:bg-neutral-800 transition-colors"
                      title="Delete from Library"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Player & Metadata */}
                {isExpanded && (
                  <div className="border-t border-neutral-800/80 p-5 bg-neutral-950/40 space-y-4">
                    <AudioWaveformPlayer
                      audioUrl={job.audio_url}
                      title={job.title}
                      settingsSnapshot={{
                        model: job.model_name,
                        qwen_model: job.qwen_model,
                        seed: job.seed,
                        steps: job.steps,
                        cfg: job.cfg,
                        duration_seconds: job.duration_seconds,
                        created_at: job.created_at
                      }}
                    />

                    {job.lyrics && (
                      <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                        <span className="block text-xs font-medium text-neutral-400 mb-1">Song Lyrics</span>
                        <pre className="text-xs font-mono text-neutral-300 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                          {job.lyrics}
                        </pre>
                      </div>
                    )}

                    {stemsByJob[job.id] && (
                      <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
                              <Layers className="w-3.5 h-3.5 text-amber-400" />
                              Stem Splitter
                            </span>
                            <p className="mt-0.5 text-[10px] text-neutral-500">
                              6-stem ONNX separation (htdemucs_6s) · local CPU
                            </p>
                          </div>
                          {stemsByJob[job.id].status === 'running' && (
                            <span className="flex items-center gap-1.5 text-[11px] text-amber-300">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {stemsByJob[job.id].stage || 'Separating…'}
                            </span>
                          )}
                          {stemsByJob[job.id].status === 'failed' && (
                            <span className="text-[11px] text-red-300">{stemsByJob[job.id].error || 'Failed'}</span>
                          )}
                        </div>

                        {stemsByJob[job.id].status === 'completed' && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {stemsByJob[job.id].stems.map((stem) => (
                              <div key={stem.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-medium text-neutral-200">{stem.label}</span>
                                  <a
                                    href={stem.file}
                                    download={`${job.title.replace(/[^a-z0-9]+/gi, '_')}-${stem.id}.wav`}
                                    className="text-neutral-500 hover:text-amber-300"
                                    title="Download stem"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                                <audio controls preload="none" src={stem.file} className="h-8 w-full" />
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-1">
                          {(stemsByJob[job.id].notes || []).map((note) => (
                            <p key={note} className="text-[10px] text-neutral-500">• {note}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {stemsByJob[job.id]?.status === 'completed' && (
                      <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
                              <FileMusic className="w-3.5 h-3.5 text-emerald-400" />
                              MIDI from stems
                            </span>
                            <p className="mt-0.5 text-[10px] text-neutral-500">
                              Basic Pitch ONNX for pitched stems · drum onset/band map
                            </p>
                          </div>
                          <button
                            onClick={() => handleMidi(job)}
                            disabled={midiBusy === job.id}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
                          >
                            {midiBusy === job.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileMusic className="w-3 h-3" />}
                            {midiBusy === job.id
                              ? 'Transcribing…'
                              : midiByJob[job.id]?.status === 'completed'
                                ? 'Refresh MIDI'
                                : 'Create MIDI'}
                          </button>
                        </div>

                        {midiByJob[job.id]?.status === 'running' && (
                          <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {midiByJob[job.id].stage || 'Transcribing stems…'}
                          </p>
                        )}
                        {midiByJob[job.id]?.status === 'failed' && (
                          <p className="text-[11px] text-red-300">{midiByJob[job.id].error || 'MIDI failed'}</p>
                        )}

                        {midiByJob[job.id]?.status === 'completed' && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {midiByJob[job.id].stems.map((item) => (
                              <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-2">
                                <div className="min-w-0">
                                  <div className="truncate text-[11px] font-medium text-neutral-200">{item.label}</div>
                                  <div className="text-[10px] text-neutral-500">
                                    {item.notes} notes · {item.method}
                                  </div>
                                </div>
                                <a
                                  href={item.file}
                                  download={`${job.title.replace(/[^a-z0-9]+/gi, '_')}-${item.id}.mid`}
                                  className="shrink-0 text-neutral-500 hover:text-emerald-300"
                                  title="Download MIDI"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-1">
                          {(midiByJob[job.id]?.notes || []).map((note) => (
                            <p key={note} className="text-[10px] text-neutral-500">• {note}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {job.abc_url && (
                      <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                        <button
                          onClick={() => toggleAbc(job)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
                            <Music className="w-3.5 h-3.5 text-violet-400" />
                            Interactive ABC score
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 text-neutral-500 transition-transform ${abcOpen[job.id] ? 'rotate-180' : ''}`}
                          />
                        </button>

                        {abcOpen[job.id] && (
                          <div className="mt-3 space-y-2">
                            {abcLoading === job.id ? (
                              <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
                                <Loader2 className="w-3 h-3 animate-spin" /> Loading ABC…
                              </p>
                            ) : abcText[job.id] ? (
                              <>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => copyAbc(job)}
                                    className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-white"
                                  >
                                    {abcCopied === job.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    {abcCopied === job.id ? 'Copied' : 'Copy ABC'}
                                  </button>
                                  <button
                                    onClick={() => downloadAbc(job)}
                                    className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-white"
                                  >
                                    <Download className="w-3 h-3" /> Download .abc
                                  </button>
                                </div>
                                <AbcScorePlayer abc={abcText[job.id]} />
                              </>
                            ) : (
                              <p className="text-[11px] text-neutral-500">No ABC score available for this song.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <MemoryFeedback jobId={job.id} />
                  </div>
                )}
              </div>
            );
          })}
            </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
