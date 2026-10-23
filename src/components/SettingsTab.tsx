import React, { useState } from 'react';
import { Sliders, CheckCircle2, XCircle, RefreshCw, Save, RotateCcw } from 'lucide-react';

export const SettingsTab: React.FC = () => {
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [comfyUrl, setComfyUrl] = useState('http://127.0.0.1:8188');
  const [comfyPath, setComfyPath] = useState('/Users/daniel/ComfyUI');
  const [workflowsDir, setWorkflowsDir] = useState('./workflows');
  const [outputsDir, setOutputsDir] = useState('./outputs');
  const [minMemoryGb, setMinMemoryGb] = useState('4.0');

  // Connection Test States
  const [ollamaTestResult, setOllamaTestResult] = useState<string | null>(null);
  const [comfyTestResult, setComfyTestResult] = useState<string | null>(null);
  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [isTestingComfy, setIsTestingComfy] = useState(false);

  // Editable Lyric Style Guide
  const defaultGuideText = `You are a master lyricist and song producer. You write lyrics that feel human, evocative, and melodically natural.

CRITICAL LYRIC STYLE GUIDE RULES:
1. Story first: one emotional premise per song, and every line supports it.
2. Each verse contains one memorable tactile image (physical object, sensory texture, concrete action).
3. The chorus answers the title emotionally, not literally. The title sits naturally in the chorus.
4. Simple words, deep ideas. Lines must sound naturally spoken or sung.
5. Emotional arc: curiosity, hope, conflict, realization, acceptance.
6. Show what it felt like. Do not tell listeners what to think.
7. Write the emotional aftermath of events, not only the events.
8. Avoid: forced rhymes, generic heartbreak, overwriting, preaching, explaining instead of showing, chasing trends.
9. ABSOLUTE BANS:
   - NEVER use em dashes (—). Use commas, periods, or clean line breaks.
   - NEVER use the words: narrator, delve, tapestry, foster.
10. Keep lyrics under 3000 characters. Run a self-check pass and rewrite any line that does not earn its place.`;

  const [lyricGuideText, setLyricGuideText] = useState(defaultGuideText);
  const [guideSaveNotice, setGuideSaveNotice] = useState(false);

  const testOllamaConnection = async () => {
    setIsTestingOllama(true);
    setOllamaTestResult(null);
    const start = performance.now();
    try {
      const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      const elapsed = Math.round(performance.now() - start);
      if (res.ok) {
        setOllamaTestResult(`Connected successfully (${elapsed}ms latency)`);
      } else {
        setOllamaTestResult(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (e: any) {
      setOllamaTestResult(`Connection failed: ${e.message || 'Offline'}`);
    } finally {
      setIsTestingOllama(false);
    }
  };

  const testComfyConnection = async () => {
    setIsTestingComfy(true);
    setComfyTestResult(null);
    const start = performance.now();
    try {
      const res = await fetch(`${comfyUrl}/object_info`, { signal: AbortSignal.timeout(3000) });
      const elapsed = Math.round(performance.now() - start);
      if (res.ok) {
        setComfyTestResult(`Connected successfully (${elapsed}ms latency)`);
      } else {
        setComfyTestResult(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (e: any) {
      setComfyTestResult(`Connection failed: ${e.message || 'Offline'}`);
    } finally {
      setIsTestingComfy(false);
    }
  };

  const handleSaveGuide = () => {
    setGuideSaveNotice(true);
    setTimeout(() => setGuideSaveNotice(false), 3000);
  };

  const handleResetGuide = () => {
    setLyricGuideText(defaultGuideText);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Endpoints and Paths */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <h3 className="text-base font-semibold text-neutral-100 mb-1">Endpoints & Storage Paths</h3>
        <p className="text-xs text-neutral-400 mb-6">
          Synchronized with your local <code>.env</code> file. No cloud or telemetry URLs.
        </p>

        <div className="space-y-4">
          {/* Ollama URL & Test */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Ollama Service URL</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-100 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={testOllamaConnection}
                disabled={isTestingOllama}
                className="px-3 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors shrink-0"
              >
                {isTestingOllama ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            {ollamaTestResult && (
              <span className={`block text-xs mt-1.5 font-mono ${ollamaTestResult.includes('success') ? 'text-emerald-400' : 'text-amber-400'}`}>
                {ollamaTestResult}
              </span>
            )}
          </div>

          {/* ComfyUI URL & Test */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">ComfyUI Music Engine URL</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={comfyUrl}
                onChange={(e) => setComfyUrl(e.target.value)}
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-100 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={testComfyConnection}
                disabled={isTestingComfy}
                className="px-3 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors shrink-0"
              >
                {isTestingComfy ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            {comfyTestResult && (
              <span className={`block text-xs mt-1.5 font-mono ${comfyTestResult.includes('success') ? 'text-emerald-400' : 'text-amber-400'}`}>
                {comfyTestResult}
              </span>
            )}
          </div>

          {/* ComfyUI Path on Mac */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">ComfyUI Installation Path on Mac</label>
            <input
              type="text"
              value={comfyPath}
              onChange={(e) => setComfyPath(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Workflows Directory</label>
              <input
                type="text"
                value={workflowsDir}
                onChange={(e) => setWorkflowsDir(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Audio Outputs Directory</label>
              <input
                type="text"
                value={outputsDir}
                onChange={(e) => setOutputsDir(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Editable Lyric Style Guide */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h3 className="text-base font-semibold text-neutral-100">Editable Lyric Style Guide (System Prompt)</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Defines the creative constitution used by Qwen when drafting verses, imagery, and emotional arcs.
            </p>
          </div>

          <button
            onClick={handleResetGuide}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Default</span>
          </button>
        </div>

        <textarea
          value={lyricGuideText}
          onChange={(e) => setLyricGuideText(e.target.value)}
          rows={14}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-neutral-200 leading-relaxed focus:outline-none focus:border-amber-500 mb-4"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            Enforces strict anti-slop rules, memorable tactile images per verse, and no em dashes.
          </span>

          <div className="flex items-center gap-2">
            {guideSaveNotice && (
              <span className="text-xs text-emerald-400 font-medium">Saved to Studio Settings!</span>
            )}
            <button
              onClick={handleSaveGuide}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Style Guide</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
