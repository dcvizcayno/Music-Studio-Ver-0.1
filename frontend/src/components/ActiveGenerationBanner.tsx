import React, { useEffect, useState } from 'react';
import { Loader2, XCircle, ShieldAlert } from 'lucide-react';

interface ActiveGenerationBannerProps {
  stageName: string;
  progress: number;
  onCancel: () => void;
  isCancelling?: boolean;
}

export const ActiveGenerationBanner: React.FC<ActiveGenerationBannerProps> = ({
  stageName,
  progress,
  onCancel,
  isCancelling
}) => {
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const elapsedLabel = `${minutes}m ${String(seconds).padStart(2, '0')}s`;

  return (
    <div className="bg-neutral-900 border border-amber-500/30 rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between gap-4 mb-2.5">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
          <div>
            <div className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
              <span>Generating Audio with YuE2</span>
              <span className="text-xs text-amber-400 font-mono tabular-nums">({progress}%)</span>
            </div>
            <p className="text-xs text-neutral-400 font-mono mt-0.5">{stageName}</p>
          </div>
        </div>

        <button
          onClick={onCancel}
          disabled={isCancelling}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-300 hover:text-red-200 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 rounded-lg transition-colors disabled:opacity-50"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>{isCancelling ? 'Aborting...' : 'Interrupt Job'}</span>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800">
        <div
          className="bg-amber-400 h-full transition-all duration-300 ease-out"
          style={{ width: `${Math.max(5, progress)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-neutral-500 mt-2">
        <span className="flex items-center gap-1 text-neutral-400">
          <ShieldAlert className="w-3 h-3 text-amber-400" />
          <span>Single-heavy-task exclusivity locked (Memory Guard)</span>
        </span>
        <span className="flex items-center gap-2 font-mono">
          <span>Elapsed ({elapsedLabel})</span>
          <span aria-hidden="true" className="text-neutral-700">·</span>
          <span>mlx-Yue progress stream</span>
        </span>
      </div>
    </div>
  );
};
