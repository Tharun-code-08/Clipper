'use client';

// Auto-Edit — the "recycle bin" of removed clips, listed under the Run button in the
// Auto-Edit tab. Each card: reason + time range + spoken text + the detector's audit
// line, with Restore / Cut-again and click-to-seek. Hover syncs with the timeline.

import { RotateCcw, Undo2 } from 'lucide-react';
import { reasonStyle } from '@/lib/autoedit/reasons';
import type { RemovedSegment } from '@/lib/autoedit/types';

function mmss(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

interface RemovedClipsPanelProps {
  removed: RemovedSegment[];
  hoveredRemovedId: string | null;
  onHover: (id: string | null) => void;
  /** Seek the preview to a source-time position (seconds). */
  onSeek: (sec: number) => void;
  onRestore: (id: string) => void;
  onCutAgain: (id: string) => void;
}

export default function RemovedClipsPanel({
  removed,
  hoveredRemovedId,
  onHover,
  onSeek,
  onRestore,
  onCutAgain,
}: RemovedClipsPanelProps) {
  if (removed.length === 0) return null;
  const activeCount = removed.filter((r) => !r.restored).length;

  return (
    <div className="space-y-1.5" data-testid="removed-clips">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Removed clips</span>
        <span className="text-[10px] text-zinc-500">
          {activeCount} of {removed.length} cut
        </span>
      </div>
      <div className="space-y-1.5">
        {removed.map((seg) => {
          const rs = reasonStyle(seg.reason);
          const hovered = hoveredRemovedId === seg.id;
          const dur = Math.max(0, seg.end - seg.start);
          return (
            <div
              key={seg.id}
              onMouseEnter={() => onHover(seg.id)}
              onMouseLeave={() => onHover(null)}
              className={`rounded-xl border px-2.5 py-2 transition-all ${seg.restored ? 'opacity-50' : ''} ${
                hovered ? 'border-white/25 bg-white/[0.05]' : 'border-white/[0.06] bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${rs.chip}`}>{rs.label}</span>
                <button
                  onClick={() => onSeek(seg.start)}
                  className="text-[9.5px] font-mono text-zinc-500 hover:text-zinc-300 tabular-nums cursor-pointer"
                  title="Jump to this moment"
                >
                  {mmss(seg.start)} · {dur.toFixed(2)}s
                </button>
              </div>

              {seg.text ? (
                <p className="text-[11px] text-zinc-300 leading-snug line-clamp-2 mb-1">“{seg.text}”</p>
              ) : null}
              {seg.detail && (
                <p className="text-[10px] text-zinc-500 leading-snug line-clamp-2 mb-1.5" title={seg.detail}>
                  {seg.detail}
                </p>
              )}

              {seg.restored ? (
                <button
                  onClick={() => onCutAgain(seg.id)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1 text-[10.5px] font-medium text-zinc-300 bg-white/[0.05] hover:bg-white/[0.09] transition-colors cursor-pointer"
                >
                  <Undo2 className="w-3 h-3" /> Cut again
                </button>
              ) : (
                <button
                  onClick={() => onRestore(seg.id)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1 text-[10.5px] font-medium text-emerald-300 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Restore
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
