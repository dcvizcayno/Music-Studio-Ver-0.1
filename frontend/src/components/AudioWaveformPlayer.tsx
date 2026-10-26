import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Download,
  Volume2,
  RotateCcw,
  Sliders,
  FileAudio,
  Check,
  Settings2,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { AudioFormatId, EncoderOptions } from '../types';
import {
  SUPPORTED_AUDIO_FORMATS,
  downloadTranscodedAudio
} from '../services/audioEncoder';

interface AudioWaveformPlayerProps {
  audioUrl?: string;
  title: string;
  settingsSnapshot?: any;
  jobId?: string;
  fileSizeBytes?: number | null;
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const AudioWaveformPlayer: React.FC<AudioWaveformPlayerProps> = ({
  audioUrl,
  title,
  settingsSnapshot,
  jobId: propJobId,
  fileSizeBytes
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showEncoderOptions, setShowEncoderOptions] = useState(false);

  // File Name & Encoder Configuration States
  const [customFileName, setCustomFileName] = useState(() => sanitizeFileName(title) || 'song_master');
  const [selectedFormat, setSelectedFormat] = useState<AudioFormatId>('wav');
  const [sampleRate, setSampleRate] = useState<44100 | 48000 | 96000>(44100);
  const [bitDepth, setBitDepth] = useState<16 | 24 | 32>(16);
  const [bitrateKbps, setBitrateKbps] = useState<128 | 192 | 256 | 320>(320);
  const [channels, setChannels] = useState<1 | 2>(2);

  const [isEncoding, setIsEncoding] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);

  // Sync default file name when title prop changes
  useEffect(() => {
    setCustomFileName(sanitizeFileName(title) || 'song_master');
  }, [title]);

  // Try extracting job ID from settings or audioUrl if not passed directly
  const extractedJobId = propJobId || (
    audioUrl?.match(/\/outputs\/([a-zA-Z0-9_\-]+)\//)?.[1] ||
    settingsSnapshot?.job_id ||
    settingsSnapshot?.id
  );

  const currentFormatConfig = SUPPORTED_AUDIO_FORMATS.find((f) => f.id === selectedFormat) || SUPPORTED_AUDIO_FORMATS[0];
  const isLosslessFormat = currentFormatConfig.isLossless;

  const formattedBytes = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };
  const estimatedBytes = (() => {
    if (selectedFormat === 'flac' && fileSizeBytes) return fileSizeBytes;
    if (!duration) return selectedFormat === 'flac' ? fileSizeBytes : null;
    if (selectedFormat === 'wav' || selectedFormat === 'aiff') {
      return duration * sampleRate * (bitDepth / 8) * channels;
    }
    if (selectedFormat === 'alac') {
      return fileSizeBytes ? fileSizeBytes * 0.7 : null;
    }
    return duration * (bitrateKbps * 1000 / 8);
  })();

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

  const handleExecuteDownload = async () => {
    if (!audioUrl || audioUrl === '#') return;

    setIsEncoding(true);
    const encoderOpts: EncoderOptions = {
      format: selectedFormat,
      sampleRate,
      bitDepth,
      bitrateKbps,
      channels
    };

    try {
      await downloadTranscodedAudio(
        audioUrl,
        customFileName || sanitizeFileName(title) || 'song_master',
        encoderOpts,
        extractedJobId
      );
      setIsDownloaded(true);
      setTimeout(() => setIsDownloaded(false), 2500);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsEncoding(false);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Track Info Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
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
              className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
              title="Inspect Workflow Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}
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
      <div className="flex items-center justify-between text-xs text-neutral-400 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 transition-colors shadow-sm cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.currentTime = 0;
            }}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
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

      {/* File Name Option Box & Audio Encoder Controls */}
      <div className="pt-3.5 border-t border-neutral-800/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-medium select-none">
              <FileAudio className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Export Audio File:</span>
            </div>

