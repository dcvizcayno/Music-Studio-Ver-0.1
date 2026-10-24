import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Capabilities, ComfyModel, Job, OllamaModel, Preset, SystemStatusData } from './types';
import {
  cancelJob,
  deleteJob,
  encodePrompt,
  fetchCapabilities,
  fetchJobs,
  fetchOllamaModels,
  fetchPresets,
  fetchSystemStatus,
  fetchYueModels,
  generateCover,
  generateSong,
} from './services/api';
import { TopBar, StudioTab } from './components/TopBar';
import { ModelSelectorBar } from './components/ModelSelectorBar';
import { ActiveGenerationBanner } from './components/ActiveGenerationBanner';
import { TextToSongTab } from './components/TextToSongTab';
import { CoverSongTab } from './components/CoverSongTab';
import { LibraryTab } from './components/LibraryTab';
import { SystemStatusTab } from './components/SystemStatusTab';
import { SettingsTab } from './components/SettingsTab';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('text_to_song');
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [yueModels, setYueModels] = useState<ComfyModel[]>([]);
  const [selectedOllama, setSelectedOllama] = useState<string>('');
  const [selectedYue, setSelectedYue] = useState<string>('YuE2-3B MLX 8-bit');
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  const [isDrafting, setIsDrafting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState('Idle');
  const [completedAudioUrl, setCompletedAudioUrl] = useState<string | undefined>(undefined);
  const [lastGeneratedTitle, setLastGeneratedTitle] = useState<string | undefined>(undefined);
  const [lastJobSnapshot, setLastJobSnapshot] = useState<any>(null);
  const [libraryJobs, setLibraryJobs] = useState<Job[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);
  const [isScanningSystem, setIsScanningSystem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  const loadStudioState = async () => {
    setIsRefreshingModels(true);
    setLoadError(null);
    try {
      const [capsData, ollamaData, yueData, presetData, jobsData, statusData] = await Promise.all([
        fetchCapabilities(),
        fetchOllamaModels(),
        fetchYueModels(),
        fetchPresets(),
        fetchJobs(),
        fetchSystemStatus(),
      ]);
      setCapabilities(capsData);
      setOllamaModels(ollamaData.models);
      setYueModels(yueData.models);
      setPresets(presetData);
      setLibraryJobs(jobsData);
      setSystemStatus(statusData);
      setSelectedOllama((current) => current || ollamaData.default_model || ollamaData.models[0]?.name || '');
      setSelectedYue((current) => yueData.default_model || current || 'YuE2-3B MLX 8-bit');
    } catch (err) {
      setLoadError(errorText(err));
      setCapabilities(null);
    } finally {
      setIsRefreshingModels(false);
    }
  };

  useEffect(() => {
    loadStudioState();
    return () => streamRef.current?.close();
  }, []);

  const handleSelectOllama = (model: string) => {
    setSelectedOllama(model);
    localStorage.setItem('yue2_selected_ollama', model);
  };

  const handleSelectYue = (model: string) => {
    setSelectedYue(model);
    localStorage.setItem('yue2_selected_yue', model);
  };

  const startStream = (job: Job) => {
    streamRef.current?.close();
    const source = new EventSource(`/api/songs/${job.id}/events`);
    streamRef.current = source;
    source.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof data.progress === 'number') setCurrentProgress(data.progress);
      if (data.stage_name) setCurrentStage(data.stage_name);
      if (data.status === 'completed') {
        setCompletedAudioUrl(`${data.audio_url || `/api/outputs/${job.id}/audio.flac`}?t=${Date.now()}`);
        setIsGenerating(false);
        setActiveJob(null);
        source.close();
        setLibraryJobs((prev) => {
          const completed = { ...job, status: 'completed' as const, progress: 100, stage_name: 'Complete' };
          return [completed, ...prev.filter((item) => item.id !== job.id)];
        });
      } else if (data.status === 'failed' || data.status === 'cancelled') {
        setError(data.error || data.stage_name || `Job ${data.status}`);
        setIsGenerating(false);
        setActiveJob(null);
        source.close();
      }
    };
    source.onerror = () => {
      source.close();
      setIsGenerating(false);
      setActiveJob(null);
      setError('Progress stream disconnected. Check the Library for the final job state.');
    };
  };

  const handleDraftLyrics = async (params: {
    idea: string;
    title?: string;
    genre?: string;
    vocal_style?: string;
    tempo?: string;
  }) => {
    setIsDrafting(true);
    setError(null);
    try {
      return await encodePrompt({ ...params, qwen_model: selectedOllama });
    } catch (err) {
      setError(errorText(err));
      throw err;
    } finally {
      setIsDrafting(false);
    }
  };

  const handleGenerateSong = async (params: {
    title: string;
    idea?: string;
    lyrics: string;
    style_tags: string;
    seed?: number;
    steps: number;
    cfg: number;
    duration_seconds: number;
    precision: string;
  }) => {
    setIsGenerating(true);
    setError(null);
    setCurrentProgress(2);
    setCurrentStage('Submitting to mlx-Yue');
    try {
      const job = await generateSong({ ...params, qwen_model: selectedOllama });
      setActiveJob(job);
      setLastGeneratedTitle(params.title);
      setLastJobSnapshot({
        ...params,
        model: 'YuE2-3B MLX 8-bit',
        qwen_model: selectedOllama,
      });
      startStream(job);
    } catch (err) {
      setIsGenerating(false);
      setActiveJob(null);
      setError(errorText(err));
    }
  };

  const handleGenerateCover = async (form: FormData) => {
    setIsGenerating(true);
    setError(null);
    setCurrentProgress(2);
    setCurrentStage('Uploading reference and transcribing melody');
    try {
      const job = await generateCover(form);
      setActiveJob(job);
      setLastGeneratedTitle(String(form.get('title') || 'Cover'));
      setLastJobSnapshot({ title: form.get('title'), type: 'cover' });
      startStream(job);
    } catch (err) {
      setIsGenerating(false);
      setActiveJob(null);
      setError(errorText(err));
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    setIsCancelling(true);
    try {
      await cancelJob(activeJob.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      streamRef.current?.close();
      setIsGenerating(false);
      setIsCancelling(false);
      setActiveJob(null);
      setCurrentStage('Cancelled by user');
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await deleteJob(id);
      setLibraryJobs((prev) => prev.filter((job) => job.id !== id));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const handleDuplicateJob = (_job: Job) => setActiveTab('text_to_song');

  const handleRerunJob = (job: Job) => {
    handleGenerateSong({
      title: `${job.title} (Re-run)`,
      idea: job.idea,
      lyrics: job.lyrics || '',
      style_tags: job.style_tags || '',
      seed: job.seed,
      steps: job.steps || 8,
      cfg: 1,
      duration_seconds: job.duration_seconds || 60,
      precision: '8bit',
    });
  };

  const handleRescanSystem = async () => {
    setIsScanningSystem(true);
    try {
      setSystemStatus(await fetchSystemStatus());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsScanningSystem(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onQuickGenerate={() => setActiveTab('text_to_song')}
      />

      <ModelSelectorBar
        ollamaModels={ollamaModels}
        yueModels={yueModels}
        selectedOllama={selectedOllama}
        selectedYue={selectedYue}
        ollamaOnline={capabilities?.ollama_reachable ?? false}
        comfyOnline={capabilities?.mlx_available ?? capabilities?.text_to_song_supported ?? false}
        onSelectOllama={handleSelectOllama}
        onSelectYue={handleSelectYue}
        onRefresh={loadStudioState}
        isRefreshing={isRefreshingModels}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {loadError && (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Backend unavailable</div>
                <div className="mt-1 text-xs text-red-300/80">{loadError}</div>
                <button onClick={loadStudioState} className="mt-2 text-xs font-medium underline">
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="mb-8">
            <ActiveGenerationBanner
              stageName={currentStage}
              progress={currentProgress}
              onCancel={handleCancelJob}
              isCancelling={isCancelling}
            />
          </div>
        )}

        {activeTab === 'text_to_song' && (
          <TextToSongTab
            presets={presets}
            onDraftLyrics={handleDraftLyrics}
            onGenerateSong={handleGenerateSong}
            isDrafting={isDrafting}
            isGenerating={isGenerating}
            completedAudioUrl={completedAudioUrl}
            lastGeneratedTitle={lastGeneratedTitle}
            lastJobSnapshot={lastJobSnapshot}
          />
        )}

        {activeTab === 'cover_studio' && capabilities && (
          <CoverSongTab
            capabilities={capabilities}
            onGenerateCover={handleGenerateCover}
            isGenerating={isGenerating}
            completedAudioUrl={completedAudioUrl}
            lastGeneratedTitle={lastGeneratedTitle}
          />
        )}

        {activeTab === 'library' && (
          <LibraryTab
            jobs={libraryJobs}
            onDeleteJob={handleDeleteJob}
            onDuplicateJob={handleDuplicateJob}
            onRerunJob={handleRerunJob}
          />
        )}

        {activeTab === 'system_status' && systemStatus && (
          <SystemStatusTab
            statusData={systemStatus}
            onRescan={handleRescanSystem}
            isScanning={isScanningSystem}
          />
        )}

        {activeTab === 'settings' && <SettingsTab />}
      </main>

      <footer className="border-t border-neutral-900 py-6 px-6 text-center text-xs text-neutral-500">
        <div className="flex items-center justify-center gap-3">
          <span>Song Studio</span>
          <span aria-hidden="true">·</span>
          <span>Apple Silicon · MLX · local only</span>
          <span aria-hidden="true">·</span>
          <span>Qwen lyric drafting &amp; YuE2-3B synthesis</span>
        </div>
      </footer>
    </div>
  );
}
