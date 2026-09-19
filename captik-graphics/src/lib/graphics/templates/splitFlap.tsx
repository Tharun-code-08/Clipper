// Reference: text/flights-animation.mp4  (window 480-5280ms, board fully resolved ~3600ms)
// An airport split-flap board. Every cell scrambles through characters and then LOCKS, left to
// right, row by row — so the board resolves as a diagonal wipe rather than all at once.
//
// The scramble has to be pure: the glyph shown is `random(seed + row + col + tickIndex)`, where the
// tick index is floor(timeMs / flipMs). Same millisecond, same character, on every surface — and it
// still looks like noise. Math.random() here would give a different board in the preview and in
// every single exported frame.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax } from '../juice';

const MAX_ROWS = 8;
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const splitFlap = defineGraphicsTemplate({
  id: 'split_flap',
  name: 'Split-Flap Board',
  category: 'chart',
  tags: ['Board', 'Airport', 'Reveal'],
  design: { w: 900, h: 560 },
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 19, widthPercent: 96 },
  fonts: ['inter', 'pixel'],

  elements: [
    { key: 'board',  label: 'Board', hideable: false },
    { key: 'title',  label: 'Title' },
    { key: 'header', label: 'Column headers' },
    ...Array.from({ length: MAX_ROWS }, (_, i) => ({ key: `row${i + 1}`, label: `Row ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'title',   label: 'Title',   group: 'Content', default: 'ARRIVALS', maxLength: 24 },
    { type: 'text', key: 'headers', label: 'Columns', group: 'Content', default: 'TIME|DESTINATION|FLIGHT', maxLength: 60,
      help: 'Pipe-separated.' },
    { type: 'text', key: 'rows', label: 'Rows', group: 'Content', multiline: true, maxLength: 500,
      default:
        '09:15|TOKYO|JL 5021\n'
        + '10:30|PARIS|AF 1243\n'
        + '11:45|NEW YORK|AA 9876\n'
        + '13:05|SINGAPORE|SQ 0421\n'
        + '14:20|DUBAI|EK 5560',
      help: 'One flight per line, columns pipe-separated.' },

    { type: 'color',  key: 'ink',   label: 'Text',     group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'cell',  label: 'Cell',     group: 'Style', default: '#151518' },
    { type: 'color',  key: 'dim',   label: 'Headers',  group: 'Style', default: '#8C887D' },
    { type: 'font',   key: 'font',  label: 'Font',     group: 'Style', default: 'pixel' },
    { type: 'number', key: 'size',  label: 'Cell size', group: 'Style', default: 44, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Cell gap',  group: 'Style', default: 4, min: 0, max: 16, step: 1, unit: 'px' },
    { type: 'boolean', key: 'cells', label: 'Draw cell tiles', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'Starts at',     group: 'Motion', default: 200, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'rowGapMs', label: 'Row stagger',  group: 'Motion', default: 480, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'colGapMs', label: 'Letter stagger', group: 'Motion', default: 55, min: 0, max: 400, step: 5, unit: 'ms' },
    { type: 'number', key: 'flipMs',  label: 'Flip speed',    group: 'Motion', default: 60, min: 16, max: 400, step: 4, unit: 'ms' },
  ],

  // Mechanical palette, first pass only: air as the board swings in, ONE tick as the first row
  // starts clattering (a tick per flap would be a metronome), and a chime when the final cell
  // locks — its instant computed from the same rows/rowGapMs/colGapMs clock the flaps use.
  sfx: (p) => {
    const heads = p.headers.split('|').map((s) => s.trim());
    const rows = p.rows.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_ROWS)
      .map((l) => l.split('|').map((s) => s.trim()));
    const nRows = Math.max(1, rows.length);
    const cols = Math.max(heads.length, ...rows.map((r) => r.length), 1);
    const last = rows[nRows - 1] ?? [];
    let lastCell = 0;
    for (let c = 0; c < cols; c++) {
      const len = (last[c] ?? '').length;
      if (len > 0) lastCell = Math.max(lastCell, c * 4 + len - 1);
    }
    const lastLock = p.firstAt + (nRows - 1) * p.rowGapMs + 600 + lastCell * p.colGapMs;
    return [
      { atMs: 40, id: 'whoosh', gain: 0.35 },
      { atMs: p.firstAt, id: 'tick', gain: 0.5 },
      { atMs: lastLock + 150, id: 'chime', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, seed, width }) => {
    const ff = fontStack(p.font);
    const heads = p.headers.split('|').map((s) => s.trim());
    const rows = p.rows.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_ROWS)
      .map((l) => l.split('|').map((s) => s.trim()));
    const cols = Math.max(heads.length, ...rows.map((r) => r.length), 1);
    // Columns are as wide as their longest entry, so the flaps sit on one grid across the board
    // instead of three equal thirds with a ragged gutter.
    const colChars = Array.from({ length: cols }, (_, c) =>
      Math.max(heads[c]?.length ?? 0, ...rows.map((r) => (r[c] ?? '').length), 1));
    const grid = colChars.map((n) => `${n}fr`).join(' ');

    const boardIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const tick = Math.floor(timeMs / Math.max(1, p.flipMs));

    // Depth wraps the board: it swings in top-hinged and holds a ±1.5° sway while the title
    // and headers ride different parallax depths — the flap scramble cycle itself is untouched.
    const pose = depthPose(timeMs, seed, { enter: boardIn, rx: -14, z: -80, swayDeg: 1.5 });
    const parTitle = parallax(timeMs, seed, 0.5, width * 0.006);
    const parHead = parallax(timeMs, seed, 0.3, width * 0.006);
    // Mid-flip flaps carry a speed-scaled smear that vanishes the instant a cell locks; slow
    // flip settings fall below the visibility threshold and stay crisp throughout.
    const flapBlur = Math.min(1.8, 80 / Math.max(1, p.flipMs));

    /** One split-flap cell. `at` is when it stops scrambling, `from` when the row starts turning. */
    const flap = (target: string, key: string, at: number, k: string, from: number) => {
      if (timeMs < from) return <span key={key} style={{ width: p.size * 0.78, height: p.size * 1.45, marginRight: p.gap }} />;
      const locked = timeMs >= at;
      const ch = locked
        ? target
        : GLYPHS[Math.floor(random(`${seed}${k}${tick}`) * GLYPHS.length)];
      return (
        <span
          key={key}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: p.size * 0.78, height: p.size * 1.45,
            marginRight: p.gap,
            // The horizontal seam at 50% is the split-flap's material signature.
            background: p.cells
              ? `linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 48%, rgba(0,0,0,0.42) 50%, rgba(0,0,0,0.12) 54%, rgba(0,0,0,0.22) 100%), ${p.cell}`
              : undefined,
            border: p.cells ? '1px solid rgba(255,255,255,0.06)' : undefined,
            boxSizing: 'border-box',
            borderRadius: p.cells ? 3 : undefined,
            boxShadow: p.cells ? '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' : undefined,
            color: p.ink, fontSize: p.size, lineHeight: 1,
            textShadow: '0 1px 1px rgba(0,0,0,0.45)',
            filter: !locked && flapBlur > 0.3 ? `blur(${flapBlur.toFixed(2)}px)` : undefined,
            // The flap "settles" the instant it locks; before that it is mid-flip.
            transform: locked ? 'none' : `scaleY(${(0.55 + random(`${seed}${k}${tick}s`) * 0.45).toFixed(3)})`,
          }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      );
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          fontFamily: ff, padding: width * 0.03, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
          opacity: clamp01(boardIn),
          transform: pose,
          transformOrigin: '50% 30%',
          ...el('board'),
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: width * 0.02,
            color: p.ink, fontSize: p.size * 1.15, letterSpacing: p.size * 0.14,
            marginBottom: p.size * 0.5,
            transform: `translate(${parTitle.x.toFixed(2)}px, ${parTitle.y.toFixed(2)}px)`,
            ...el('title'),
          }}
        >
          <span style={{ color: p.dim, fontSize: p.size * 0.7 }}>✕</span>
          {p.title}
          <span style={{ color: p.dim, fontSize: p.size * 0.7 }}>✕</span>
        </div>

        <div
          style={{
            display: 'grid', gridTemplateColumns: grid,
            color: p.dim, fontSize: p.size * 0.52, letterSpacing: p.size * 0.08,
            paddingBottom: p.size * 0.35,
            borderBottom: `1.5px solid ${rgba(p.dim, 0.3)}`,
            transform: `translate(${parHead.x.toFixed(2)}px, ${parHead.y.toFixed(2)}px)`,
            ...el('header'),
          }}
        >
          {Array.from({ length: cols }, (_, c) => <span key={c}>{heads[c] ?? ''}</span>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: p.size * 0.22, paddingTop: p.size * 0.4 }}>
          {rows.map((row, r) => {
            // A row is blank until its turn: the board fills downward the way a real one does.
            const rowAt = p.firstAt + r * p.rowGapMs;
            return (
              <div
                key={r}
                style={{
                  display: 'grid', gridTemplateColumns: grid,
                  ...el(`row${r + 1}`),
                }}
              >
                {Array.from({ length: cols }, (_, c) => {
                  const text = (row[c] ?? '').toUpperCase();
                  return (
                    <span key={c} style={{ display: 'flex' }}>
                      {[...text].map((ch, i) =>
                        flap(ch, `${c}-${i}`, rowAt + 600 + (c * 4 + i) * p.colGapMs, `${r}_${c}_${i}`, rowAt))}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
