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
  engine?: string;
  mlx_available?: boolean;
  mlx_detail?: string;
  unified_memory_available_gb?: number;
  default_ollama_model?: string;
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
  status: 'queued' | 'preparing' | 'planning' | 'generating' | 'rendering' | 'completed' | 'failed' | 'cancelled';
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
  abc_url?: string;
  score_meta?: { title?: string | null; key?: string | null; bpm?: string | null } | null;
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

export type AudioFormatId = 'wav' | 'aiff' | 'flac' | 'alac' | 'mp3' | 'aac' | 'ogg' | 'opus';

export interface AudioFormatOption {
  id: AudioFormatId;
  name: string;
  fullName: string;
  extension: string;
  isLossless: boolean;
  tag: string;
}

export interface EncoderOptions {
  format: AudioFormatId;
  sampleRate: 44100 | 48000 | 96000;
  bitDepth: 16 | 24 | 32;
  bitrateKbps: 128 | 192 | 256 | 320;
  channels: 1 | 2;
}
