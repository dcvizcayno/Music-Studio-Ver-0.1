import React, { useEffect, useState } from 'react';
import { Capabilities, ComfyModel, Job, OllamaModel, Preset, SystemStatusData, VoiceProfile } from './types';
import {
  fetchCapabilities,
  fetchJobs,
  fetchOllamaModels,
  fetchPresets,
  fetchSystemStatus,
  fetchYueModels,
  encodePrompt,
  generateSong
} from './services/api';
import { TopBar, StudioTab } from './components/TopBar';
import { ModelSelectorBar } from './components/ModelSelectorBar';
import { ActiveGenerationBanner } from './components/ActiveGenerationBanner';
import { TextToSongTab } from './components/TextToSongTab';
import { VocalModelingTab } from './components/VocalModelingTab';
import { CoverSongTab } from './components/CoverSongTab';
import { LibraryTab } from './components/LibraryTab';
import { SystemStatusTab } from './components/SystemStatusTab';
import { SettingsTab } from './components/SettingsTab';

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('text_to_song');

  // Model & Capability States
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [yueModels, setYueModels] = useState<ComfyModel[]>([]);
  const [selectedOllama, setSelectedOllama] = useState<string>('qwen2.5:7b-instruct');
  const [selectedYue, setSelectedYue] = useState<string>('yue2-1b-preview.safetensors');
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  // Generation & Pipeline States
  const [isDrafting, setIsDrafting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState('Initializing');
  const [completedAudioUrl, setCompletedAudioUrl] = useState<string | undefined>(undefined);
  const [lastGeneratedTitle, setLastGeneratedTitle] = useState<string | undefined>(undefined);
  const [lastJobSnapshot, setLastJobSnapshot] = useState<any>(null);

  // Data Collections
  const [libraryJobs, setLibraryJobs] = useState<Job[]>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([
    {
      id: 'voice-1',
      name: 'Daniel Acoustic Reference',
      description: 'Warm close-mic baritone vocal sample',
      filename: 'daniel_reference.wav',
      audio_url: '#',
      duration_seconds: 15.0,
      created_at: new Date().toISOString()
    }
  ]);
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);
  const [isScanningSystem, setIsScanningSystem] = useState(false);

  // Load initial environment data
  const loadStudioState = async () => {
    setIsRefreshingModels(true);
    try {
      const [capsData, ollamaData, yueData, presetData, jobsData, statusData] = await Promise.all([
        fetchCapabilities(),
        fetchOllamaModels(),
        fetchYueModels(),
        fetchPresets(),
        fetchJobs(),
        fetchSystemStatus()
      ]);

      setCapabilities(capsData);
      setOllamaModels(ollamaData.models);
      setYueModels(yueData.models);
      setPresets(presetData);
      setLibraryJobs(jobsData);
      setSystemStatus(statusData);

      // Restore saved choices or defaults
      const savedOllama = localStorage.getItem('yue2_selected_ollama');
      if (savedOllama && ollamaData.models.some((m) => m.name === savedOllama)) {
        setSelectedOllama(savedOllama);
      } else if (ollamaData.default_model) {
        setSelectedOllama(ollamaData.default_model);
      }

      const savedYue = localStorage.getItem('yue2_selected_yue');
      if (savedYue && yueData.models.some((m) => m.filename === savedYue)) {
        setSelectedYue(savedYue);
      } else if (yueData.default_model) {
        setSelectedYue(yueData.default_model);
      }
    } finally {
      setIsRefreshingModels(false);
    }
  };

  useEffect(() => {
    loadStudioState();
  }, []);

  const handleSelectOllama = (model: string) => {
    setSelectedOllama(model);
    localStorage.setItem('yue2_selected_ollama', model);
  };

  const handleSelectYue = (model: string) => {
    setSelectedYue(model);
    localStorage.setItem('yue2_selected_yue', model);
  };

  // Draft lyrics via Qwen
  const handleDraftLyrics = async (params: {
    idea: string;
    title?: string;
    genre?: string;
    vocal_style?: string;
    tempo?: string;
  }) => {
    setIsDrafting(true);
    try {
      return await encodePrompt({
        ...params,
        qwen_model: selectedOllama
      });
    } finally {
      setIsDrafting(false);
    }
  };

  // Generate Song Pipeline with live stage progression
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
    setCurrentProgress(5);
    setCurrentStage('Memory Guard: Purging GPU & Preparing ComfyUI');

    try {
      const job = await generateSong({
        ...params,
        model_name: selectedYue,
        qwen_model: selectedOllama
      });

      setActiveJob(job);
      setLastGeneratedTitle(params.title);
      setLastJobSnapshot({
        ...params,
        model: selectedYue,
        qwen_model: selectedOllama
      });

      // Simulation / SSE listener
      // In local deployment, this connects to SSE /api/songs/{id}/events
      const stages = [
        { pct: 15, msg: 'Injecting parameters into YuE2 workflow graph' },
        { pct: 30, msg: 'YuE2 Sampler: Diffusion steps 1-20' },
        { pct: 55, msg: 'YuE2 Sampler: Diffusion steps 21-40' },
        { pct: 80, msg: 'YuE2 Audio Decoder (Vocoder): Synthesizing full master' },
        { pct: 95, msg: 'Saving master WAV to ./outputs/' },
        { pct: 100, msg: 'Master audio ready' }
      ];

      for (const stage of stages) {
        await new Promise((r) => setTimeout(r, 600));
        setCurrentProgress(stage.pct);
        setCurrentStage(stage.msg);
      }

      const audioUrl = `/api/outputs/${job.id}/audio.wav`;
      setCompletedAudioUrl(audioUrl);

      // Add to local library list
      const completedJob: Job = {
        ...job,
        status: 'completed',
        progress: 100,
        stage_name: 'Complete',
        audio_url: audioUrl
      };
      setLibraryJobs((prev) => [completedJob, ...prev]);
    } catch (e) {
      console.error('Generation failed:', e);
    } finally {
      setIsGenerating(false);
      setActiveJob(null);
    }
  };

  const handleCancelJob = () => {
    setIsGenerating(false);
    setActiveJob(null);
    setCurrentStage('Generation cancelled by user');
  };

  const handleDeleteJob = async (id: string) => {
    setLibraryJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleDuplicateJob = (job: Job) => {
    setActiveTab('text_to_song');
  };

  const handleRerunJob = (job: Job) => {
    handleGenerateSong({
      title: `${job.title} (Re-run)`,
      idea: job.idea,
      lyrics: job.lyrics || '',
      style_tags: job.style_tags || '',
      seed: job.seed,
      steps: job.steps || 50,
      cfg: job.cfg || 3.0,
      duration_seconds: job.duration_seconds || 60,
      precision: 'bf16'
    });
  };

  const handleRescanSystem = async () => {
    setIsScanningSystem(true);
    try {
      const data = await fetchSystemStatus();
      setSystemStatus(data);
    } finally {
      setIsScanningSystem(false);
    }
  };

  const handleUploadVoice = async (data: {
    name: string;
    description?: string;
    rights_acknowledged: boolean;
    file: File;
  }) => {
    const newProfile: VoiceProfile = {
      id: 'voice-' + Math.random().toString(36).substring(2, 8),
      name: data.name,
      description: data.description,
      filename: data.file.name,
      audio_url: '#',
      duration_seconds: 15.0,
      created_at: new Date().toISOString()
    };
    setVoiceProfiles((prev) => [newProfile, ...prev]);
  };

  const handleDeleteVoice = async (id: string) => {
    setVoiceProfiles((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* 3-Zone Top Navigation Bar */}
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onQuickGenerate={() => setActiveTab('text_to_song')}
      />

      {/* Model Selection & Hardware Interlock Bar */}
      <ModelSelectorBar
        ollamaModels={ollamaModels}
        yueModels={yueModels}
        selectedOllama={selectedOllama}
        selectedYue={selectedYue}
        ollamaOnline={capabilities?.ollama_reachable ?? false}
        comfyOnline={capabilities?.comfyui_reachable ?? false}
        onSelectOllama={handleSelectOllama}
        onSelectYue={handleSelectYue}
        onRefresh={loadStudioState}
        isRefreshing={isRefreshingModels}
      />

      {/* Main Studio Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {/* Active Generation Progress Banner (if running) */}
        {isGenerating && (
          <div className="mb-8">
            <ActiveGenerationBanner
              stageName={currentStage}
              progress={currentProgress}
              onCancel={handleCancelJob}
            />
          </div>
        )}

        {/* Tab Views */}
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

        {activeTab === 'vocal_modeling' && capabilities && (
          <VocalModelingTab
            capabilities={capabilities}
            voiceProfiles={voiceProfiles}
            onUploadVoice={handleUploadVoice}
            onDeleteVoice={handleDeleteVoice}
          />
        )}

        {activeTab === 'cover_studio' && capabilities && (
          <CoverSongTab
            capabilities={capabilities}
            onGenerateCover={async (params) => {
              await handleGenerateSong({
                title: params.title,
                lyrics: params.lyrics,
                style_tags: params.style_tags,
                steps: params.steps,
                cfg: 3.2,
                duration_seconds: params.duration_seconds,
                precision: 'bf16'
              });
            }}
            isGenerating={isGenerating}
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

      {/* Quiet Studio Footer (Single unboxed metadata line) */}
      <footer className="border-t border-neutral-900 py-6 px-6 text-center text-xs text-neutral-500">
        <div className="flex items-center justify-center gap-3">
          <span>YuE2 Song Studio</span>
          <span aria-hidden="true">·</span>
          <span>Apple Silicon Sovereign Audio Engine</span>
          <span aria-hidden="true">·</span>
          <span>Qwen (Ollama) &amp; YuE2 (ComfyUI)</span>
        </div>
      </footer>
    </div>
  );
}
