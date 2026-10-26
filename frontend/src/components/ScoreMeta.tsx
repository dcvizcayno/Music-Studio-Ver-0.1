import React from 'react';
import { CalendarDays, Gauge, Music2, KeyRound } from 'lucide-react';
import { ScoreMeta as ScoreMetaType } from '../utils/scoreMeta';

interface ScoreMetaProps {
  meta: ScoreMetaType;
}

export const ScoreMeta: React.FC<ScoreMetaProps> = ({ meta }) => (
  <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3 sm:grid-cols-4">
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
        <Music2 className="h-3 w-3" /> Song Title
      </div>
      <div className="mt-0.5 truncate text-xs font-medium text-neutral-200" title={meta.title}>{meta.title}</div>
    </div>
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
        <CalendarDays className="h-3 w-3" /> Date Written
      </div>
      <div className="mt-0.5 text-xs font-medium text-neutral-200">{meta.date}</div>
    </div>
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
        <Gauge className="h-3 w-3" /> BPM
      </div>
      <div className="mt-0.5 font-mono text-xs font-medium text-amber-300">{meta.bpm}</div>
    </div>
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
        <KeyRound className="h-3 w-3" /> Key
      </div>
      <div className="mt-0.5 font-mono text-xs font-medium text-amber-300">{meta.key}</div>
    </div>
  </div>
);
