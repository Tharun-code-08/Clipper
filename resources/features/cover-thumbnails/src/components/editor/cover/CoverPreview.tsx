'use client';

// Fits the full-resolution CoverStage into the centre column with a uniform CSS scale, so what the user
// sees is the exact DOM the download renders.

import { useEffect, useRef, useState } from 'react';
import { Loader2, ImageIcon } from 'lucide-react';
import CoverStage from './CoverStage';
import type { CoverEditor } from './useCoverEditor';

export default function CoverPreview({ editor }: { editor: CoverEditor }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { stageProps, frameStatus, frameError, cutoutStatus, frame } = editor;
  const W = stageProps.preset.width, H = stageProps.preset.height;
  const pad = 24;
  const scale = size.w > 0 && size.h > 0 ? Math.max(0.05, Math.min((size.w - pad) / W, (size.h - pad) / H)) : 0;

  return (
    <div ref={boxRef} data-cover-preview="" className="relative flex-1 min-w-0 min-h-0 h-full w-full flex items-center justify-center bg-[#0B0B0D] overflow-hidden">
      {scale > 0 && (
        <div className="relative rounded-md overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/10" style={{ width: W * scale, height: H * scale }}>
          <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <CoverStage {...stageProps} onHeadlineMeasure={editor.onHeadlineMeasure} probeWidths={editor.probeWidths} />
          </div>

          {!frame && frameStatus !== 'capturing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-black/40">
              <ImageIcon className="w-6 h-6 text-zinc-500" />
              <p className="text-xs text-zinc-300">{frameError || 'Scrub the timeline to pick a frame for your cover.'}</p>
            </div>
          )}
          {(frameStatus === 'capturing' || cutoutStatus === 'working') && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-zinc-200">
              <Loader2 className="w-3 h-3 animate-spin" />
              {frameStatus === 'capturing' ? 'Grabbing frame…' : 'Cutting out subject…'}
            </div>
          )}
        </div>
      )}
      <span className="absolute bottom-2 right-3 text-[10px] text-zinc-600 font-mono">{W} × {H}</span>
    </div>
  );
}
