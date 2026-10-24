import React, { useEffect, useState } from 'react';
import { Search, Play, Pause, Trash2, Copy, RefreshCw, Calendar, Music, Sparkles, Layers, Wand2, Loader2, Download } from 'lucide-react';
import { Job } from '../types';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import { StemState, fetchStems, splitStems } from '../services/api';

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
  const [expandedJobId, setExpandedJobId] = useState<string | null>(jobs[0]?.id || null);
  const [stemsByJob, setStemsByJob] = useState<Record<string, StemState>>({});
  const [stemBusy, setStemBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedJobId) return;
    let active = true;
    fetchStems(expandedJobId)
      .then((state) => {
        if (active && state.status === 'completed') {
          setStemsByJob((prev) => ({ ...prev, [expandedJobId]: state }));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [expandedJobId]);

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

  const filteredJobs = jobs.filter((j) => {
    const q = searchQuery.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      (j.style_tags && j.style_tags.toLowerCase().includes(q)) ||
      (j.lyrics && j.lyrics.toLowerCase().includes(q))
    );
  });

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
        <div className="space-y-4">
          {filteredJobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            return (
              <div
                key={job.id}
                className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden transition-all"
              >
                {/* Summary Strip */}
                <div className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div
                    onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                    className="flex items-center gap-3 cursor-pointer min-w-0"
                  >
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
