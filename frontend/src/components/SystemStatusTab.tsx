import React from 'react';
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Info, HardDrive, Cpu, Terminal } from 'lucide-react';
import { DoctorCheck, SystemStatusData } from '../types';

interface SystemStatusTabProps {
  statusData: SystemStatusData;
  onRescan: () => void;
  isScanning: boolean;
}

export const SystemStatusTab: React.FC<SystemStatusTabProps> = ({
  statusData,
  onRescan,
  isScanning
}) => {
  const getStatusBadge = (status: DoctorCheck['status']) => {
    switch (status) {
      case 'PASS':
        return (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>PASS</span>
          </span>
        );
      case 'WARN':
        return (
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>WARN</span>
          </span>
        );
      case 'FAIL':
        return (
          <span className="flex items-center gap-1 text-xs font-semibold text-red-400">
            <XCircle className="w-3.5 h-3.5" />
            <span>FAIL</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-blue-400">
            <Info className="w-3.5 h-3.5" />
            <span>INFO</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Health Overview Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-semibold text-neutral-100">System Doctor & Health Diagnostics</h3>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Real-time checks evaluating Apple Silicon hardware, unified RAM, Ollama, ComfyUI, and workflow integrity.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onRescan}
              disabled={isScanning}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Probing System...' : 'Re-scan & Run Diagnostics'}</span>
            </button>
          </div>
        </div>

        {/* Hardware Telemetry Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-neutral-800/80">
          <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800">
            <span className="text-[11px] text-neutral-400 font-medium block mb-1">Target Unified Memory</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tabular-nums text-neutral-100">24.0 GB</span>
              <span className="text-xs text-neutral-400">(~16 GB GPU limit)</span>
            </div>
          </div>

          <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800">
            <span className="text-[11px] text-neutral-400 font-medium block mb-1">Available Headroom</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tabular-nums text-emerald-400">
                {statusData.memory_headroom_gb} GB
              </span>
              <span className="text-xs text-neutral-400">Unallocated</span>
            </div>
          </div>

          <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800">
            <span className="text-[11px] text-neutral-400 font-medium block mb-1">Active Heavy Tasks</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tabular-nums text-neutral-100">
                {statusData.active_jobs_count} / 1 Max
              </span>
              <span className="text-xs text-neutral-400">Exclusive Lock</span>
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics Table matching doctor.sh */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-neutral-200">Doctor Diagnostic Verification Table</h4>
          <span className="text-xs text-neutral-400 font-mono">
            Last checked: {new Date(statusData.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <div className="divide-y divide-neutral-800">
          {statusData.checks.map((check, idx) => (
            <div key={idx} className="p-4 hover:bg-neutral-850/50 transition-colors">
              <div className="flex items-center justify-between gap-4 mb-1">
                <span className="text-xs font-semibold text-neutral-200">{check.name}</span>
                {getStatusBadge(check.status)}
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{check.detail}</p>
              {check.fix && check.fix !== 'None' && (
                <div className="mt-2 text-xs bg-neutral-950/80 border border-neutral-800 rounded px-2.5 py-1.5 flex items-center gap-2 text-neutral-300 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Fix: {check.fix}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
