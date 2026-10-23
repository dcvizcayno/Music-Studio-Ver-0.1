import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Download, Volume2, RotateCcw, Sliders } from 'lucide-react';

interface AudioWaveformPlayerProps {
  audioUrl?: string;
  title: string;
  settingsSnapshot?: any;
}

export const AudioWaveformPlayer: React.FC<AudioWaveformPlayerProps> = ({
  audioUrl,
  title,
  settingsSnapshot
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Generate synthetic waveform peaks for visual presentation
  const peaks = useRef<number[]>(
    Array.from({ length: 64 }, () => Math.max(0.15, Math.sin(Math.random() * Math.PI) * 0.85 + Math.random() * 0.15))
  ).current;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 60);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {
        // Autoplay policy or no source
      });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const seekTime = Math.max(0, Math.min(duration, pos * duration));
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h4 className="text-base font-semibold text-neutral-100 truncate">{title}</h4>
          <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
            <span>YuE2 Master Output</span>
            <span aria-hidden="true">·</span>
            <span>44.1 kHz 16-bit WAV</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{formatTime(duration || 60)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {settingsSnapshot && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
              title="Inspect Workflow Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}

          <a
            href={audioUrl || '#'}
            download={`${title.toLowerCase().replace(/\s+/g, '_')}.wav`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download WAV</span>
          </a>
        </div>
      </div>

      {/* Interactive Waveform Visualizer */}
      <div
        onClick={handleSeek}
        className="relative h-16 bg-neutral-950/70 border border-neutral-800/80 rounded-lg px-2 flex items-center justify-between gap-1 cursor-pointer overflow-hidden group mb-3"
      >
        {/* Progress Fill Overlay */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-amber-500/10 border-r border-amber-500/50 pointer-events-none transition-all duration-75"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Waveform Bars */}
        {peaks.map((height, i) => {
          const barPercent = (i / peaks.length) * 100;
          const isPassed = barPercent <= progressPercent;
          return (
            <div
              key={i}
              className={`w-1 rounded-full transition-colors duration-150 ${
                isPassed ? 'bg-amber-400' : 'bg-neutral-700 group-hover:bg-neutral-600'
              }`}
              style={{ height: `${height * 100}%` }}
            />
          );
        })}
      </div>

      {/* Playback Controls & Time */}
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 transition-colors shadow-sm"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.currentTime = 0;
            }}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors"
            title="Restart"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <span className="font-mono tabular-nums text-neutral-300">
            {formatTime(currentTime)} / {formatTime(duration || 60)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-neutral-400" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setVolume(val);
              if (audioRef.current) audioRef.current.volume = val;
            }}
            className="w-20 accent-amber-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-neutral-100 mb-2">Generation Settings & Workflow Snapshot</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Exact configuration used for synthesizing this audio artifact in ComfyUI.
            </p>
            <pre className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-neutral-300 max-h-72 overflow-y-auto mb-4">
              {JSON.stringify(settingsSnapshot, null, 2)}
            </pre>
            <div className="flex justify-end">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
