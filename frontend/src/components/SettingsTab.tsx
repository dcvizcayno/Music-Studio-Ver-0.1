import React, { useEffect, useState } from 'react';
import { Sliders, RefreshCw, Cpu, HardDrive, ShieldCheck } from 'lucide-react';
import { Capabilities } from '../types';
import { fetchCapabilities } from '../services/api';

export const SettingsTab: React.FC = () => {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCaps(await fetchCapabilities());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = [
    ['Engine', caps?.engine === 'mlx' ? 'mlx-Yue · MLX / Metal' : 'unknown'],
    ['Model', caps?.detected_models?.[0] || 'YuE2-3B'],
    ['Precision', '8-bit AR · bf16 NAR'],
    ['NAR steps', '8 draft · 16 standard · 32 final'],
    ['Memory budget', '14 GB (single heavy job)'],
    ['Ollama', caps?.ollama_reachable ? 'reachable at 127.0.0.1:11434' : 'offline'],
    ['Lyric model', caps?.default_ollama_model || 'qwen-fast:latest'],
    ['Server', '127.0.0.1:8000 · local only'],
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-base font-semibold text-neutral-100">Studio configuration</h3>
              <p className="mt-0.5 text-xs text-neutral-400">
                Runtime is configured in <code className="text-neutral-300">.env</code>; restart the backend after changes.
              </p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-xs text-red-200">{error}</div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
              <div className="mt-1 break-words font-mono text-xs text-neutral-200">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <Cpu className="mb-2 h-4 w-4 text-emerald-400" />
          <div className="text-xs font-semibold text-neutral-200">Apple Silicon</div>
          <p className="mt-1 text-[11px] text-neutral-500">MLX runs on the Metal GPU with unified memory.</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <HardDrive className="mb-2 h-4 w-4 text-emerald-400" />
          <div className="text-xs font-semibold text-neutral-200">Local artifacts</div>
          <p className="mt-1 text-[11px] text-neutral-500">Models, outputs, uploads and the SQLite database stay on this Mac.</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <ShieldCheck className="mb-2 h-4 w-4 text-emerald-400" />
          <div className="text-xs font-semibold text-neutral-200">License</div>
          <p className="mt-1 text-[11px] text-neutral-500">YuE2 weights are CC BY-NC 4.0; commercial use needs a license.</p>
        </div>
      </div>
    </div>
  );
};
