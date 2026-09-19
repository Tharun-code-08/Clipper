// Reference: graphics/january.mp4  (window 440-6920ms, grid full ~5080ms)
// A month grid filling a week at a time, with one date marked.
//
// The weekday the month starts on is computed with Zeller's congruence from the year and month the
// user types. `new Date()` is banned here — it reads the wall clock, so the same project would
// render a different calendar tomorrow, and the preview would disagree with the export mid-render.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGlow, luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Zeller's congruence — day of week (0=Sun) for the 1st of a month. Pure arithmetic, no clock. */
function firstWeekday(year: number, month1: number): number {
  let m = month1;
  let y = year;
  if (m < 3) { m += 12; y -= 1; }
  const k = y % 100;
  const j = Math.floor(y / 100);
  const h = (1 + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
  // Zeller yields 0=Saturday; shift to 0=Sunday.
  return (h + 6) % 7;
}

function daysInMonth(year: number, month1: number): number {
  if (month1 === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month1) ? 30 : 31;
}

export const calendarMonth = defineGraphicsTemplate({
  id: 'calendar_month',
  name: 'Calendar Month',
  category: 'chart',
  tags: ['Calendar', 'Date', 'Schedule'],
  design: { w: 900, h: 1500 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'sheet',  label: 'Sheet', hideable: false },
    { key: 'title',  label: 'Month title' },
    { key: 'header', label: 'Weekday row' },
    { key: 'grid',   label: 'Date grid' },
    { key: 'mark',   label: 'Marked date' },
  ],

  params: [
    { type: 'number', key: 'year',  label: 'Year',  group: 'Content', default: 2026, min: 1900, max: 2200, step: 1 },
    { type: 'number', key: 'month', label: 'Month', group: 'Content', default: 1, min: 1, max: 12, step: 1 },
    { type: 'number', key: 'mark',  label: 'Marked date', group: 'Content', default: 21, min: 0, max: 31, step: 1,
      help: '0 marks nothing.' },

    { type: 'color',  key: 'bg',     label: 'Sheet',  group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'ink',    label: 'Dates',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Weekdays', group: 'Style', default: '#8F8B81' },
    { type: 'color',  key: 'accent', label: 'Marked', group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Title size', group: 'Style', default: 52, min: 12, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'date',   label: 'Date size',  group: 'Style', default: 33, min: 8, max: 70, step: 1, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the sheet', group: 'Style', default: true },

    { type: 'number', key: 'titleAt', label: 'Title at', group: 'Motion', default: 150, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First week at', group: 'Motion', default: 500, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'perWeek', label: 'Per week', group: 'Motion', default: 800, min: 60, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'markAt',  label: 'Mark at',  group: 'Motion', default: 4600, min: 0, max: 9000, step: 50, unit: 'ms' },
  ],

  // Quiet DOCU palette: air pass with the title, ONE tick as the first week prints, and a
  // glossy pop when the marked date punches in — all riding the same Motion params.
  sfx: (p) => [
    { atMs: p.titleAt, id: 'whoosh', gain: 0.4 },
    { atMs: p.firstAt, id: 'tick', gain: 0.45 },
    { atMs: p.markAt, id: 'pop', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const month = Math.min(12, Math.max(1, Math.round(p.month)));
    const year = Math.round(p.year);
    const start = firstWeekday(year, month);
    const days = daysInMonth(year, month);
    const cells = start + days;
    const weeks = Math.ceil(cells / 7);

    const at = (ms: number) => spring({
      frame: fr(timeMs - ms), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 175 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const markInAt = (ms: number) => spring({
      frame: fr(ms - p.markAt), fps: FPS,
      config: { damping: 13, mass: 0.5, stiffness: 230 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const markIn = markInAt(timeMs);
    // The mark's punch velocity smears its glyph mid-flight and lands it crisp.
    const vMark = vel(markInAt, timeMs) * p.date * 0.5;
    const markSm = smear(0, vMark);

    // Depth: the sheet swings in top-hinged and holds a faint 3D sway; the title and the
    // weekday header ride different parallax depths so the sway shears them over the grid.
    const sheetIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const pose = depthPose(timeMs, seed, { enter: sheetIn, rx: -10, z: -60, swayDeg: 1.4 });
    const parTitle = parallax(timeMs, seed, 0.5, height * 0.006);
    const parHeader = parallax(timeMs, seed, 0.35, height * 0.006);

    const pad = width * 0.09;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill
            ? `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 42%), ${p.bg}`
            : 'transparent',
          padding: pad, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: p.size * 1.2,
          fontFamily: ff,
          transform: pose, transformOrigin: '50% 30%',
          ...el('sheet'),
        }}
      >
        <div
          style={{
            opacity: clamp01(at(p.titleAt) * 1.6),
            transform: `translate(${parTitle.x.toFixed(2)}px, ${(parTitle.y + (1 - at(p.titleAt)) * height * 0.012).toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          <div style={{ fontSize: p.size, fontWeight: 700, color: p.ink, lineHeight: 1.1, letterSpacing: '0.01em' }}>{MONTHS[month - 1]}</div>
          <div style={{ fontSize: p.size * 0.42, fontWeight: 600, letterSpacing: '0.18em', color: p.dim, marginTop: p.size * 0.1 }}>{year}</div>
        </div>

        <div
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            fontSize: p.date * 0.56, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: p.dim, textAlign: 'center',
            opacity: clamp01(at(p.titleAt + 200) * 1.6),
            transform: `translate(${parHeader.x.toFixed(2)}px, ${parHeader.y.toFixed(2)}px)`,
            ...el('header'),
          }}
        >
          {DOW.map((d) => <span key={d}>{d}</span>)}
        </div>

        <div
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            rowGap: p.date * 0.55, columnGap: 0,
            fontSize: p.date, color: p.ink, textAlign: 'center',
            ...el('grid'),
          }}
        >
          {Array.from({ length: weeks * 7 }).map((_, i) => {
            const day = i - start + 1;
            if (day < 1 || day > days) return <span key={i} />;
            const week = Math.floor(i / 7);
            const s = at(p.firstAt + week * p.perWeek);
            const marked = p.mark > 0 && day === Math.round(p.mark);
            return (
              <span
                key={i}
                style={{
                  opacity: clamp01(s * 1.8),
                  // Z-stagger: each week's dates hinge down from the sheet at a slightly
                  // steeper angle, arriving as objects in space rather than fading spans.
                  transform: `${swingIn(s, { rx: -12 - week * 2, z: -40 })} translateY(${((1 - s) * p.date * 0.5).toFixed(2)}px)`,
                  transformOrigin: '50% 0%',
                  color: marked ? p.accent : p.ink,
                  fontWeight: marked ? 700 : 400,
                  textShadow: marked ? luxeGlow(p.accent, 0.7) : undefined,
                  ...(marked
                    ? {
                        ...el('mark'),
                        // The mark punches in on its own beat, after its week has landed.
                        display: 'inline-block',
                      }
                    : {}),
                }}
              >
                {marked ? (
                  <span
                    style={{
                      display: 'inline-block',
                      // Punch velocity → smear; dies the frame the spring settles.
                      filter: markSm.blurPx > 0.3 ? `blur(${markSm.blurPx.toFixed(2)}px)` : undefined,
                      transform: `scale(${((1 + (1 - clamp01(markIn)) * 0.5) * markSm.sx).toFixed(4)}, ${((1 + (1 - clamp01(markIn)) * 0.5) * markSm.sy).toFixed(4)})`,
                      opacity: clamp01(markIn * 1.4) + (1 - clamp01(markIn)) * 0.35,
                    }}
                  >
                    {day}
                  </span>
                ) : day}
              </span>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 'auto', height: 1.5,
            background: `repeating-linear-gradient(90deg, ${rgba(p.dim, 0.45)} 0 3px, transparent 3px 11px)`,
          }}
        />

        {p.fill && <div style={luxeVignette(0.4)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
