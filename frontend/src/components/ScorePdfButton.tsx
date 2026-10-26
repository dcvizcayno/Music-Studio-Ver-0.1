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
      const { jsPDF } = await import('jspdf');
      const ABCJS = await loadAbcjs();
      ABCJS.renderAbc(host, abc, {
        staffwidth: 900,
        responsive: undefined,
        paddingtop: 0,
        paddingbottom: 0,
        add_classes: true,
      });
      const svg = host.querySelector('svg') as SVGSVGElement | null;
      if (!svg) throw new Error('The score could not be rendered');
      const root = svg.getBBox();
      const systemElements = ([...svg.children] as SVGGraphicsElement[])
        .filter((child) => child.tagName === 'g')
        .map((child) => {
          const box = child.getBBox();
          return { element: child, y: box.y, h: box.height, w: box.width };
        })
        .filter((item) => item.h > 20)
        .sort((a, b) => a.y - b.y);
      const systems = systemElements.map(({ y, h }) => ({ y, h }));
      if (!systems.length) systems.push({ y: root.y, h: root.height });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;
      const scale = contentWidth / root.width;
      const firstPageTop = 142;
      const laterPageTop = 64;
      const bottom = pageHeight - 36;

      const pages: { systems: typeof systems; startY: number; used: number }[] = [];
      let current: typeof systems = [];
      let startY = systems[0].y;
      for (const system of systems) {
        // Keep a small safety gap so a system is never split at the page footer.
        const limit = (pages.length === 0 ? bottom - firstPageTop : bottom - laterPageTop) - 24;
        const proposed = (system.y + system.h - startY) * scale;
        if (current.length && proposed > limit) {
          const last = current[current.length - 1];
          pages.push({ systems: current, startY, used: (last.y + last.h - startY) * scale });
          current = [];
          startY = system.y;
        }
        current.push(system);
      }
      if (current.length) {
        const last = current[current.length - 1];
        pages.push({ systems: current, startY, used: (last.y + last.h - startY) * scale });
      }

      for (let index = 0; index < pages.length; index += 1) {
        if (index > 0) pdf.addPage();
        const page = pages[index];
        const top = index === 0 ? firstPageTop : laterPageTop;

        pdf.setFont('helvetica', 'bold');
        if (index === 0) {
          pdf.setFontSize(16);
          pdf.setTextColor(20);
          pdf.text(meta.title || 'Song Score', margin, 42, { maxWidth: contentWidth });
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10);
          pdf.setTextColor(60);
          pdf.text(`Date Written: ${meta.date}`, margin, 66);
          pdf.text(`BPM: ${meta.bpm}`, margin, 81);
          pdf.text(`Key: ${meta.key}`, margin, 96);
        } else {
          pdf.setFontSize(9);
          pdf.setTextColor(90);
          pdf.text(`${meta.title || 'Song Score'} — page ${index + 1}`, margin, 30, { maxWidth: contentWidth });
        }

        // Rasterize the complete score once, then slice it at system boundaries.
        // This is resilient to SVG viewBox quirks in svg2pdf and keeps every staff.
        const sourceWidth = root.width;
        const sourceHeight = root.height;
        const renderScale = 1.6;
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = Math.max(1, Math.round(sourceWidth * renderScale));
        fullCanvas.height = Math.max(1, Math.round(sourceHeight * renderScale));
        const fullContext = fullCanvas.getContext('2d');
        if (!fullContext) throw new Error('Canvas is unavailable');
        fullContext.fillStyle = '#ffffff';
        fullContext.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
        const serialized = new XMLSerializer().serializeToString(svg);
        const svgUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }));
        try {
          const image = new Image();
          image.decoding = 'async';
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('Could not rasterize the score'));
            image.src = svgUrl;
          });
          fullContext.drawImage(image, 0, 0, fullCanvas.width, fullCanvas.height);
        } finally {
          URL.revokeObjectURL(svgUrl);
        }

        const last = page.systems[page.systems.length - 1];
        const sliceStart = index === 0 ? 0 : page.startY;
        const sliceEnd = last.y + last.h;
        const sliceHeight = Math.max(1, sliceEnd - sliceStart);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = fullCanvas.width;
        sliceCanvas.height = Math.max(1, Math.round(sliceHeight * renderScale));
        const sliceContext = sliceCanvas.getContext('2d');
        if (!sliceContext) throw new Error('Canvas is unavailable');
        sliceContext.fillStyle = '#ffffff';
        sliceContext.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sliceContext.drawImage(
          fullCanvas,
          0, Math.round(sliceStart * renderScale), fullCanvas.width, Math.round(sliceHeight * renderScale),
          0, 0, sliceCanvas.width, sliceCanvas.height,
        );
        const imageHeight = sliceHeight * scale;
        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, top, contentWidth, imageHeight);

        pdf.setFontSize(8);
        pdf.setTextColor(120);
        pdf.text(`Page ${index + 1} of ${pages.length}`, pageWidth - margin - 54, pageHeight - 20);
      }

      pdf.setPage(1);
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text('Generated locally by Song Studio · Interactive ABC score', margin, pageHeight - 20);
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