            <button
              onClick={() => setShowEncoderOptions(!showEncoderOptions)}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors cursor-pointer ${
                showEncoderOptions
                  ? 'border-amber-500/40 text-amber-300 bg-amber-950/20'
                  : 'border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
              title="Configure sample rate, bit depth, or bitrate"
            >
              <Settings2 className="w-3 h-3" />
              <span>Encoder Options</span>
              {showEncoderOptions ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
            </button>
          </div>

          {/* Inline Filename Input, Format Picker, and Download Button */}
          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl justify-end">
            {/* Filename Input Box */}
            <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden focus-within:border-amber-500 transition-colors">
              <input
                type="text"
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                placeholder="filename..."
                aria-label="Download File Name"
                className="bg-transparent text-xs text-neutral-100 font-mono px-3 py-1.5 w-36 sm:w-48 focus:outline-none placeholder-neutral-600"
                title="Edit download file name"
              />

              {/* Format Dropdown with All 8 Codecs */}
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value as AudioFormatId)}
                aria-label="Select Audio Format"
                className="bg-neutral-900 border-l border-neutral-800 text-xs text-neutral-200 font-mono px-2.5 py-1.5 cursor-pointer focus:outline-none hover:text-white"
                title="Select export audio codec format"
              >
                {SUPPORTED_AUDIO_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.extension})
                  </option>
                ))}
              </select>
            </div>

            {/* Execute Download Button */}
            <button
              onClick={handleExecuteDownload}
              disabled={!audioUrl || isEncoding}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shadow-sm cursor-pointer disabled:opacity-50 ${
                isDownloaded
                  ? 'bg-emerald-500 text-neutral-950'
                  : 'bg-amber-400 hover:bg-amber-300 text-neutral-950'
              }`}
              title={`Download as ${customFileName || 'song'}${currentFormatConfig.extension}`}
            >
              {isEncoding ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Encoding...</span>
                </>
              ) : isDownloaded ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download {currentFormatConfig.name}</span>
                </>
              )}
            </button>
            <span className="text-[10px] text-neutral-500 font-mono" title="Estimated export size for the selected format">
              {estimatedBytes ? `${selectedFormat === 'flac' ? '' : '≈ '}${formattedBytes(estimatedBytes)}` : '—'}
            </span>
          </div>
        </div>

        {/* Target Preview Tag Line */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-neutral-500 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">{currentFormatConfig.fullName}</span>
            <span aria-hidden="true">·</span>
            <span className={isLosslessFormat ? 'text-emerald-400/90' : 'text-amber-400/90'}>
              {currentFormatConfig.tag}
            </span>
          </div>

          <div className="font-mono text-neutral-400">
            Preview: <span className="text-neutral-200">{customFileName || 'song_master'}{currentFormatConfig.extension}</span>
          </div>
        </div>

        {/* Collapsible Encoder Options Panel */}
        {showEncoderOptions && (
          <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs space-y-3 mt-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <span className="font-medium text-neutral-200">
                Encoder Settings for {currentFormatConfig.name}
              </span>
              <span className="text-[11px] text-neutral-500 font-mono">
                {isLosslessFormat ? 'Lossless Master Fidelity' : 'Lossy Perceptual Codec'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Sample Rate */}
              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Sample Rate</label>
                <select
                  value={sampleRate}
                  onChange={(e) => setSampleRate(parseInt(e.target.value) as 44100 | 48000 | 96000)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer font-mono"
                >
                  <option value={44100}>44.1 kHz (CD Standard)</option>
                  <option value={48000}>48.0 kHz (Broadcast / Studio)</option>
                  <option value={96000}>96.0 kHz (Hi-Res Audio)</option>
                </select>
              </div>

              {/* Bit Depth or Bitrate depending on Lossless vs Lossy */}
              {isLosslessFormat ? (
                <div>
                  <label className="block text-neutral-400 mb-1 font-medium">Bit Depth</label>
                  <select
                    value={bitDepth}
                    onChange={(e) => setBitDepth(parseInt(e.target.value) as 16 | 24 | 32)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer font-mono"
                  >
                    <option value={16}>16-bit (Standard Audio)</option>
                    <option value={24}>24-bit (Studio Master)</option>
                    <option value={32}>32-bit (Float Precision)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-neutral-400 mb-1 font-medium">Bitrate</label>
                  <select
                    value={bitrateKbps}
                    onChange={(e) => setBitrateKbps(parseInt(e.target.value) as 128 | 192 | 256 | 320)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer font-mono"
                  >
                    <option value={128}>128 kbps (Voice / Draft)</option>
                    <option value={192}>192 kbps (Standard Quality)</option>
                    <option value={256}>256 kbps (High Fidelity)</option>
                    <option value={320}>320 kbps (Maximum Bitrate)</option>
                  </select>
                </div>
              )}

              {/* Channels */}
              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Audio Channels</label>
                <select
                  value={channels}
                  onChange={(e) => setChannels(parseInt(e.target.value) as 1 | 2)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer font-mono"
                >
                  <option value={2}>Stereo (2 Channels)</option>
                  <option value={1}>Mono (1 Channel)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-neutral-100 mb-2">Generation Settings & Workflow Snapshot</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Exact configuration used for synthesizing this audio artifact with mlx-Yue.
            </p>
            <pre className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-neutral-300 max-h-72 overflow-y-auto mb-4">
              {JSON.stringify(settingsSnapshot, null, 2)}
            </pre>
            <div className="flex justify-end">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
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
