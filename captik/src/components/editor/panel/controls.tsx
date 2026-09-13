'use client';

// Shared control widgets for the right-panel Text/Templates tabs and the
// left-panel Line Styling popover. Zinc/amber theme throughout.

import { useRef, useState, useCallback, type ReactNode } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import type { GradientStop } from '@/types/transcript';
import { gradientCSS, gradientColorAt } from '@/lib/styleResolve';

// ── Collapsible section ───────────────────────────────────────────────────────

export function Section({ label, children, defaultOpen = true, right }: {
  label: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.05]">
      <div className="w-full flex items-center gap-2 py-2.5">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left cursor-pointer group flex-1">
          <ChevronDown className={`w-3 h-3 text-zinc-600 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover:text-zinc-400 transition-colors">{label}</span>
        </button>
        {right}
      </div>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

// ── Reset button ──────────────────────────────────────────────────────────────

export function ResetBtn({ show, onClick, title = 'Reset to default' }: { show: boolean; onClick: () => void; title?: string }) {
  if (!show) return <span className="w-5 h-5 shrink-0" />;
  return (
    <Tooltip label={title}>
    <button onClick={onClick} aria-label={title}
      className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0">
      <RotateCcw className="w-2.5 h-2.5" />
    </button>
    </Tooltip>
  );
}

// ── Labelled slider row (label · slider · value box · reset) ─────────────────

export function SliderRow({ label, value, min, max, step, onChange, display, defaultValue }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display?: (v: number) => string; defaultValue?: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 rounded-full appearance-none cursor-pointer min-w-0"
        style={{ background: `linear-gradient(to right, #f59e0b ${pct}%, #3f3f46 ${pct}%)`, accentColor: '#f59e0b' }}
      />
      <div className="bg-white/[0.06] border border-white/[0.08] rounded-md px-2 py-0.5 min-w-[44px] text-center shrink-0">
        <span className="text-[11px] text-white font-mono">{display ? display(value) : value}</span>
      </div>
      <ResetBtn show={defaultValue !== undefined && value !== defaultValue} onClick={() => onChange(defaultValue!)} />
    </div>
  );
}

// ── Segmented toggle (Solid|Gradient, Emphasize|Spotlight, Splash|Center…) ───

export function Segmented<T extends string>({ options, value, onChange, size = 'md', disabledOptions }: {
  options: { id: T; label: ReactNode; title?: string }[];
  value: T; onChange: (v: T) => void; size?: 'sm' | 'md';
  disabledOptions?: T[];
}) {
  return (
    <div className="flex gap-0.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      {options.map(o => {
        const disabled = disabledOptions?.includes(o.id);
        const btn = (
          <button disabled={disabled}
            onClick={() => !disabled && onChange(o.id)}
            className={`${o.title ? 'w-full' : 'flex-1'} ${size === 'sm' ? 'py-1.5 text-[10.5px]' : 'py-2 text-[11px]'} rounded-lg font-semibold transition-all ${
              disabled ? 'text-zinc-700 cursor-not-allowed'
              : value === o.id ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30 cursor-pointer'
              : 'text-zinc-500 hover:text-zinc-300 cursor-pointer border border-transparent'
            }`}>
            {o.label}
          </button>
        );
        // Tooltip wrapper renders inline-flex; flex-1 must sit on the wrapper
        // so segmented options keep their equal widths.
        return o.title
          ? <Tooltip key={o.id} label={o.title} className="flex-1">{btn}</Tooltip>
          : <span key={o.id} className="flex-1 inline-flex">{btn}</span>;
      })}
    </div>
  );
}

// ── Color field: swatch+native picker · hex input · optional opacity % ───────

