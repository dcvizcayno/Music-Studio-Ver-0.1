/**
 * Typed API client. Every failure is surfaced; there are no mock fallbacks.
 */

import { Capabilities, ComfyModel, Job, OllamaModel, Preset, SystemStatusData } from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || body.error || detail;
    } catch {
      // keep status text
    }
    throw new ApiError(String(detail), response.status);
  }
  return (await response.json()) as T;
}

export async function fetchCapabilities(): Promise<Capabilities> {
  return request<Capabilities>('/capabilities');
}

export async function fetchOllamaModels(): Promise<{ reachable: boolean; models: OllamaModel[]; default_model: string }> {
  return request('/models/ollama');
}

export async function fetchYueModels(): Promise<{ reachable: boolean; models: ComfyModel[]; default_model: string; error?: string }> {
  return request('/models/yue');
}

export async function fetchPresets(): Promise<Preset[]> {
  return request<Preset[]>('/settings/presets');
}

export async function fetchJobs(): Promise<Job[]> {
  const data = await request<{ jobs: Job[] }>('/jobs');
  return data.jobs || [];
}

export async function fetchJob(jobId: string): Promise<Job> {
  return request<Job>(`/songs/${jobId}`);
}

export async function fetchJobAbc(jobId: string): Promise<string> {
  const response = await fetch(`${API_BASE}/songs/${jobId}/abc`);
  if (!response.ok) {
    throw new ApiError(`No ABC score (HTTP ${response.status})`, response.status);
  }
  return response.text();
}

export async function fetchSystemStatus(): Promise<SystemStatusData> {
  return request<SystemStatusData>('/status');
}

export interface DraftResult {
  title: string;
  lyrics: string;
  style_tags: string;
  writing_note: string;
  genre: string;
  mood: string;
  tempo_bpm: number;
  vocal_type: string;
  character_count: number;
  banned_words_found: string[];
  has_em_dash: boolean;
}

export async function encodePrompt(params: {
  idea: string;
  title?: string;
  genre?: string;
  vocal_style?: string;
  tempo?: string;
  language?: string;
  qwen_model?: string;
}) {
  return request<DraftResult>('/prompt/encode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(180000),
  });
}

export async function generateSong(payload: {
  title: string;
  idea?: string;
  lyrics: string;
  style_tags: string;
  seed?: number;
  steps: number;
  cfg: number;
  duration_seconds: number;
  precision: string;
  cot?: 'full' | 'off';
  qwen_model?: string;
}): Promise<Job> {
  return request<Job>('/songs/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
}

export async function generateCover(form: FormData): Promise<Job> {
  return request<Job>('/songs/cover', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30000),
  });
}

export async function cancelJob(jobId: string): Promise<void> {
  await request(`/songs/${jobId}/cancel`, { method: 'POST' });
}

export async function deleteJob(jobId: string): Promise<void> {
  await request(`/jobs/${jobId}`, { method: 'DELETE' });
}

export function downloadUrl(jobId: string, format: string): string {
  return `${API_BASE}/audio/download/${jobId}?format=${encodeURIComponent(format)}`;
}
