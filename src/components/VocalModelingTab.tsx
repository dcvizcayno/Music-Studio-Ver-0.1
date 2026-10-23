import React, { useState } from 'react';
import { Mic, Upload, ShieldCheck, AlertCircle, Trash2, Play, Pause } from 'lucide-react';
import { Capabilities, VoiceProfile } from '../types';

interface VocalModelingTabProps {
  capabilities: Capabilities;
  voiceProfiles: VoiceProfile[];
  onUploadVoice: (data: {
    name: string;
    description?: string;
    rights_acknowledged: boolean;
    file: File;
  }) => Promise<void>;
  onDeleteVoice: (id: string) => Promise<void>;
}

export const VocalModelingTab: React.FC<VocalModelingTabProps> = ({
  capabilities,
  voiceProfiles,
  onUploadVoice,
  onDeleteVoice
}) => {
  const isSupported = capabilities.reference_audio_supported;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [trimRange, setTrimRange] = useState<number>(15);
  const [isUploading, setIsUploading] = useState(false);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedFile || !rightsConfirmed) return;

    setIsUploading(true);
    try {
      await onUploadVoice({
        name,
        description,
        rights_acknowledged: rightsConfirmed,
        file: selectedFile
      });
      setName('');
      setDescription('');
      setSelectedFile(null);
      setRightsConfirmed(false);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Capability Notification Banner if Unsupported */}
      {!isSupported && (
        <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-200">
              Vocal Reference Nodes Not Detected in ComfyUI
            </h4>
            <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
              Step 0 capability verification inspected your ComfyUI <code>/object_info</code> registry and found that
              the custom audio conditioning nodes (e.g. <code>LoadAudio</code>, <code>YuE2VoiceConditioning</code>) are
              not currently registered. You can still save and organize vocal reference audio files here, but audio-conditioned
              timbre cloning will be inactive in ComfyUI until you install the corresponding custom nodes.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Upload & Create Form (7 cols) */}
        <div className="md:col-span-7 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Mic className="w-4 h-4 text-amber-400" />
            <h3 className="text-base font-semibold text-neutral-100">Upload Reference Vocal Sample</h3>
          </div>
          <p className="text-xs text-neutral-400 mb-5">
            YuE2 analyzes short, clear vocal recordings (10–30 seconds) to condition singer timbre and resonant tone.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Voice Profile Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Daniel Lead Vocal (Acoustic)"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Description / Vocal Notes</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Close-mic condenser, warm lower register, baritone"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Audio File Input */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Audio Recording (WAV, MP3, FLAC)</label>
              <div className="border border-dashed border-neutral-700 hover:border-neutral-500 rounded-lg p-4 text-center cursor-pointer bg-neutral-950/60 relative">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Upload className="w-5 h-5 text-neutral-400 mx-auto mb-1" />
                <span className="text-xs text-neutral-300">
                  {selectedFile ? selectedFile.name : 'Choose an audio file or drag & drop here'}
                </span>
                <span className="block text-[11px] text-neutral-500 mt-0.5">Clean vocal acapella recommended (max 25MB)</span>
              </div>
            </div>

            {/* Sample Trim Slider */}
            {selectedFile && (
              <div>
                <div className="flex items-center justify-between text-xs text-neutral-300 mb-1">
                  <label>Clip Window Length</label>
                  <span className="font-mono tabular-nums text-neutral-400">{trimRange} seconds</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="1"
                  value={trimRange}
                  onChange={(e) => setTrimRange(parseInt(e.target.value))}
                  className="w-full accent-amber-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {/* Mandatory Rights Notice */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Vocal Rights & Legal Affirmation</span>
              </div>
              <label className="flex items-start gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(e) => setRightsConfirmed(e.target.checked)}
                  className="mt-0.5 accent-amber-500 rounded"
                />
                <span className="leading-relaxed">
                  I certify that this vocal recording is of my own voice, or I have obtained explicit, legally binding permission
                  from the artist to clone and condition this vocal timbre for musical generation.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isUploading || !name.trim() || !selectedFile || !rightsConfirmed}
              className="w-full py-2.5 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              {isUploading ? 'Saving Voice Profile...' : 'Save Voice Profile'}
            </button>
          </form>
        </div>

        {/* Existing Profiles List (5 cols) */}
        <div className="md:col-span-5 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h3 className="text-base font-semibold text-neutral-100 mb-1">Saved Voice Profiles</h3>
          <p className="text-xs text-neutral-400 mb-4">
            Profiles available for conditioning in generation workflows.
          </p>

          {voiceProfiles.length === 0 ? (
            <div className="text-center py-10 text-neutral-500 text-xs border border-dashed border-neutral-800 rounded-lg">
              No vocal profiles saved yet. Upload your first vocal sample on the left.
            </div>
          ) : (
            <div className="space-y-3">
              {voiceProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="p-3 bg-neutral-950 border border-neutral-800/80 rounded-lg flex items-center justify-between gap-3"
                >
                  <div className="truncate">
                    <h5 className="text-xs font-semibold text-neutral-200 truncate">{profile.name}</h5>
                    {profile.description && (
                      <p className="text-[11px] text-neutral-400 truncate">{profile.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-neutral-500 mt-1">
                      <span>{profile.filename}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{profile.duration_seconds}s</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onDeleteVoice(profile.id)}
                      className="p-1.5 text-neutral-500 hover:text-red-400 transition-colors"
                      title="Delete Profile"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
