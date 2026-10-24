import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Music2 } from 'lucide-react';

declare global {
  interface Window {
    ABCJS?: any;
  }
}

let abcjsPromise: Promise<any> | null = null;

function loadAbcjs(): Promise<any> {
  if (window.ABCJS) return Promise.resolve(window.ABCJS);
  if (!abcjsPromise) {
    abcjsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/abcjs-basic-min.js';
      script.onload = () => (window.ABCJS ? resolve(window.ABCJS) : reject(new Error('ABCJS did not load')));
      script.onerror = () => {
        script.remove();
        abcjsPromise = null;
        reject(new Error('Could not load the ABC score renderer'));
      };
      document.head.appendChild(script);
    });
  }
  return abcjsPromise;
}

interface AbcScorePlayerProps {
  abc: string;
}

export const AbcScorePlayer: React.FC<AbcScorePlayerProps> = ({ abc }) => {
  const notationRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioUnsupported, setAudioUnsupported] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    setError(null);
    setAudioUnsupported(false);
    setReady(false);

    const mount = async () => {
      try {
        const ABCJS = await loadAbcjs();
        if (disposed || !notationRef.current || !controlsRef.current) return;

        notationRef.current.replaceChildren();
        controlsRef.current.replaceChildren();
        const visual = ABCJS.renderAbc(notationRef.current, abc, {
          responsive: 'resize',
          add_classes: true,
          staffwidth: 820,
          paddingtop: 12,
          paddingbottom: 12,
          wrap: { minSpacing: 1.4, maxSpacing: 2.5, preferredMeasuresPerLine: 4 },
        })[0];
        if (!visual) throw new Error('The ABC score could not be rendered');
        setReady(true);

        if (!ABCJS.synth || !ABCJS.synth.supportsAudio()) {
          setAudioUnsupported(true);
          return;
        }

        const controller = new ABCJS.synth.SynthController();
        controllerRef.current = controller;
        controller.load(
          controlsRef.current,
          {
            onStart: () => undefined,
            onFinished: () => undefined,
            onEvent: () => undefined,
          },
          {
            displayRestart: true,
            displayPlay: true,
            displayProgress: true,
            displayLoop: true,
            displayWarp: false,
          },
        );
        controller.setTune(visual, false, {
          soundFontUrl: '/vendor/soundfonts/FluidR3_GM/',
          soundFontVolumeMultiplier: 3,
        });

        // Register/resume the audio context inside the play gesture.
        const playButton = controlsRef.current.querySelector('.abcjs-midi-start');
        playButton?.addEventListener(
          'click',
          () => {
            try {
              ABCJS.synth.registerAudioContext();
              ABCJS.synth.activeAudioContext()?.resume?.();
            } catch {
              // The controller surfaces playback errors inline.
            }
          },
          { capture: true },
        );
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      }
    };

    void mount();
    return () => {
      disposed = true;
      try {
        controllerRef.current?.destroy?.();
      } catch {
        // ignore
      }
      controllerRef.current = null;
      notationRef.current?.replaceChildren();
      controlsRef.current?.replaceChildren();
    };
  }, [abc]);

  return (
    <div className="space-y-2">
      <div className="abc-score overflow-x-auto rounded-lg border border-neutral-800 bg-[#fbf7ec] p-3 text-neutral-900">
        <div ref={notationRef} />
        {!ready && !error && <div className="py-8 text-center text-xs text-neutral-500">Engraving score…</div>}
      </div>

      <div ref={controlsRef} className="min-h-[30px]" />

      {audioUnsupported && (
        <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          <AlertCircle className="h-3 w-3" />
          Piano playback is not supported in this browser. The notation is still rendered.
        </p>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
      {ready && !audioUnsupported && !error && (
        <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          <Music2 className="h-3 w-3 text-amber-400" />
          Press play to hear the piano reduction of this score.
        </p>
      )}
    </div>
  );
};
