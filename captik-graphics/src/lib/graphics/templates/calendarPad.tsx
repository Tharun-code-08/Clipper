// Reference: graphics/june.mp4  (window 0-6000ms, pad full ~4000ms)
// A desk-calendar pad — binding rings at the top, a coloured header, and date chips popping in.
// Distinct from calendar_month, which is a flat sheet: this one is a physical object, and the
// rings and the header block are what sell that.
//
// Chips are seeded a colour by ABSOLUTE date, so changing the month never re-colours the dates
// before the change.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, swingIn } from '../juice';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Zeller's congruence — pure arithmetic, no wall clock. */
function firstWeekday(year: number, month1: number): number {
  let m = month1; let y = year;
  if (m < 3) { m += 12; y -= 1; }
  const k = y % 100; const j = Math.floor(y / 100);
  return ((1 + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7 + 6) % 7;
}
function daysInMonth(year: number, month1: number): number {
  if (month1 === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month1) ? 30 : 31;
}

export const calendarPad = defineGraphicsTemplate({
  id: 'calendar_pad',
  name: 'Calendar Pad',
  category: 'chart',
  tags: ['Calendar', 'Desk', 'Dates'],
  design: { w: 900, h: 1000 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 82 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'pad',    label: 'Pad', hideable: false },
    { key: 'rings',  label: 'Binding rings' },
    { key: 'header', label: 'Header' },
    { key: 'grid',   label: 'Date grid' },
  ],

  params: [
    { type: 'number', key: 'year',  label: 'Year',  group: 'Content', default: 2024, min: 1900, max: 2200, step: 1 },
    { type: 'number', key: 'month', label: 'Month', group: 'Content', default: 6, min: 1, max: 12, step: 1 },
    { type: 'text',   key: 'accents', label: 'Chip colours', group: 'Content', maxLength: 120,
      default: '#c0504e,#c98e44,#4e8f6b,#4a6fa5,#9a5b84',
      help: 'Comma-separated. Some dates get a coloured chip; the rest stay plain.' },
    { type: 'number', key: 'density', label: 'Coloured share', group: 'Content', default: 0.45, min: 0, max: 1, step: 0.05 },

    { type: 'color',  key: 'bg',     label: 'Backdrop', group: 'Style', default: '#f2ece1' },
    { type: 'color',  key: 'pad',    label: 'Pad',      group: 'Style', default: '#FFFDF8' },
    { type: 'color',  key: 'header', label: 'Header',   group: 'Style', default: '#DDB56A' },
    { type: 'color',  key: 'ink',    label: 'Dates',    group: 'Style', default: '#2a2a30' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',   label: 'Header size', group: 'Style', default: 68, min: 10, max: 120, step: 2, unit: 'px' },
    { type: 'number', key: 'date',   label: 'Date size', group: 'Style', default: 38, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Pad corner', group: 'Style', default: 26, min: 0, max: 80, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the backdrop', group: 'Style', default: true },

    { type: 'number', key: 'padAt',   label: 'Pad at',   group: 'Motion', default: 120, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First date at', group: 'Motion', default: 600, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Date stagger', group: 'Motion', default: 70, min: 0, max: 400, step: 5, unit: 'ms' },
  ],

  // PAPER language: the pad flicks onto the desk, then a soft pop as the date chips start
  // landing — both riding the same Motion params as the animation.
  sfx: (p) => [
    { atMs: p.padAt + 80, id: 'paper', gain: 0.55 },
    { atMs: p.firstAt, id: 'pop', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const ff = fontStack(p.font);
    const month = Math.min(12, Math.max(1, Math.round(p.month)));
    const year = Math.round(p.year);
    const start = firstWeekday(year, month);
    const days = daysInMonth(year, month);
    const weeks = Math.ceil((start + days) / 7);
    const accents = p.accents.split(',').map((s) => s.trim()).filter(Boolean);
    const pal = accents.length ? accents : ['#e5484d'];

    const padIn = spring({
      frame: fr(timeMs - p.padAt), fps: FPS,
      config: { damping: 20, mass: 0.9, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    // Depth: the pad is a physical object — it swings onto the desk top-hinged on its own
    // entrance spring, then keeps a casual sway. Rings and header sit at different parallax
    // depths so the sway shears them over the date grid. The backdrop stays put.
    const pose = depthPose(timeMs, seed, { enter: padIn, rx: -14, z: -80, swayDeg: 1.6 });
    const parHeader = parallax(timeMs, seed, 0.3, height * 0.006);
    const parRings = parallax(timeMs, seed, 0.55, height * 0.006);

    const padW = width * 0.94;
    const padX = (width - padW) / 2;
    const padY = height * 0.04;
    const padH = height * 0.92;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          fontFamily: ff,
          ...el('pad'),
        }}
      >
        {/* One shared 3D pose for pad + rings, so the object never splits apart mid-sway. */}
        <div style={{ position: 'absolute', inset: 0, transform: pose, transformOrigin: '50% 22%' }}>
        <div
          style={{
            position: 'absolute', left: padX, top: padY, width: padW, height: padH,
            background: p.pad, borderRadius: p.radius,
            border: `1px solid ${rgba('#000000', 0.06)}`,
            boxShadow: `0 ${width * 0.012}px ${width * 0.03}px ${rgba('#000000', 0.1)}, 0 ${width * 0.045}px ${width * 0.1}px ${rgba('#000000', 0.16)}`,
            overflow: 'hidden',
            opacity: clamp01(padIn * 1.8),
            transform: `translateY(${((1 - padIn) * height * 0.03).toFixed(2)}px) scale(${interpolate(padIn, [0, 1], [0.94, 1]).toFixed(4)})`,
          }}
        >
          <div
            style={{
              height: padH * 0.21,
              background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.07) 100%), ${p.header}`,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              paddingBottom: padH * 0.05,
              fontSize: p.size, fontWeight: 700, color: '#3a2a10', letterSpacing: '0.015em',
              transform: `translate(${parHeader.x.toFixed(2)}px, ${parHeader.y.toFixed(2)}px)`,
              ...el('header'),
            }}
          >
            {MONTHS[month - 1]} {year}
          </div>

          <div
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              padding: `${padH * 0.03}px ${padW * 0.05}px ${padH * 0.05}px`,
              boxSizing: 'border-box',
              // The pad body is a fixed object; the grid must fill it whether the month runs 4
              // weeks or 6, so rows are distributed rather than stacked from the top.
              height: padH * 0.79,
              alignContent: 'space-around',
              columnGap: 0,
              justifyItems: 'center',
              ...el('grid'),
            }}
          >
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span
                key={i}
                style={{
                  fontSize: p.date * 0.6, fontWeight: 700, color: rgba(p.ink, 0.4),
                  letterSpacing: 0.5, opacity: clamp01(padIn),
                }}
              >
                {d}
              </span>
            ))}
            {Array.from({ length: weeks * 7 }).map((_, i) => {
              const day = i - start + 1;
              if (day < 1 || day > days) return <span key={i} />;
              const s = spring({
                frame: fr(timeMs - p.firstAt - (day - 1) * p.stagger), fps: FPS,
                config: { damping: 15, mass: 0.5, stiffness: 220 },
                durationInFrames: Math.max(1, Math.round(fr(380))),
              });
              // Seeded by ABSOLUTE date, so changing the month never recolours earlier dates.
              const on = random(`${seed}c${day}`) < p.density;
              const tint = pal[day % pal.length];
              // Z-stagger: chips tip in from slightly different angles and carry a landing
              // smear that dies as their spring settles.
              const chipBlur = s > 0.001 && s < 0.985 ? (1 - Math.min(1, s)) * 2.5 : 0;
              return (
                <span
                  key={i}
                  style={{
                    width: p.date * (on ? 1.9 : 2.3), height: p.date * (on ? 1.9 : 2.3),
                    borderRadius: on ? '50%' : p.date * 0.35,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: on ? tint : rgba('#3a2a10', 0.06),
                    color: on ? '#FFFDF8' : p.ink,
                    boxShadow: on ? `0 2px 6px ${rgba(tint, 0.35)}` : undefined,
                    fontSize: p.date * 0.8, fontWeight: on ? 700 : 500,
                    opacity: clamp01(s * 2),
                    filter: chipBlur > 0.3 ? `blur(${chipBlur.toFixed(2)}px)` : undefined,
                    transform: `${swingIn(s, { rx: -12 - (day % 3) * 4, z: -40 })} scale(${interpolate(s, [0, 1], [0.3, 1]).toFixed(4)})`,
                  }}
                >
                  {day}
                </span>
              );
            })}
          </div>
        </div>

        <div
          style={{
            position: 'absolute', left: padX, top: padY + padH * 0.03, width: padW,
            display: 'flex', justifyContent: 'space-around',
            opacity: clamp01(padIn),
            transform: `translate(${parRings.x.toFixed(2)}px, ${parRings.y.toFixed(2)}px)`,
            ...el('rings'),
          }}
        >
          {[0, 1].map((k) => (
            <span
              key={k}
              style={{
                width: padW * 0.13, height: height * 0.05,
                borderRadius: height * 0.02,
                background: `linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(0,0,0,0.04) 100%), ${p.pad}`,
                border: `${Math.max(2, width * 0.004)}px solid ${rgba('#000000', 0.1)}`,
                boxShadow: `0 ${height * 0.006}px ${height * 0.016}px ${rgba('#000000', 0.14)}`,
                boxSizing: 'border-box',
              }}
            />
          ))}
        </div>
        </div>
      </div>
    );
  },
});
