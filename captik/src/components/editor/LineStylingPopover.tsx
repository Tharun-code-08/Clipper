'use client';

// Per-line "LINE STYLING" popover — opened from a caption row in the left panel.
// Mirrors the reference workflow: Typography (collapsible), Background toggle,
// Position X/Y %, template search + cards (per-line template override), and
// Remove Style. Applies to one line — or every line in the current multi-selection.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown } from 'lucide-react';
import type { LineOverride, TextOverrides, CaptionBoxConfig } from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { CAPTION_STYLES } from '@/lib/captionStyles';
import { isStyleLocked } from '@/lib/styleResolve';
import { Segmented, NumField, ToggleRow, FaceSelect, CasingButtons, SliderRow } from './panel/controls';
import Tooltip from '@/components/ui/Tooltip';

export interface LineStylingPopoverProps {
  anchor: { x: number; y: number };
  lineLabel: string;                    // e.g. "Line 10" or "3 lines"
  override: LineOverride | undefined;   // current override of the clicked line
  baseBox: CaptionBoxConfig;            // global box (for X/Y defaults)
  onPatch: (patch: Partial<LineOverride> | null) => void;
  onClose: () => void;
}

export default function LineStylingPopover(p: LineStylingPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [typoOpen, setTypoOpen] = useState(false);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) p.onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ov = p.override;
  const box = ov?.box ?? p.baseBox;
  const text = ov?.text ?? {};

  const patchText = (t: Partial<TextOverrides>) => {
    const merged = { ...text, ...t };
    (Object.keys(merged) as (keyof TextOverrides)[]).forEach(k => merged[k] === undefined && delete merged[k]);
    p.onPatch({ text: Object.keys(merged).length ? merged : undefined });
  };

  const styles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = CAPTION_STYLES.filter(s => !isStyleLocked(s.id));   // kinetic templates are whole-project looks
    if (!q) return all;
    return all.filter(s => s.name.toLowerCase().includes(q) || s.tags?.some(t => t.toLowerCase().includes(q)));
  }, [query]);

  const hasOverride = !!ov && Object.keys(ov).length > 0;

  // Clamp to viewport
  const W = 296, MAXH = 560;
  const x = Math.max(8, Math.min(p.anchor.x, (typeof window !== 'undefined' ? window.innerWidth : 1280) - W - 8));
  const y = Math.max(8, Math.min(p.anchor.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 320));

  const body = (
    <div
      ref={ref}
      className="fixed z-[300] rounded-2xl border border-white/[0.1] bg-[#101013] shadow-2xl shadow-black/70 flex flex-col"
      style={{ left: x, top: y, width: W, maxHeight: MAXH }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.06] shrink-0">
        <span className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-amber-400/15 border border-amber-400/30 inline-flex items-center justify-center text-[8px] text-amber-300">▤</span>
          Line Styling
        </span>
        <span className="text-[9.5px] font-semibold text-zinc-500 bg-white/[0.05] rounded-full px-2 py-0.5">{p.lineLabel}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-2 space-y-1">
        {/* Typography */}
        <div className="border-b border-white/[0.05]">
          <button onClick={() => setTypoOpen(o => !o)} className="w-full flex items-center gap-2 py-2.5 cursor-pointer group">
            <ChevronDown className={`w-3 h-3 text-zinc-600 transition-transform ${typoOpen ? '' : '-rotate-90'}`} />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover:text-zinc-400">Typography</span>
          </button>
          {typoOpen && (
            <div className="pb-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400 w-[64px] shrink-0">Face</span>
                <FaceSelect face={text.fontFace} onChange={f => patchText({ fontFace: f })} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400 w-[64px] shrink-0">Styles</span>
                <CasingButtons
                  casing={text.casing} underline={text.underline}
                  onCasing={c => patchText({ casing: c })}
                  onUnderline={u => patchText({ underline: u || undefined })}
                />
              </div>
              <SliderRow label="Letter sp." value={text.letterSpacing ?? 0} min={-2} max={12} step={0.5}
                onChange={v => patchText({ letterSpacing: v === 0 ? undefined : v })} defaultValue={0} />
            </div>
          )}
        </div>

        {/* Background */}
        <div className="border-b border-white/[0.05] py-1">
          <ToggleRow label="Background" on={!!text.background}
            onChange={on => patchText({ background: on ? { hex: '#000000', opacity: 100, radius: 24, padW: 48, padH: 24 } : undefined })} />
        </div>

        {/* Behind the subject — cut the person out and place the text behind them */}
        <div className="border-b border-white/[0.05] py-1">
          <ToggleRow label="Behind the subject" on={!!ov?.behindSubject}
            onChange={on => p.onPatch({ behindSubject: on || undefined })} />
        </div>

        {/* Position */}
        <div className="border-b border-white/[0.05] py-2.5 space-y-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Position</span>
          <div className="flex items-center gap-2">
            <NumField label="X" value={Math.round(box.xPercent * 10) / 10} unit="%" min={0} max={100}
              onChange={v => p.onPatch({ box: { ...box, xPercent: v } })}
              onReset={() => p.onPatch({ box: undefined })} showReset={!!ov?.box} />
            <NumField label="Y" value={Math.round(box.yPercent * 10) / 10} unit="%" min={0} max={100}
              onChange={v => p.onPatch({ box: { ...box, yPercent: v } })}
              onReset={() => p.onPatch({ box: undefined })} showReset={!!ov?.box} />
          </div>
        </div>

        {/* Templates */}
        <div className="py-2.5 space-y-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Templates</span>
          <div className="flex items-center bg-white/[0.04] rounded-xl border border-white/[0.07] px-2.5">
            <Search className="w-3 h-3 text-zinc-600 shrink-0" />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search templates..."
              className="flex-1 bg-transparent text-[11px] text-white placeholder:text-zinc-600 py-2 px-2 outline-none min-w-0"
            />
          </div>
          <div className="space-y-1.5">
            {styles.map(s => {
              const selected = ov?.styleId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => p.onPatch(selected
                    ? { styleId: undefined, colors: undefined, boxSize: undefined }
                    : { styleId: s.id as CaptionStyleId })}
                  className={`w-full rounded-xl overflow-hidden border text-left transition-all cursor-pointer ${
                    selected ? 'border-emerald-400/60 shadow-[0_0_0_1px_rgba(52,211,153,0.3)]' : 'border-white/[0.07] hover:border-white/[0.2]'}`}
                >
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-black/[0.25]">
                    <span className="text-[10.5px] font-semibold text-zinc-300">{s.name}</span>
                    {selected && <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-[8px] text-white font-bold flex items-center justify-center">✓</span>}
                  </div>
                  <div className="relative w-full overflow-hidden flex items-center justify-center"
                    style={{ height: 56, background: s.previewBg ?? 'linear-gradient(160deg,#0f0f16 0%,#09090f 100%)' }}>
                    <div style={{ position: 'relative', textAlign: 'center', maxWidth: '94%' }}>
                      {s.renderPreview ? s.renderPreview() : (
                        <span style={{ ...s.textStyle as React.CSSProperties, lineHeight: 1.15, fontSize: Math.min(Number(s.textStyle.fontSize ?? 16), 17) }}>
                          {s.previewText}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Remove Style */}
      {hasOverride && (
        <div className="p-3 border-t border-white/[0.06] shrink-0">
          <Tooltip label="Clear this line's own styling and follow the global template again" className="w-full">
          <button
            onClick={() => { p.onPatch(null); p.onClose(); }}
            className="w-full py-2 rounded-lg bg-emerald-500/85 hover:bg-emerald-500 text-[11px] font-bold text-white transition-colors cursor-pointer"
          >Remove Style</button>
          </Tooltip>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : body;
}