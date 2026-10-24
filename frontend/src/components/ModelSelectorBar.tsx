import React, { useEffect, useState } from 'react';
import { RefreshCw, Cpu, Music2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { ComfyModel, OllamaModel } from '../types';

interface ModelSelectorBarProps {
  ollamaModels: OllamaModel[];
  yueModels: ComfyModel[];
  selectedOllama: string;
  selectedYue: string;
  ollamaOnline: boolean;
  comfyOnline: boolean;
  onSelectOllama: (model: string) => void;
  onSelectYue: (model: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const ModelSelectorBar: React.FC<ModelSelectorBarProps> = ({
  ollamaModels,
  yueModels,
  selectedOllama,
  selectedYue,
  ollamaOnline,
  comfyOnline,
  onSelectOllama,
  onSelectYue,
  onRefresh,
  isRefreshing
}) => {
  const currentOllamaObj = ollamaModels.find((m) => m.name === selectedOllama);
  const exceedsSizeWarning = currentOllamaObj?.exceeds_recommended_size || (currentOllamaObj?.parameter_size_b && currentOllamaObj.parameter_size_b > 14);

  return (
    <div className="bg-neutral-900 border-b border-neutral-800 px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Left: Model Dropdowns */}
        <div className="flex flex-wrap items-center gap-6">
          {/* Ollama LLM Picker */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium whitespace-nowrap">
              <Cpu className="w-4 h-4 text-amber-400" />
              <span>Lyric LLM (Ollama)</span>
            </div>
            <div className="relative">
              <select
                value={selectedOllama}
                onChange={(e) => onSelectOllama(e.target.value)}
                className="bg-neutral-950 border border-neutral-700 text-neutral-100 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer pr-8 font-mono"
              >
                {ollamaModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} {m.size_formatted ? `(${m.size_formatted})` : ''} {m.is_recommended ? '★ Recommended' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* YuE2 Music Checkpoint Picker */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium whitespace-nowrap">
              <Music2 className="w-4 h-4 text-emerald-400" />
              <span>Music Engine (MLX)</span>
            </div>
            <div className="relative">
              <select
                value={selectedYue}
                onChange={(e) => onSelectYue(e.target.value)}
                className="bg-neutral-950 border border-neutral-700 text-neutral-100 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer pr-8 font-mono"
              >
                {yueModels.map((m) => (
                  <option key={m.filename} value={m.filename}>
                    {m.filename} {m.variant ? `— ${m.variant}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right: Service Status and Refresh */}
        <div className="flex items-center gap-4 text-xs">
          {/* Ollama Status */}
          <div className="flex items-center gap-1.5 text-neutral-400">
            {ollamaOnline ? (
              <span className="text-emerald-400 font-medium">Ollama: Ready (11434)</span>
            ) : (
              <span className="text-neutral-500">Ollama: Offline</span>
            )}
            <span aria-hidden="true" className="text-neutral-700">·</span>
            {comfyOnline ? (
              <span className="text-emerald-400 font-medium">MLX: Ready</span>
            ) : (
              <span className="text-neutral-500">MLX: Not ready</span>
            )}
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
            title="Scan live Ollama tags and the MLX engine"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Model Size Warning Banner if > 14B on 24GB Unified Memory */}
      {exceedsSizeWarning && (
        <div className="max-w-7xl mx-auto mt-2.5 flex items-center gap-2 p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Memory Warning:</strong> {selectedOllama} is larger than 8B parameters.
            On Apple Silicon 24GB unified memory, Qwen models over 8B may cause memory pressure during YuE2 music synthesis.
            The memory manager will force-unload the LLM before music generation.
          </span>
        </div>
      )}
    </div>
  );
};
