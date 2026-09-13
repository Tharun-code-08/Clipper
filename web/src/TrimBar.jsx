// Trim strip of the clip studio. The track shows the source around the clip — transcript words, loudness,
// what video is downloaded — and the in/out handles snap to word boundaries. Preview plays the source audio
// with the downloaded video; applying re-cuts the clip on the server and keeps every caption edit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Magnet, Pause, Play, RotateCcw, Scissors, X } from 'lucide-react';
import { api, fmtClock, fmtLength, readPref, writePref } from './format.js';

const CONTEXTS = [
  { sec: 30, label: '±30s' },
  { sec: 60, label: '±1m' },
  { sec: 120, label: '±2m' },
];
const EDGE_PREVIEW_SEC = 3;
const SNAP_PX = 10;
const LEAD_IN = 0.05; // in-point sits just before a word's onset
const TAIL_OUT = 0.15; // out-point just after a word ends
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(v * 100) / 100;
const near = (a, b) => Math.abs(a - b) < 0.011;

function Waveform({ loud, win, className }) {
  if (!loud?.db?.length) return null;
  const step = loud.stepSec;
  return (
    <svg viewBox={`${win.from} 0 ${Math.max(0.001, win.to - win.from)} 100`} preserveAspectRatio="none" className={`absolute inset-0 h-full w-full ${className}`}>
      {loud.db.map((db, i) => {
        const h = clamp((db + 55) / 45, 0.04, 1) * 92;
        return <rect key={i} x={loud.from + i * step + step * 0.18} y={(100 - h) / 2} width={step * 0.64} height={h} />;
      })}
    </svg>
  );
}

function Handle({ side, disabled, onPointerDown }) {
  return (
    <button
      type="button"
      aria-label={side === 'start' ? 'Drag the clip start' : 'Drag the clip end'}
      disabled={disabled}
      onPointerDown={onPointerDown}
      className={`pointer-events-auto absolute inset-y-0 flex w-3 items-center justify-center bg-amber-400 transition-colors hover:bg-amber-300 disabled:cursor-wait ${
        side === 'start' ? 'left-0 cursor-ew-resize rounded-l-md' : 'right-0 cursor-ew-resize rounded-r-md'
      }`}
    >
      <span className="h-5 w-[3px] rounded-full bg-black/35" />
    </button>
  );
}

function Readout({ label, value, accent, extra }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">{label}</span>
      <span className={`font-mono text-[12px] tabular-nums ${accent ? 'text-amber-300' : 'text-zinc-200'}`}>{value}</span>
      {extra && <span className="font-mono text-[10px] text-amber-400/80">{extra}</span>}
    </div>
  );
}

function Ghost({ children, onClick, title, disabled, icon: Icon, className = '' }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:bg-transparent ${className}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
      {children}
    </button>
  );
}