export function ColorField({ label, hex, opacity, onHex, onOpacity, onReset, showReset, compact }: {
  label?: string; hex: string; opacity?: number;
  onHex: (h: string) => void; onOpacity?: (o: number) => void;
  onReset?: () => void; showReset?: boolean; compact?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    setDraft(null);
    let h = raw.trim().replace(/^#?/, '#');
    if (/^#[0-9a-fA-F]{3}$/.test(h)) h = '#' + h.slice(1).split('').map(c => c + c).join('');
    if (/^#[0-9a-fA-F]{6}$/.test(h)) onHex(h.toLowerCase());
  };
  return (
    <div className="flex items-center gap-2">
      {label && <span className={`text-[11px] text-zinc-400 ${compact ? 'w-[64px]' : 'w-[88px]'} shrink-0`}>{label}</span>}
      <div className="flex-1 flex items-center bg-white/[0.04] rounded-xl border border-white/[0.07] overflow-hidden min-w-0">
        <div className="relative w-7 h-7 m-1 rounded-lg overflow-hidden border border-white/[0.12] cursor-pointer shrink-0">
          <div className="absolute inset-0" style={{ background: hex }} />
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffffff'}
            onChange={e => onHex(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </div>
        <span className="text-[10px] text-zinc-600 pl-1">#</span>
        <input
          value={(draft ?? hex.replace('#', '')).toUpperCase()}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
          className="flex-1 bg-transparent text-[11px] text-white font-mono py-1.5 px-1 outline-none min-w-0"
          spellCheck={false}
        />
        {typeof opacity === 'number' && onOpacity && (
          <div className="flex items-center border-l border-white/[0.07] px-1.5 shrink-0">
            <input
              type="number" min={0} max={100} value={opacity}
              onChange={e => onOpacity(Math.max(0, Math.min(100, Number(e.target.value))))}
              className="w-8 bg-transparent text-[11px] text-white font-mono outline-none text-right"
            />
            <span className="text-[10px] text-zinc-600 pl-0.5">%</span>
          </div>
        )}
      </div>
      {onReset && <ResetBtn show={!!showReset} onClick={onReset} />}
    </div>
  );
}

// ── Numeric field with unit (px / %) ─────────────────────────────────────────

export function NumField({ label, value, unit, min, max, step = 1, onChange, onReset, showReset, width = 'flex-1' }: {
  label?: string; value: number; unit: string; min?: number; max?: number; step?: number;
  onChange: (v: number) => void; onReset?: () => void; showReset?: boolean; width?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${width} min-w-0`}>
      {label && <span className="text-[11px] text-zinc-400 shrink-0">{label}</span>}
      <div className="flex-1 flex items-center bg-white/[0.06] border border-white/[0.08] rounded-md px-2 py-1 min-w-0">
        <input
          type="number" value={value} min={min} max={max} step={step}
          onChange={e => {
            let v = Number(e.target.value);
            if (Number.isNaN(v)) return;
            if (min !== undefined) v = Math.max(min, v);
            if (max !== undefined) v = Math.min(max, v);
            onChange(v);
          }}
          className="w-full bg-transparent text-[11px] text-white font-mono outline-none"
        />
        <span className="text-[10px] text-zinc-600 pl-1 shrink-0">{unit}</span>
      </div>
      {onReset && <ResetBtn show={!!showReset} onClick={onReset} />}
    </div>
  );
}

// ── Toggle row (label · switch) ───────────────────────────────────────────────

export function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11.5px] text-zinc-300">{label}</span>
      <button
        onClick={() => onChange(!on)}
        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${on ? 'bg-emerald-500' : 'bg-zinc-700'}`}
        role="switch" aria-checked={on}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

// ── Gradient stop editor ──────────────────────────────────────────────────────
//
// A horizontal bar previewing the gradient with draggable stop handles below.
// Click on the bar adds a stop at that position (sampled colour); drag a handle
// to move it; double-click a handle to delete (min 2 stops); click a handle to
// select it and edit its colour with the swatch underneath.

export function GradientStopEditor({ stops, onChange }: {
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState(0);
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);

  const posFromEvent = useCallback((clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }, []);

  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSel(idx);
    const move = (ev: PointerEvent) => {
      const pos = posFromEvent(ev.clientX);
      onChange(stops.map((s, i) => (i === idx ? { ...s, pos } : s)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const addStop = (e: React.MouseEvent) => {
    const pos = posFromEvent(e.clientX);
    const hex = gradientColorAt(stops, pos);
    const next = [...stops, { pos, hex }];
    onChange(next);
    setSel(next.length - 1);
  };

  const removeStop = (idx: number) => {
    if (stops.length <= 2) return;
    onChange(stops.filter((_, i) => i !== idx));
    setSel(0);
  };

  const selStop = stops[Math.min(sel, stops.length - 1)];

  return (
    <div className="space-y-2">
      <div className="relative pb-4">
        <div
          ref={barRef}
          onClick={addStop}
          className="h-8 rounded-lg border border-white/[0.1] cursor-copy"
          style={{ background: gradientCSS(sorted, 90) }}
          title="Click anywhere on the bar to add a colour stop"
        />
        {stops.map((s, i) => (
          <button
            key={i}
            onPointerDown={startDrag(i)}
            onDoubleClick={() => removeStop(i)}
            title="Drag to move this colour stop · double-click to remove it"
            className="absolute -bottom-0 -translate-x-1/2 cursor-ew-resize"
            style={{ left: `${s.pos * 100}%` }}
          >
            <div
              className={`w-3.5 h-3.5 rotate-45 rounded-[3px] border-2 ${i === Math.min(sel, stops.length - 1) ? 'border-amber-400' : 'border-white/70'}`}
              style={{ background: s.hex }}
            />
          </button>
        ))}
      </div>
      {selStop && (
        <ColorField
          label="Stop"
          compact
          hex={selStop.hex}
          onHex={h => onChange(stops.map((s, i) => (i === Math.min(sel, stops.length - 1) ? { ...s, hex: h } : s)))}
        />
      )}
    </div>
  );
}

// ── Style buttons: Tt (capitalize) · T (upper) · t (lower) · U (underline) ───

export function CasingButtons({ casing, underline, onCasing, onUnderline }: {
  casing?: 'capitalize' | 'upper' | 'lower'; underline?: boolean;
  onCasing: (c: 'capitalize' | 'upper' | 'lower' | undefined) => void;
  onUnderline: (u: boolean) => void;
}) {
  const btn = (active: boolean) =>
    `w-9 h-8 rounded-lg text-[12px] font-semibold transition-all cursor-pointer border ${
      active ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
             : 'text-zinc-400 border-white/[0.07] hover:text-zinc-200 hover:border-white/[0.16]'}`;
  return (
    <div className="flex gap-1.5">
      <Tooltip label="Capitalize Each Word">
        <button aria-label="Capitalize each word" className={btn(casing === 'capitalize')}
          onClick={() => onCasing(casing === 'capitalize' ? undefined : 'capitalize')}>Tt</button>
      </Tooltip>
      <Tooltip label="UPPERCASE everything">
        <button aria-label="Uppercase" className={btn(casing === 'upper')}
          onClick={() => onCasing(casing === 'upper' ? undefined : 'upper')}>T</button>
      </Tooltip>
      <Tooltip label="lowercase everything">
        <button aria-label="Lowercase" className={btn(casing === 'lower')}
          onClick={() => onCasing(casing === 'lower' ? undefined : 'lower')}>t</button>
      </Tooltip>
      <Tooltip label="Underline the captions">
        <button aria-label="Underline" className={`${btn(!!underline)} underline underline-offset-2`}
          onClick={() => onUnderline(!underline)}>U</button>
      </Tooltip>
    </div>
  );
}

// ── Alignment buttons ─────────────────────────────────────────────────────────

export function AlignButtons({ align, onAlign }: {
  align?: 'left' | 'center' | 'right';
  onAlign: (a: 'left' | 'center' | 'right' | undefined) => void;
}) {
  const Lines = ({ variant }: { variant: 'left' | 'center' | 'right' }) => (
    <span className={`flex flex-col gap-[3px] ${variant === 'left' ? 'items-start' : variant === 'right' ? 'items-end' : 'items-center'}`}>
      <span className="block h-[1.5px] w-4 bg-current rounded" />
      <span className="block h-[1.5px] w-2.5 bg-current rounded" />
      <span className="block h-[1.5px] w-4 bg-current rounded" />
    </span>
  );
  const btn = (active: boolean) =>
    `w-9 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border ${
      active ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
             : 'text-zinc-400 border-white/[0.07] hover:text-zinc-200 hover:border-white/[0.16]'}`;
  return (
    <div className="flex gap-1.5">
      {(['left', 'center', 'right'] as const).map(a => (
        <Tooltip key={a} label={`Align text ${a}`}>
        <button aria-label={`Align ${a}`} className={btn(align === a || (!align && a === 'center'))}
          onClick={() => onAlign(a === 'center' ? undefined : a)}>
          <Lines variant={a} />
        </button>
        </Tooltip>
      ))}
    </div>
  );
}

// ── Font face (weight/italic) dropdown ───────────────────────────────────────

export const FONT_FACES: { label: string; weight: number; italic: boolean }[] = [
  { label: 'Thin', weight: 100, italic: false },
  { label: 'Extra Light', weight: 200, italic: false },
  { label: 'Light', weight: 300, italic: false },
  { label: 'Regular', weight: 400, italic: false },
  { label: 'Medium', weight: 500, italic: false },
  { label: 'Semi Bold', weight: 600, italic: false },
  { label: 'Bold', weight: 700, italic: false },
  { label: 'Extra Bold', weight: 800, italic: false },
  { label: 'Black', weight: 900, italic: false },
  { label: 'Thin Italic', weight: 100, italic: true },
  { label: 'Light Italic', weight: 300, italic: true },
  { label: 'Regular Italic', weight: 400, italic: true },
  { label: 'Medium Italic', weight: 500, italic: true },
  { label: 'Semi Bold Italic', weight: 600, italic: true },
  { label: 'Bold Italic', weight: 700, italic: true },
  { label: 'Extra Bold Italic', weight: 800, italic: true },
  { label: 'Black Italic', weight: 900, italic: true },
];

export function FaceSelect({ face, onChange, defaultLabel = 'Template default' }: {
  face?: { weight: number; italic: boolean };
  onChange: (f: { weight: number; italic: boolean } | undefined) => void;
  defaultLabel?: string;
}) {
  const current = face ? FONT_FACES.find(f => f.weight === face.weight && f.italic === face.italic)?.label ?? 'Custom' : defaultLabel;
  return (
    <div className="relative flex-1 min-w-0">
      <select
        value={current}
        onChange={e => {
          const f = FONT_FACES.find(x => x.label === e.target.value);
          onChange(f ? { weight: f.weight, italic: f.italic } : undefined);
        }}
        className="w-full appearance-none bg-white/[0.06] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-[11px] text-white outline-none cursor-pointer hover:border-white/[0.16]"
      >
        <option value={defaultLabel} className="bg-zinc-900">{defaultLabel}</option>
        {FONT_FACES.map(f => (
          <option key={f.label} value={f.label} className="bg-zinc-900"
            style={{ fontWeight: f.weight, fontStyle: f.italic ? 'italic' : 'normal' }}>
            {f.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}
