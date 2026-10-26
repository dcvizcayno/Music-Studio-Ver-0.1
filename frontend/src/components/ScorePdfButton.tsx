import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { loadAbcjs } from './AbcScorePlayer';
import { ScoreMeta as ScoreMetaType } from '../utils/scoreMeta';

interface ScorePdfButtonProps {
  abc: string;
  meta: ScoreMetaType;
  fileName?: string;
}

export const ScorePdfButton: React.FC<ScorePdfButtonProps> = ({ abc, meta, fileName }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    if (!abc.trim()) return;
    setBusy(true);
    setError('');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;width:780px;background:#ffffff;color:#111111;';
    document.body.appendChild(host);
    try {
      const [{ jsPDF }, { svg2pdf }] = await Promise.all([
        import('jspdf'),
        import('svg2pdf.js'),
      ]);
      const ABCJS = await loadAbcjs();
      ABCJS.renderAbc(host, abc, {
        staffwidth: 700,
        responsive: undefined,
        paddingtop: 0,
        paddingbottom: 0,
        add_classes: true,
      });
      const svg = host.querySelector('svg') as SVGSVGElement | null;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const width = pdf.internal.pageSize.getWidth();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text(meta.title || 'Song Score', 40, 48, { maxWidth: width - 80 });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text(`Date Written: ${meta.date}`, 40, 72);
      pdf.text(`BPM: ${meta.bpm}`, 40, 88);
      pdf.text(`Key: ${meta.key}`, 40, 104);

      if (svg) {
        await svg2pdf(svg, pdf, { x: 40, y: 125, width: width - 80 });
      }

      const pages = pdf.getNumberOfPages();
      pdf.setPage(pages);
      pdf.setFontSize(8);
      pdf.setTextColor(110);
      pdf.text('Generated locally by Song Studio · Interactive ABC score', 40, pdf.internal.pageSize.getHeight() - 28);
      const safe = (fileName || meta.title || 'song_score').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
      pdf.save(`${safe || 'song_score'}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      host.remove();
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy || !abc.trim()}
        className="flex items-center gap-1 rounded-lg border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        title="Download score with title, date, BPM and key as PDF"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        {busy ? 'PDF…' : 'PDF'}
      </button>
      {error && <span className="text-[10px] text-red-300">{error}</span>}
    </div>
  );
};
