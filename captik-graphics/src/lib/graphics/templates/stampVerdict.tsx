// PUNCH verdict stamp — a rubber-stamp APPROVED / DENIED slams onto the footage at a seeded
// per-instance tilt (random(seed) — two stamps never land identically), with settle-shake and a
// one-shot ink spatter at impact. The 25%-opacity double-print ghost is offset INSIDE the rotated
// frame, so the misprint tracks the tilt like real ink instead of floating off-axis. Plateless.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

const GREEN = '#4ADE80';
const RED = '#E5484D';

/** Decaying settle-shake: pure function of ms-since-impact — zero before the hit, a couple of
 *  fast oscillations after, dead within ~450ms. Never random per frame. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

export const stampVerdict = defineGraphicsTemplate({
  id: 'stamp_verdict',
  name: 'Verdict Stamp',
  category: 'fx',
  tags: ['Stamp', 'Verdict', 'Approved', 'Rubber', 'Ink'],
  badge: 'New',
  design: { w: 600, h: 400 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3000,
  defaultBox: { xPercent: 50, yPercent: 38, widthPercent: 46 },
  fonts: ['anton'],

  elements: [
    { key: 'stamp',  label: 'Stamp', hideable: false },
    { key: 'flecks', label: 'Ink spatter' },
  ],

  params: [
    { type: 'select', key: 'verdict', label: 'Verdict', group: 'Content', default: 'approved',
      options: [
        { value: 'approved', label: 'Approved (green)' },
        { value: 'denied',   label: 'Denied (red)' },
        { value: 'custom',   label: 'Custom' },
      ] },
    { type: 'text', key: 'customText', label: 'Custom text', group: 'Content', default: 'CERTIFIED',
      maxLength: 14, showIf: { key: 'verdict', equals: 'custom' } },

    { type: 'color',   key: 'customColor', label: 'Custom ink',   group: 'Style', default: '#F59E0B',
      showIf: { key: 'verdict', equals: 'custom' } },
    { type: 'font',    key: 'font',        label: 'Font',         group: 'Style', default: 'anton' },
    { type: 'boolean', key: 'doublePrint', label: 'Double print', group: 'Style', default: true },

    { type: 'number', key: 'slamAt', label: 'Slam at', group: 'Motion', default: 300, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'shake',  label: 'Shake',   group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',  label: 'Delay',   group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Whoosh on the approach, the lone full-gain slam at the moment the rubber compresses —
  // both keyed off the same slamAt the motion uses.
  sfx: (p) => [
    { atMs: p.delay + Math.max(0, p.slamAt - 110), id: 'whoosh', gain: 0.6 },
    { atMs: p.delay + p.slamAt + 160, id: 'slam', gain: 1 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const word = p.verdict === 'approved' ? 'APPROVED' : p.verdict === 'denied' ? 'DENIED' : p.customText;
    const col = p.verdict === 'approved' ? GREEN : p.verdict === 'denied' ? RED : p.customColor;

    // Seeded tilt — the whole point of a stamp is that it never lands square.
    const ang = (random(`${seed}-ang`) - 0.5) * 16;

    // The slam: 1.6x -> 1.0 hard; damping 16 leaves a 1-2 frame overshoot that reads as the
    // rubber compressing into the surface. A closure of absolute ms so vel() can sample the
    // same motion for the smear.
    const slamSpringAt = (ms: number) => spring({
      frame: fr(ms - p.slamAt), fps: FPS,
      config: { damping: 16, mass: 0.75, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(480))),
    });
    const slam = slamSpringAt(t);
    const scale = 1.6 - 0.6 * slam;
    const inkOp = clamp01(slam * 3);
    // MOTION BLUR: stamp-zoom velocity at the face's edge — smears the fall, lands CRISP the
    // frame the rubber parks.
    const vStamp = vel((ms) => 1.6 - 0.6 * slamSpringAt(ms), t) * width * 0.35;
    const sm = smear(0, vStamp, 1.2);
    // DEPTH: the stamp falls through 3D on the same spring (seeded side-hinge — an arm never
    // comes down dead square), then keeps breathing in space through the hold (~1.6° sway).
    const hingeRy = (random(`${seed}-ry`) - 0.5) * 16;
    const pose = depthPose(t, seed, { enter: slam, rx: -14, ry: hingeRy, z: -110, swayDeg: 1.6 });

    const impact = p.slamAt + 160;
    const tImp = t - impact;
    const shk = settle(tImp, p.shake);

    const bw = Math.max(8, Math.round(height * 0.028));
    const fs = Math.min(height * 0.28, (width * 0.72) / (0.56 * Math.max(4, word.length)));
    const cx = width / 2;
    const cy = height / 2;

    // One-shot ink spatter: 6 seeded flecks pop at impact, fly a short distance and STAY —
    // spatter is ink on the footage, not a particle effect that evaporates.
    const fleckOn = tImp > 0;
    const fo = easeOut(tImp / 240);
    const flecks: { x: number; y: number; r: number }[] = [];
    if (fleckOn) {
      for (let i = 0; i < 6; i++) {
        const a = random(`${seed}-fa${i}`) * Math.PI * 2;
        const rx = width * 0.33 * (0.8 + random(`${seed}-fr${i}`) * 0.5);
        const ry = height * 0.30 * (0.8 + random(`${seed}-fy${i}`) * 0.5);
        flecks.push({
          x: cx + Math.cos(a) * rx * (0.55 + 0.45 * fo),
          y: cy + Math.sin(a) * ry * (0.55 + 0.45 * fo),
          r: 2.5 + random(`${seed}-fs${i}`) * 3.5,
        });
      }
    }

    const face = {
      border: `${bw}px solid ${rgba(col, 0.96)}`,
      borderRadius: 16,
      padding: `${Math.round(height * 0.045)}px ${Math.round(width * 0.07)}px`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    } as const;
    const type = {
      fontSize: Math.round(fs), fontWeight: 900, lineHeight: 1,
      letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      color: rgba(col, 0.96),
    } as const;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          fontFamily: ff,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {fleckOn && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', ...el('flecks') }}>
            {flecks.map((f, i) => (
              <circle
                key={i}
                cx={f.x.toFixed(1)} cy={f.y.toFixed(1)} r={f.r.toFixed(2)}
                fill={col}
                opacity={(0.85 * clamp01(tImp / 60)).toFixed(3)}
              />
            ))}
          </svg>
        )}

        <div
          style={{
            position: 'relative',
            opacity: inkOp,
            filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} translate(${shk.x.toFixed(2)}px, ${shk.y.toFixed(2)}px) rotate(${ang.toFixed(2)}deg) scale(${(scale * sm.sx).toFixed(4)}, ${(scale * sm.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('stamp'),
          }}
        >
          {p.doublePrint && (
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0,
                transform: 'translate(2.5px, 2.5px)',
                opacity: 0.25,
                ...face,
              }}
            >
              <span style={type}>{word}</span>
            </div>
          )}
          <div style={{ position: 'relative', ...face }}>
            <span style={type}>{word}</span>
          </div>
        </div>
      </div>
    );
  },
});