export default function TrimBar({ jobId, clip, busy, collapsed, onToggleCollapsed, onApply }) {
  const [context, setContext] = useState(() => readPref('studio.trimContext', 30));
  const [src, setSrc] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [range, setRange] = useState({ start: clip.start, end: clip.end });
  const [snap, setSnap] = useState(true);
  const [playhead, setPlayhead] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [dismissed, setDismissed] = useState(null);
  const [width, setWidth] = useState(0);
  const trackRef = useRef(null);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const raf = useRef(0);
  const drag = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api(`/api/jobs/${jobId}/clips/${clip.id}/source?context=${context}`)
      .then((d) => { if (!cancelled) setSrc(d); })
      .catch((err) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [jobId, clip.id, context]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed]);

  const applied = { start: clip.start, end: clip.end };
  const win = src?.window || { from: Math.max(0, clip.start - context), to: clip.end + context };
  const span = Math.max(0.001, win.to - win.from);
  const pct = (t) => clamp(((t - win.from) / span) * 100, 0, 100);
  const limits = src?.limits || { min: 3, max: 180 };
  const coverage = src?.video ? { from: src.video.from, to: src.video.to } : null;
  const lo = src?.canFetch || !coverage ? win.from : Math.max(win.from, coverage.from);
  const hi = src?.canFetch || !coverage ? win.to : Math.min(win.to, coverage.to);
  const covered = (t) => Boolean(coverage) && t >= coverage.from && t <= coverage.to;

  const original = src?.original || applied;
  const changed = !near(range.start, applied.start) || !near(range.end, applied.end);
  const atOriginal = near(range.start, original.start) && near(range.end, original.end);
  const duration = range.end - range.start;
  const delta = duration - (applied.end - applied.start);
  const needsDownload = Boolean(src) && changed && !(coverage && range.start >= coverage.from + 0.02 && range.end <= coverage.to - 0.05);
  const serverError = clip.trim?.error && clip.trim.error !== dismissed ? clip.trim.error : null;
  const error = applyError || serverError || loadError;

  // ── preview: source audio drives the clock, downloaded video follows it ─────────────────────────
  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    audioRef.current?.pause();
    videoRef.current?.pause();
    setPlaying(false);
  }, []);
  useEffect(() => stop, [stop]);

  const seekPreview = (t) => {
    setPlayhead(t);
    const v = videoRef.current;
    if (v && src?.video && covered(t)) v.currentTime = Math.max(0, t - src.video.offset);
  };

  const playFrom = (from, until) => {
    const a = audioRef.current;
    if (!a) return;
    stop();
    a.currentTime = from;
    a.play().then(() => {
      setPlaying(true);
      const tick = () => {
        const t = a.currentTime;
        setPlayhead(t);
        const v = videoRef.current;
        if (v && src?.video && covered(t)) {
          const want = t - src.video.offset;
          if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;
          if (v.paused) v.play().catch(() => {});
        } else if (v && !v.paused) {
          v.pause();
        }
        if (t >= until || a.ended) { stop(); return; }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }).catch(() => setPlaying(false));
  };

  // ── drag: handles, the length pill (moves both), or scrub anywhere on the track ─────────────────
  const words = src?.words || [];
  const pxPerSec = width / span;
  const snapTo = (t, edge, altKey) => {
    if (!snap || altKey || !words.length || !pxPerSec) return t;
    const tol = SNAP_PX / pxPerSec;
    let best = t;
    let bestD = tol;
    for (const w of words) {
      const c = edge === 'start' ? w.s - LEAD_IN : w.e + TAIL_OUT;
      const d = Math.abs(c - t);
      if (d <= bestD) { best = c; bestD = d; }
    }
    return best;
  };
  const timeAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    return win.from + clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * span;
  };

  const startDrag = (kind) => (e) => {
    if (!src || busy || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    stop();
    const t0 = timeAt(e.clientX);
    drag.current = { kind, t0, range0: range };
    if (kind === 'scrub') seekPreview(t0);
    const move = (ev) => {
      const d = drag.current;
      if (!d) return;
      const t = timeAt(ev.clientX);
      const { start, end } = d.range0;
      if (d.kind === 'start') {
        const s = clamp(snapTo(t, 'start', ev.altKey), Math.max(lo, end - limits.max), end - limits.min);
        setRange({ start: round2(s), end });
        seekPreview(s);
      } else if (d.kind === 'end') {
        const en = clamp(snapTo(t, 'end', ev.altKey), start + limits.min, Math.min(hi, start + limits.max));
        setRange({ start, end: round2(en) });
        seekPreview(en);
      } else if (d.kind === 'move') {
        const len = end - start;
        const s = clamp(snapTo(start + (t - d.t0), 'start', ev.altKey), lo, hi - len);
        setRange({ start: round2(s), end: round2(s + len) });
        seekPreview(s);
      } else {
        seekPreview(t);
      }
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const apply = async () => {
    stop();
    setApplyError(null);
    setDismissed(clip.trim?.error || null);
    try {
      await onApply(range);
    } catch (err) {
      setApplyError(err.message);
    }
  };

  // ── track content ──────────────────────────────────────────────────────────────────────────────
  const labels = useMemo(() => {
    if (!src || !width) return [];
    const inClip = (w) => w.s >= clip.start - 0.05 && w.e <= clip.end + 0.05;
    const items = [
      ...src.words.filter((w) => !inClip(w)).map((w) => ({ text: w.w, s: w.s, caption: false })),
      ...src.captions.map((w) => ({ text: w.text, s: w.s, caption: true })),
    ].sort((a, b) => a.s - b.s);
    const out = [];
    let free = -Infinity;
    for (const it of items) {
      const x = ((it.s - src.window.from) / (src.window.to - src.window.from)) * width;
      if (x < 0 || x > width - 12 || x < free) continue;
      out.push({ ...it, x });
      free = x + it.text.length * 5.6 + 8;
    }
    return out;
  }, [src, width, clip.start, clip.end]);

  const sentenceEnds = useMemo(() => words.filter((w) => /[.!?।]["'”’)]*$/.test(w.w)).map((w) => w.e), [words]);

  const ticks = useMemo(() => {
    if (!width) return [];
    const every = TICK_STEPS.find((s) => (s * width) / span >= 76) || 1200;
    const out = [];
    for (let t = Math.ceil(win.from / every) * every; t <= win.to; t += every) out.push(t);
    return out;
  }, [width, span, win.from, win.to]);

  const monitorTime = playhead ?? range.start;
  const trimPct = Math.round((clip.trim?.progress || 0) * 100);

  return (
    <section className="shrink-0 border-t border-white/[0.06] bg-zinc-900/60" aria-label="Trim clip">
      {src?.audio && <audio ref={audioRef} src={src.audio.url} preload="auto" />}

      <div className="flex h-10 items-center gap-4 px-3 sm:px-4">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <Scissors className="h-3.5 w-3.5 text-amber-400" strokeWidth={2} />
          Trim
        </div>
        <Readout label="In" value={fmtClock(range.start)} accent={!near(range.start, applied.start)} />
        <Readout label="Out" value={fmtClock(range.end)} accent={!near(range.end, applied.end)} />
        <Readout
          label="Length"
          value={`${duration.toFixed(1)}s`}
          extra={changed && Math.abs(delta) >= 0.05 ? `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}s` : null}
        />
        {(duration < 12 || duration > 90) && (
          <span className="hidden text-[10px] text-zinc-500 2xl:inline">outside the 12–90 s the curator aims for</span>
        )}
        {error && (
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={error}>{error}</span>
            <button type="button" aria-label="Dismiss" className="rounded p-0.5 text-red-300/70 hover:text-red-200" onClick={() => { setApplyError(null); setDismissed(clip.trim?.error || null); setLoadError(null); }}>
              <X className="h-3 w-3" />
            </button>
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {!collapsed && (
            <>
              <div className="mr-1 hidden items-center rounded-lg bg-black/30 p-0.5 ring-1 ring-white/[0.05] lg:flex">
                {CONTEXTS.map((c) => (
                  <button
                    key={c.sec}
                    type="button"
                    onClick={() => { setContext(c.sec); writePref('studio.trimContext', c.sec); }}
                    className={`rounded-md px-2 py-0.5 font-mono text-[10px] transition-colors ${context === c.sec ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                title="Snap to word boundaries (hold Alt while dragging to move freely)"
                onClick={() => setSnap((s) => !s)}
                className={`rounded-md p-1.5 transition-colors ${snap ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-600 hover:text-zinc-300'}`}
              >
                <Magnet className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <Ghost className="hidden xl:flex" disabled={!src?.audio} title="Hear the first 3 seconds" onClick={() => playFrom(range.start, Math.min(range.end, range.start + EDGE_PREVIEW_SEC))}>Hear in</Ghost>
              <Ghost className="hidden xl:flex" disabled={!src?.audio} title="Hear the last 3 seconds" onClick={() => playFrom(Math.max(range.start, range.end - EDGE_PREVIEW_SEC), range.end)}>Hear out</Ghost>
              <button
                type="button"
                disabled={!src?.audio}
                aria-label={playing ? 'Stop preview' : 'Play the trimmed range'}
                title={playing ? 'Stop' : 'Play the trimmed range'}
                onClick={() => (playing ? stop() : playFrom(range.start, range.end))}
                className="mx-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-white transition-colors hover:bg-white/[0.14] disabled:opacity-40"
              >
                {playing ? <Pause className="h-3 w-3 fill-white" /> : <Play className="ml-0.5 h-3 w-3 fill-white" />}
              </button>
            </>
          )}
          {changed && !busy && <Ghost onClick={() => setRange(applied)}>Cancel</Ghost>}
          {!atOriginal && !busy && <Ghost icon={RotateCcw} title="Back to the range the curator picked" onClick={() => setRange(original)}>AI pick</Ghost>}
          {busy ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="max-w-[220px] truncate">{clip.trim?.stage || 'Trimming'}</span>
              <span className="font-mono text-[10px] text-amber-400/70">{trimPct}%</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={!changed || !src}
              onClick={apply}
              title={needsDownload ? 'This range reaches past the downloaded video; the missing seconds download first' : undefined}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                changed && src
                  ? 'cursor-pointer bg-amber-500 text-white shadow-lg shadow-amber-400/20 hover:bg-amber-400'
                  : 'cursor-not-allowed bg-white/[0.04] text-zinc-600'
              }`}
            >
              {needsDownload ? 'Download & apply' : 'Apply trim'}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Show the trim track' : 'Hide the trim track'}
            className="ml-1 rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="flex h-[92px] items-stretch gap-3 px-3 pb-2.5 sm:px-4">
          <div className="relative w-[164px] shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-white/[0.06]">
            {src?.video && <video ref={videoRef} src={src.video.url} muted playsInline preload="auto" className="h-full w-full object-contain" />}
            {src && !covered(monitorTime) && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/90 px-3 text-center text-[10px] leading-snug text-zinc-500">
                {src.canFetch ? 'Not downloaded yet: fetched when you apply' : 'No video here'}
              </div>
            )}
            <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1 font-mono text-[9px] tabular-nums text-white/80">{fmtClock(monitorTime)}</span>
            <span className="absolute bottom-1 right-1.5 text-[8px] font-bold uppercase tracking-widest text-white/35">Source</span>
          </div>

          <div
            ref={trackRef}
            onPointerDown={startDrag('scrub')}
            className={`relative min-w-0 flex-1 select-none overflow-hidden rounded-lg bg-black/30 ring-1 ring-white/[0.05] ${src && !busy ? 'cursor-crosshair' : ''}`}
          >
            {!src && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-600">
                {loadError ? 'The source track could not load.' : <span className="animate-pulse">Loading the source around this clip…</span>}
              </div>
            )}
            {src && (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[22px] border-b border-white/[0.04]">
                  {labels.map((l) => (
                    <span
                      key={`${l.s}-${l.text}`}
                      className={`absolute top-[5px] whitespace-nowrap text-[10px] leading-none ${l.caption ? 'text-zinc-300' : 'text-zinc-600'}`}
                      style={{ left: l.x }}
                    >
                      {l.text}
                    </span>
                  ))}
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-[18px] top-[22px]">
                  <Waveform loud={src.loud} win={win} className="fill-white/[0.13]" />
                  <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pct(range.end)}% 0 ${pct(range.start)}%)` }}>
                    <Waveform loud={src.loud} win={win} className="fill-amber-400/75" />
                  </div>
                  {sentenceEnds.map((t) => (
                    <span key={t} className="absolute bottom-0 h-1.5 w-px bg-white/25" style={{ left: `${pct(t)}%` }} />
                  ))}
                </div>

                <div
                  className="pointer-events-none absolute inset-x-0 bottom-[14px] h-[3px]"
                  title="Downloaded video"
                  style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.09) 0 4px, transparent 4px 8px)' }}
                >
                  {coverage && (
                    <div className="absolute inset-y-0 bg-white/35" style={{ left: `${pct(coverage.from)}%`, width: `${pct(coverage.to) - pct(coverage.from)}%` }} />
                  )}
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[14px]">
                  {ticks.map((t) => (
                    <span key={t} className="absolute bottom-[1px] -translate-x-1/2 font-mono text-[9px] tabular-nums text-zinc-600" style={{ left: `${pct(t)}%` }}>
                      {fmtClock(t, false)}
                    </span>
                  ))}
                </div>

                <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/50" style={{ width: `${pct(range.start)}%` }} />
                <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/50" style={{ width: `${100 - pct(range.end)}%` }} />

                {changed && (
                  <div
                    className="pointer-events-none absolute bottom-[18px] top-[22px] rounded-sm border border-dashed border-white/30"
                    title="Current clip"
                    style={{ left: `${pct(applied.start)}%`, width: `${pct(applied.end) - pct(applied.start)}%` }}
                  />
                )}
                {!atOriginal && [original.start, original.end].map((t) => (
                  <span key={t} title="The curator's pick" className="pointer-events-none absolute top-[22px] h-2.5 w-[2px] rounded-b bg-sky-300/70" style={{ left: `${pct(t)}%` }} />
                ))}

                <div
                  className="pointer-events-none absolute inset-y-0 border-y-2 border-amber-400"
                  style={{ left: `${pct(range.start)}%`, width: `${pct(range.end) - pct(range.start)}%` }}
                >
                  <Handle side="start" disabled={busy} onPointerDown={startDrag('start')} />
                  <Handle side="end" disabled={busy} onPointerDown={startDrag('end')} />
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Drag to move the whole clip"
                    title="Drag to move the whole clip"
                    onPointerDown={startDrag('move')}
                    className="pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2 cursor-grab rounded-b-md bg-amber-400 px-2 py-px font-mono text-[9px] font-bold text-black/80 active:cursor-grabbing disabled:cursor-wait"
                  >
                    {fmtLength(duration)}
                  </button>
                </div>

                {playhead != null && playhead >= win.from && playhead <= win.to && (
                  <div className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]" style={{ left: `${pct(playhead)}%` }} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
