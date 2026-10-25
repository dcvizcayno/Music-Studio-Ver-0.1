import React, { useState } from 'react';
import { Check, Loader2, MessageSquareHeart, Star } from 'lucide-react';
import { saveMemoryFeedback } from '../services/api';

interface MemoryFeedbackProps {
  jobId: string;
}

export const MemoryFeedback: React.FC<MemoryFeedbackProps> = ({ jobId }) => {
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!rating) return;
    setStatus('saving');
    setError('');
    try {
      await saveMemoryFeedback({ job_id: jobId, rating, notes });
      setStatus('saved');
      setNotes('');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="rounded-lg border border-violet-900/50 bg-violet-950/20 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-violet-200">
        <MessageSquareHeart className="w-3.5 h-3.5" />
        Teach the studio
      </div>
      <p className="text-[10px] text-neutral-500">
        Feedback is stored locally in Qdrant memory and injected into future Qwen/YuE prompt context.
      </p>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            className="rounded p-0.5 text-neutral-600 hover:text-amber-300"
            aria-label={`Rate ${n} out of 5`}
          >
            <Star className={`h-4 w-4 ${n <= rating ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
        ))}
        <span className="ml-1 text-[10px] text-neutral-500">{rating ? `${rating}/5` : 'Rate this song'}</span>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What should the next song do differently? Keep choruses shorter, warmer vocals, less reverb…"
        maxLength={4000}
        className="min-h-[54px] w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-[11px] text-neutral-200 placeholder-neutral-600 focus:border-violet-700 focus:outline-none"
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-neutral-500">
          {status === 'saved' ? 'Saved to Mnemosyne. Future prompts can use it.' : status === 'error' ? error : ''}
        </span>
        <button
          onClick={submit}
          disabled={!rating || status === 'saving'}
          className="flex items-center gap-1 rounded-lg border border-violet-800/60 bg-violet-900/40 px-2.5 py-1 text-[11px] font-medium text-violet-100 hover:bg-violet-900/60 disabled:opacity-40"
        >
          {status === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : status === 'saved' ? <Check className="h-3 w-3" /> : null}
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save feedback'}
        </button>
      </div>
    </div>
  );
};
