// PUNCH framework diagram — 2-4 thick-stroked caps boxes stamp down one per beat, then short
// amber arrows draw between them only after BOTH ends exist, so the flow reads as being built,
// not revealed. A '*' prefix promotes one box to an amber fill — the step being sold. Grid mode
// only engages at 3+ boxes; two boxes in a 2x2 read as a layout bug, so they stay a row.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, swingIn, vel } from '../juice';

const INK = '#F4F1E8';
const BG = '#0B0B0D';

/** Decaying settle-shake: pure function of ms-since-impact — zero before the hit, a couple of
 *  fast oscillations after, dead within ~450ms. Never random per frame. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

export const frameworkBoxes = defineGraphicsTemplate({
  id: 'framework_boxes',
  name: 'Framework',
  category: 'chart',
  tags: ['Boxes', 'Arrows', 'Flow', 'Diagram', 'Steps'],
  badge: 'New',
  design: { w: 900, h: 600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 85 },
  fonts: ['anton'],

  elements: [
    { key: 'box1',   label: 'Box 1' },
    { key: 'box2',   label: 'Box 2' },
    { key: 'box3',   label: 'Box 3' },
    { key: 'box4',   label: 'Box 4' },
    { key: 'arrows', label: 'Arrows' },
  ],

  params: [
    { type: 'text', key: 'box1', label: 'Box 1', group: 'Content', default: 'HOOK', maxLength: 16 },
    { type: 'text', key: 'box2', label: 'Box 2', group: 'Content', default: 'STORY', maxLength: 16 },
    { type: 'text', key: 'box3', label: 'Box 3', group: 'Content', default: '*OFFER', maxLength: 16,
      help: 'Prefix a label with * to fill that box amber.' },
    { type: 'text', key: 'box4', label: 'Box 4', group: 'Content', default: '', maxLength: 16 },
    { type: 'select', key: 'layout', label: 'Layout', group: 'Content', default: 'row',
      options: [
        { value: 'row',  label: 'Row' },
        { value: 'grid', label: 'Grid (2×2)' },
      ] },

    { type: 'color',   key: 'accent', label: 'Accent',          group: 'Style', default: '#F59E0B' },
    { type: 'font',    key: 'font',   label: 'Label font',      group: 'Style', default: 'anton' },
    { type: 'boolean', key: 'plate',  label: 'Draw background', group: 'Style', default: true },

    { type: 'number', key: 'stagger', label: 'Box stagger', group: 'Motion', default: 550, min: 200, max: 1200, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',       group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PUNCH language: air pass in, a slam as the first box stamps, the heaviest slam on the
  // last — beats ride the same 200 + i*stagger grid the boxes land on.
  sfx: (p) => {
    const n = Math.max(1, [p.box1, p.box2, p.box3, p.box4].map((s) => s.trim()).filter(Boolean).length);
    const cues: { atMs: number; id: 'whoosh' | 'slam'; gain?: number }[] = [
      { atMs: p.delay + 80, id: 'whoosh', gain: 0.5 },
      { atMs: p.delay + 200 + 160, id: 'slam', gain: n > 1 ? 0.6 : 0.9 },
    ];
    if (n > 1) cues.push({ atMs: p.delay + 200 + (n - 1) * p.stagger + 160, id: 'slam', gain: 0.9 });
    return cues;
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const slots = [p.box1, p.box2, p.box3, p.box4].map((s) => s.trim());
    const boxes = slots
      .map((raw, idx) => ({ idx, hot: raw.startsWith('*'), label: raw.replace(/^\*/, '').trim() }))
      .filter((b) => b.label.length > 0);
    if (!boxes.length) return null;
    const n = boxes.length;
    const grid = p.layout === 'grid' && n >= 3;

    let rects: { x: number; y: number; w: number; h: number }[];
    if (grid) {
      const w = width * 0.34, h = height * 0.3;
      // S-flow (TL → TR → BR → BL) so every consecutive arrow is a short straight hop,
      // never a diagonal across the middle.
      const centers: [number, number][] = [
        [width * 0.27, height * 0.29], [width * 0.73, height * 0.29],
        [width * 0.73, height * 0.71], [width * 0.27, height * 0.71],
      ];
      rects = boxes.map((_, i) => ({ x: centers[i][0] - w / 2, y: centers[i][1] - h / 2, w, h }));
    } else {
      const padX = width * 0.045, gap = width * 0.105;
      const w = (width - padX * 2 - gap * (n - 1)) / n;
      const h = height * 0.36, y = (height - h) / 2;
      rects = boxes.map((_, i) => ({ x: padX + i * (w + gap), y, w, h }));
    }

    const beat = (i: number) => 200 + i * p.stagger;

    // Arrows connect consecutive boxes edge-to-edge along the dominant axis.
    const arrows: { sx: number; sy: number; ex: number; ey: number; ux: number; uy: number; at: number }[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = rects[i], b = rects[i + 1];
      const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
      const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
      let sx: number, sy: number, ex: number, ey: number;
      if (Math.abs(bcx - acx) >= Math.abs(bcy - acy)) {
        const d = bcx > acx ? 1 : -1;
        sy = ey = (acy + bcy) / 2;
        sx = (d > 0 ? a.x + a.w : a.x) + d * 14;
        ex = (d > 0 ? b.x : b.x + b.w) - d * 14;
      } else {
        const d = bcy > acy ? 1 : -1;
        sx = ex = (acx + bcx) / 2;
        sy = (d > 0 ? a.y + a.h : a.y) + d * 14;
        ey = (d > 0 ? b.y : b.y + b.h) - d * 14;
      }
      const len = Math.hypot(ex - sx, ey - sy) || 1;
      arrows.push({ sx, sy, ex, ey, ux: (ex - sx) / len, uy: (ey - sy) / len, at: beat(i + 1) + 240 });
    }

    // Depth: the plate swings in top-hinged and keeps living in space (±1.8° sway) while
    // the boxes stamp onto it — the diagram reads as an object, not a web page.
    const plateIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 19, mass: 0.9, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const pose = depthPose(t, seed, { enter: plateIn, rx: -16, z: -100, swayDeg: 1.8 });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: clamp01(t / 150),
          fontFamily: ff,
          borderRadius: 28,
          overflow: p.plate ? 'hidden' : 'visible',
          background: p.plate ? `linear-gradient(180deg, #17171A 0%, ${BG} 55%)` : 'transparent',
          border: p.plate ? '1px solid rgba(255,255,255,0.10)' : 'none',
          boxShadow: p.plate ? '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' : 'none',
          transform: pose,
          transformOrigin: '50% 30%',
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', ...el('arrows') }}>
          {arrows.map((ar, i) => {
            const dp = easeOut((t - ar.at) / 300);
            if (dp <= 0) return null;
            const len = Math.hypot(ar.ex - ar.sx, ar.ey - ar.sy);
            const hx = ar.ex - ar.ux * 18, hy = ar.ey - ar.uy * 18;
            const px = -ar.uy, py = ar.ux;
            return (
              <g key={i}>
                <line
                  x1={ar.sx.toFixed(1)} y1={ar.sy.toFixed(1)}
                  x2={(ar.ex - ar.ux * 8).toFixed(1)} y2={(ar.ey - ar.uy * 8).toFixed(1)}
                  stroke={p.accent} strokeWidth={10} strokeLinecap="round"
                  strokeDasharray={len.toFixed(1)}
                  strokeDashoffset={((1 - dp) * len).toFixed(1)}
                />
                <path
                  d={`M ${(hx + px * 13).toFixed(1)} ${(hy + py * 13).toFixed(1)} L ${ar.ex.toFixed(1)} ${ar.ey.toFixed(1)} L ${(hx - px * 13).toFixed(1)} ${(hy - py * 13).toFixed(1)}`}
                  fill="none" stroke={p.accent} strokeWidth={10}
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity={clamp01((dp - 0.7) / 0.3).toFixed(3)}
                />
              </g>
            );
          })}
        </svg>

        {boxes.map((b, i) => {
          const sAt = (ms: number) => spring({
            frame: fr(ms - beat(i)), fps: FPS,
            config: { damping: 16, mass: 0.75, stiffness: 210 },
            durationInFrames: Math.max(1, Math.round(fr(450))),
          });
          const s = sAt(t);
          const shk = settle(t - (beat(i) + 160), 2.6);
          const r = rects[i];
          const fs = Math.min(r.h * 0.34, (r.w - 48) / (0.56 * Math.max(3, b.label.length)));
          // Z-stagger + smear: each box stamps in at its own slight angle, and its zoom
          // velocity drives a blur/stretch that dies the instant the stamp lands.
          const vBox = vel(sAt, t) * r.h * 0.35;
          const sm = smear(0, vBox);
          return (
            <div
              key={b.idx}
              style={{
                position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxSizing: 'border-box',
                border: `6px solid ${b.hot ? p.accent : INK}`,
                borderRadius: 14,
                background: b.hot ? `linear-gradient(180deg, ${p.accent} 0%, #D97706 100%)` : '#141417',
                boxShadow: b.hot
                  ? `0 14px 34px rgba(0,0,0,0.45), 0 0 26px ${rgba(p.accent, 0.35)}`
                  : '0 14px 34px rgba(0,0,0,0.45)',
                opacity: clamp01(s * 3),
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                transform: `${swingIn(s, { rx: -12 - i * 3, z: -50 })} translate(${shk.x.toFixed(2)}px, ${shk.y.toFixed(2)}px) scale(${((1.55 - 0.55 * s) * sm.sx).toFixed(4)}, ${((1.55 - 0.55 * s) * sm.sy).toFixed(4)})`,
                transformOrigin: 'center center',
                ...el(`box${b.idx + 1}`),
              }}
            >
              <span
                style={{
                  fontSize: Math.round(fs), fontWeight: 900,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: b.hot ? BG : INK, whiteSpace: 'nowrap', lineHeight: 1,
                }}
              >
                {b.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  },
});
