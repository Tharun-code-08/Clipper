'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw } from 'lucide-react';
import { CAPTION_STYLES } from '@/lib/captionStyles';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';

interface SegmentStylePickerProps {
  /** First-word IDs of the segments being targeted (1 or many). */
  segKeys: string[];
  /** The style currently active for these segments (effective, after fallback). */
  currentEffectiveStyle: CaptionStyleId;
  /** True if the segment has an explicit override (shows Reset option). */
  hasOverride: boolean;
  /** Screen coords where the picker should anchor (right-click position). */
  x: number;
  y: number;
  /** True on mobile → renders as centred bottom sheet. */
  mobile?: boolean;
  onSelect: (style: CaptionStyleId | null) => void;
  onClose: () => void;
  /** Count label for the title when multiple segments are targeted. */
  count?: number;
}

export default function SegmentStylePicker({
  segKeys, currentEffectiveStyle, hasOverride,
  x, y, mobile, onSelect, onClose, count = 1,
}: SegmentStylePickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on click-outside
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [onClose]);

  // Dismiss on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = count > 1 ? `Change style · ${count} captions` : 'Change style';

  const content = (
    <div
      ref={ref}
      className={
        mobile
          ? 'fixed inset-x-0 bottom-0 z-[200] bg-zinc-900 border-t border-white/[0.08] rounded-t-2xl flex flex-col max-h-[75dvh]'
          : 'fixed z-[200] bg-zinc-900 border border-white/[0.1] rounded-xl shadow-2xl shadow-black/60 flex flex-col'
      }
      style={
        mobile
          ? undefined
          : {
              left: Math.min(x, window.innerWidth - 308),
              top:  Math.min(y, window.innerHeight - 420),
              width: 300,
              maxHeight: 420,
            }
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        {mobile && <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-white/20" />}
        <span className="text-xs font-semibold text-zinc-300 mt-1">{title}</span>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Reset row */}
      {hasOverride && (
        <button
          onClick={() => { onSelect(null); onClose(); }}
          className="flex items-center gap-2 mx-2 mb-1.5 px-2.5 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
          Reset to global style
        </button>
      )}

      {/* Style grid */}
      <div className="overflow-y-auto flex-1 px-2 pb-3" style={{ overscrollBehavior: 'contain' }}>
        <div className={`grid gap-1.5 ${mobile ? 'grid-cols-3' : 'grid-cols-3'}`}>
          {CAPTION_STYLES.map((s) => {
            const isActive = s.id === currentEffectiveStyle;
            return (
              <button
                key={s.id}
                onClick={() => { onSelect(s.id); onClose(); }}
                className={`flex flex-col rounded-xl overflow-hidden border transition-all duration-100 cursor-pointer text-left ${
                  isActive
                    ? 'border-amber-400/60 shadow-[0_0_0_1px_rgba(245,158,11,0.25)]'
                    : 'border-white/[0.07] hover:border-white/[0.2] active:border-white/[0.25]'
                }`}
              >
                {/* Preview thumbnail */}
                <div
                  className="w-full flex items-center justify-center overflow-hidden shrink-0"
                  style={{
                    height: mobile ? 52 : 44,
                    background: s.previewBg ?? '#18181f',
                  }}
                >
                  {s.renderPreview ? (
                    <div style={{ transform: 'scale(0.72)', transformOrigin: 'center' }}>
                      {s.renderPreview()}
                    </div>
                  ) : (
                    <span style={{ ...s.textStyle, fontSize: 12, lineHeight: 1 }} className="truncate px-1">
                      {s.previewText}
                    </span>
                  )}
                </div>
                {/* Name */}
                <div className="px-1.5 py-1 bg-zinc-800/60">
                  <span className="text-[9px] font-medium text-zinc-400 leading-none truncate block">
                    {s.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {/* Backdrop for mobile */}
      {mobile && (
        <div
          className="fixed inset-0 z-[199] bg-black/40"
          onClick={onClose}
        />
      )}
      {content}
    </>,
    document.body,
  );
}
