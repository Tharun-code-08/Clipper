// The clipper home's building blocks, taken from Captik's dashboard (components/editor/Dashboard.tsx,
// PrepareMediaModal.tsx): same header, section labels, buttons, cards, selects and empty state.
import { ChevronRight } from 'lucide-react';

export const DISPLAY_FONT = { fontFamily: 'ClashDisplay, system-ui, sans-serif' };

export const primaryBtn = 'flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-[13px] font-bold transition-colors shadow-lg shadow-amber-400/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const ghostBtn = 'flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-white/[0.08] text-[12px] font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
export const iconBtn = 'flex items-center justify-center w-9 h-9 rounded-xl border border-white/[0.08] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer';
export const card = 'rounded-2xl border border-white/[0.07] bg-white/[0.02]';

// `display` = Captik's ClashDisplay page title; long user titles (a video's name) use the modal-title style instead.
export function PageHeader({ title, subtitle, left, right, display = true }) {
  return (
    <div className="flex items-center justify-between gap-4 px-8 pt-8 pb-6 shrink-0 border-b border-white/[0.05]">
      <div className="flex min-w-0 items-center gap-3">
        {left}
        <div className="min-w-0">
          {display ? (
            <h1 className="truncate text-[20px] font-black tracking-tight text-white" style={DISPLAY_FONT}>{title}</h1>
          ) : (
            <h1 className="truncate text-[17px] font-bold tracking-tight text-white" title={title}>{title}</h1>
          )}
          {subtitle && <p className="mt-1 truncate text-[12px] text-zinc-600">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function SectionLabel({ children, className = 'mb-3' }) {
  return <p className={`text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600 ${className}`}>{children}</p>;
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.01] py-14">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04]">
        <Icon className="h-5 w-5 text-zinc-700" />
      </div>
      <div className="px-6 text-center">
        <p className="text-[13px] font-medium text-zinc-500">{title}</p>
        {hint && <p className="mt-0.5 text-[11px] text-zinc-700">{hint}</p>}
      </div>
    </div>
  );
}

export function Spinner({ className = 'h-6 w-6' }) {
  return <div className={`${className} animate-spin rounded-full border-2 border-white/20 border-t-amber-400`} />;
}

export function FieldLabel({ icon: Icon, children }) {
  return (
    <label className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </label>
  );
}

export function Select({ value, onChange, options, disabled }) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 pr-7 text-[12px] text-zinc-200 transition-colors focus:border-amber-500/40 focus:bg-white/[0.05] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#09090d]">{o.label}</option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-zinc-600" />
    </div>
  );
}
