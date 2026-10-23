export interface OllamaModel {
  name: string;
  size_bytes: number;
  size_formatted: string;
  parameter_size_b?: number | null;
  is_qwen: boolean;
  is_recommended: boolean;
  exceeds_recommended_size: boolean;
}

export interface ComfyModel {
  filename: string;
  size_bytes?: number;
  is_yue2: boolean;
  variant?: string;
}

export interface Capabilities {
  comfyui_reachable: boolean;
  ollama_reachable: boolean;
  comfyui_version: string;
  text_to_song_supported: boolean;
  reference_audio_supported: boolean;
  cover_conditioning_supported: boolean;
  precision_options: string[];
  detected_yue_nodes: string[];
  missing_nodes: string[];
  detected_models: string[];
  unified_memory_total_gb: number;
  last_probed_at?: string | null;
  status_summary: string;
}

export interface Preset {
  id: string;
  name: string;
  genre: string;
  instruments: string;
  mood: string;
  vocal_type: string;
  tempo_bpm: number;
  steps: number;
  cfg: number;
  duration_seconds: number;
}

export interface VoiceProfile {
  id: string;
  name: string;
  description?: string;
  filename: string;
  audio_url: string;
  duration_seconds: number;
  created_at: string;
}

export interface Job {
  id: string;
  title: string;
  type: 'text_to_song' | 'cover' | 'voice_clone';
  status: 'queued' | 'encoding_prompt' | 'freeing_memory' | 'submitting_comfyui' | 'generating' | 'fetching_audio' | 'completed' | 'failed' | 'cancelled';
  idea?: string;
  lyrics?: string;
  style_tags?: string;
  model_name?: string;
  qwen_model?: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  duration_seconds?: number;
  progress: number;
  stage_name: string;
  audio_url?: string;
  error_message?: string;
  workflow_snapshot?: any;
  created_at: string;
  updated_at: string;
}

export interface DoctorCheck {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'INFO';
  detail: string;
  fix?: string;
}

export interface SystemStatusData {
  timestamp: string;
  checks: DoctorCheck[];
  overall_health: 'healthy' | 'degraded' | 'critical';
  memory_headroom_gb: number;
  active_jobs_count: number;
}
