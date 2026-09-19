// PUNCH big arrow — a thick square-capped arrow that GROWS along its path (dash-offset sweep)
// toward up-right / right / down-right. The head stamps on at ~92% of the draw, so the tip lands
// while the shaft is still moving, and the whole group settle-shakes on that hit. Ships
// transparent — it annotates footage, so there is deliberately no plate.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

/** Decaying settle-shake: pure function of ms-since-impact — zero before the hit, a couple of
 *  fast oscillations after, dead within ~450ms. Never random per frame. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

/** Tail / control / tip / label anchor per direction, as canvas fractions. */
const DIRS: Record<string, { s: [number, number]; c: [number, number]; e: [number, number]; lbl: [number, number] }> = {
  'up-right':   { s: [0.14, 0.84], c: [0.60, 0.74], e: [0.84, 0.18], lbl: [0.34, 0.90] },
  'right':      { s: [0.10, 0.58], c: [0.50, 0.66], e: [0.88, 0.50], lbl: [0.24, 0.78] },
  'down-right': { s: [0.14, 0.16], c: [0.60, 0.26], e: [0.84, 0.80], lbl: [0.34, 0.08] },
};

export const bigArrow = defineGraphicsTemplate({
  id: 'big_arrow',
  name: 'Big Arrow',
  category: 'fx',
  tags: ['Arrow', 'Point', 'Draw', 'Annotate', 'Direction'],
  badge: 'New',
  design: { w: 700, h: 500 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 46 },
  fonts: ['montserrat'],

  elements: [
    { key: 'arrow', label: 'Arrow', hideable: false },
    { key: 'label', label: 'Label' },
  ],

  params: [
    { type: 'select', key: 'dir', label: 'Direction', group: 'Content', default: 'up-right',
      options: [
        { value: 'up-right', label: 'Up-right' },
        { value: 'right', label: 'Right' },
        { value: 'down-right', label: 'Down-right' },
      ] },
    { type: 'text', key: 'label', label: 'Label', group: 'Content', default: 'THIS', maxLength: 16,
      help: 'Short caps near the tail. Leave empty for arrow only.' },

    { type: 'color',  key: 'color',  label: 'Arrow',  group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'weight', label: 'Stroke', group: 'Style', default: 14, min: 8, max: 24, step: 1, unit: 'px' },

    { type: 'number', key: 'drawMs', label: 'Draw time', group: 'Motion', default: 520, min: 200, max: 1200, step: 20, unit: 'ms' },
    { type: 'number', key: 'shake',  label: 'Shake',     group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',  label: 'Delay',     group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // A light air pass as the stroke starts, a dry snap when the head stamps at ~92% of the draw —
  // both keyed off the same drawMs the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 40, id: 'swish', gain: 0.6 },
    { atMs: p.delay + p.drawMs * 0.92 + 120, id: 'snap', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');
    const geo = DIRS[p.dir] ?? DIRS['up-right'];

    const sx = geo.s[0] * width, sy = geo.s[1] * height;
    const ex = geo.e[0] * width, ey = geo.e[1] * height;
    // Seeded bow on the control point — a straight ruler line reads as a diagram, not a shout.
    const cx = geo.c[0] * width + (random(`${seed}-cx`) - 0.5) * width * 0.06;
    const cy = geo.c[1] * height + (random(`${seed}-cy`) - 0.5) * height * 0.06;
    const shaft = `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    // Generous over-estimate: an early-finishing sweep is invisible; a short dash truncates the tip.
    const len = Math.hypot(ex - sx, ey - sy) * 1.35;

    // Monotonic draw — an arrow never un-draws. A closure of absolute ms so vel() can sample the
    // same motion for the draw-head smear.
    const drawAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(p.drawMs))),
    });
    const draw = drawAt(t);
    // MOTION BLUR on the draw: the stroke's sweep velocity along the path smears it mid-draw and
    // dies the instant the sweep parks — a fast marker pass, not a mushy stroke.
    const vTip = vel(drawAt, t) * len;
    const drawBlur = Math.min(2.5, Math.abs(vTip) * 0.8);

    const headAt = p.drawMs * 0.92;
    // Stamp-pop with damping 14: the head briefly overshoots full size, then settles. Same-closure
    // velocity drives a smear that lands the tip CRISP.
    const popAt = (ms: number) => spring({
      frame: fr(ms - headAt), fps: FPS,
      config: { damping: 14, mass: 0.6, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });
    const pop = popAt(t);
    const shk = settle(t - (headAt + 120), p.shake);

    // Head arms angle off the incoming tangent (control point -> tip).
    const ang = Math.atan2(ey - cy, ex - cx);
    const armLen = p.weight * 2.6 + 16;
    const spread = 2.62; // ~150deg back from the tip on each side
    const headD = `M ${(ex + Math.cos(ang + spread) * armLen).toFixed(1)} ${(ey + Math.sin(ang + spread) * armLen).toFixed(1)}`
      + ` L ${ex.toFixed(1)} ${ey.toFixed(1)}`
      + ` L ${(ex + Math.cos(ang - spread) * armLen).toFixed(1)} ${(ey + Math.sin(ang - spread) * armLen).toFixed(1)}`;

    // Head pop velocity at the arm tip — smears the stamp mid-pop, crisp at rest.
    const vHead = vel((ms) => (0.3 + 0.7 * popAt(ms)) * armLen * 2, t);
    const hs = smear(vHead * 0.7, vHead * 0.7, 1.1);

    const lblIn = spring({
      frame: fr(t - 80), fps: FPS,
      config: { damping: 20, mass: 0.6, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(380))),
    });

    return (
      // Resting 3D sway on the whole annotation — it keeps living on the footage without ever
      // drifting off what it points at (rotations only, ~1.3°).
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, transform: sway3d(t, seed, 1.3) }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: 'absolute', inset: 0, overflow: 'visible',
            transform: `translate(${shk.x.toFixed(2)}px, ${shk.y.toFixed(2)}px)`,
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.45))',
            ...el('arrow'),
          }}
        >
          <path
            d={shaft}
            fill="none" stroke={p.color} strokeWidth={p.weight} strokeLinecap="square"
            strokeDasharray={len.toFixed(1)}
            strokeDashoffset={((1 - draw) * len).toFixed(1)}
            style={{ filter: drawBlur > 0.3 ? `blur(${drawBlur.toFixed(2)}px)` : undefined }}
          />
          {pop > 0.001 && (
            <path
              d={headD}
              fill="none" stroke={p.color} strokeWidth={p.weight} strokeLinecap="square" strokeLinejoin="miter"
              opacity={clamp01(pop * 4).toFixed(3)}
              style={{
                transformOrigin: `${ex.toFixed(1)}px ${ey.toFixed(1)}px`,
                transform: `scale(${((0.3 + 0.7 * pop) * hs.sx).toFixed(4)}, ${((0.3 + 0.7 * pop) * hs.sy).toFixed(4)})`,
                filter: hs.blurPx > 0.3 ? `blur(${hs.blurPx.toFixed(2)}px)` : undefined,
              }}
            />
          )}
        </svg>

        {p.label.trim().length > 0 && (
          <span
            style={{
              position: 'absolute',
              left: (geo.lbl[0] * width).toFixed(1) + 'px',
              top: (geo.lbl[1] * height).toFixed(1) + 'px',
              transform: `${swingIn(lblIn, { ry: -14, z: -60 })} translate(-50%, -50%) translateY(${((1 - lblIn) * 14).toFixed(2)}px)`,
              opacity: clamp01(lblIn * 2),
              fontSize: Math.round(height * 0.072), fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.10em', whiteSpace: 'nowrap',
              color: p.color,
              textShadow: '0 2px 12px rgba(0,0,0,0.5)',
              ...el('label'),
            }}
          >
            {p.label}
          </span>
        )}
      </div>
    );
  },
});
