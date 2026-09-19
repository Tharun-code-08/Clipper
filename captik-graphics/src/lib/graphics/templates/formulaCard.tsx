// Equation card — "X + Y = Z" ingredient boxes spring in, operators STAMP between beats
// (only one thing moves at a time), then the result lands bigger with an amber underline
// sweep. Craft: the hand-drawn box look is seeded asymmetric border-radius pairs — no
// measured SVG borders — so boxes size to their labels and the row wraps freely when narrow.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, swingIn } from '../juice';

/** Straight-ish stroke with seeded hand jitter and a slight bow. */
function wobblyStroke(x0: number, y0: number, x1: number, y1: number, seed: string, amp: number): string {
  const N = 6;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const bow = Math.sin(f * Math.PI) * amp * 0.5;
    const x = x0 + (x1 - x0) * f + (random(`${seed}-x${i}`) - 0.5) * amp;
    const y = y0 + (y1 - y0) * f + bow + (random(`${seed}-y${i}`) - 0.5) * amp;
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

/** Hand-drawn rectangle via asymmetric corner-radius pairs (the classic sketch-border trick). */
function sketchRadius(seed: string): string {
  const r = (k: string, lo: number, hi: number) => Math.round(lo + random(`${seed}-${k}`) * (hi - lo));
  return `${r('a', 18, 30)}px ${r('b', 8, 16)}px ${r('c', 20, 32)}px ${r('d', 10, 18)}px / ${r('e', 10, 18)}px ${r('f', 20, 30)}px ${r('g', 8, 16)}px ${r('h', 22, 32)}px`;
}

export const formulaCard = defineGraphicsTemplate({
  id: 'formula_card',
  name: 'Formula Card',
  category: 'chart',
  tags: ['Formula', 'Equation', 'Boxes', 'Plus', 'Result'],
  badge: 'New',
  design: { w: 900, h: 520 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 62 },
  fonts: ['montserrat'],

  elements: [
    { key: 'card',      label: 'Card', hideable: false },
    { key: 'part1',     label: 'Part 1' },
    { key: 'part2',     label: 'Part 2' },
    { key: 'part3',     label: 'Part 3' },
    { key: 'ops',       label: 'Operators' },
    { key: 'result',    label: 'Result', hideable: false },
    { key: 'underline', label: 'Underline' },
  ],

  params: [
    { type: 'text', key: 'part1',  label: 'Part 1', group: 'Content', default: 'Focus', maxLength: 20 },
    { type: 'text', key: 'part2',  label: 'Part 2', group: 'Content', default: 'Consistency', maxLength: 20 },
    { type: 'text', key: 'part3',  label: 'Part 3', group: 'Content', default: '', maxLength: 20 },
    { type: 'text', key: 'result', label: 'Result', group: 'Content', default: 'Mastery', maxLength: 20 },

    { type: 'color', key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER language: card flick, pops for the "=" stamp and the result box, a light swish
  // under the underline sweep — beats computed from the same grid the motion uses.
  sfx: (p) => {
    const n = Math.max(1, [p.part1, p.part2, p.part3].map((s) => s.trim()).filter(Boolean).length);
    const eqT = 260 + (n - 1) * 620 + 380;
    const resT = 260 + (n - 1) * 620 + 680;
    return [
      { atMs: p.delay + 80, id: 'paper', gain: 0.5 },
      { atMs: p.delay + eqT, id: 'pop', gain: 0.45 },
      { atMs: p.delay + resT, id: 'pop', gain: 0.55 },
      { atMs: p.delay + resT + 650, id: 'swish', gain: 0.4 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const parts = [p.part1, p.part2, p.part3].map((s) => s.trim()).filter(Boolean).slice(0, 3);
    const n = Math.max(1, parts.length);

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2.4;
    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });

    // Beat grid: box, stamp, box, stamp, ... =, result, underline.
    const partT = (i: number) => 260 + i * 620;
    const eqT = partT(n - 1) + 380;
    const resT = partT(n - 1) + 680;
    const sweepT = resT + 650;

    const fsPart = Math.round(height * 0.085);
    const fsOp = Math.round(height * 0.105);
    const fsRes = Math.round(height * 0.115);
    const bw = Math.max(3, height * 0.008);

    const stamp = (at: number, key: string) => {
      const s = spring({
        frame: fr(t - at), fps: FPS,
        config: { damping: 16, mass: 0.6, stiffness: 260 },
        durationInFrames: Math.max(1, Math.round(fr(420))),
      });
      const rot = (random(`${seed}-${key}`) - 0.5) * 10;
      // Approach smear: the operator blurs while it stamps down and lands bone-crisp.
      const bl = s > 0.001 && s < 0.985 ? (1 - Math.min(1, s)) * 3 : 0;
      return {
        opacity: clamp01((t - at) / 80),
        filter: bl > 0.3 ? `blur(${bl.toFixed(2)}px)` : undefined,
        transform: `scale(${(2.1 - 1.1 * s).toFixed(4)}) rotate(${rot.toFixed(2)}deg)`,
      };
    };

    const boxIn = (at: number) => spring({
      frame: fr(t - at), fps: FPS,
      config: { damping: 20, mass: 0.75, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });

    const resIn = spring({
      frame: fr(t - resT), fps: FPS,
      config: { damping: 17, mass: 0.8, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const resBlur = resIn > 0.001 && resIn < 0.985 ? (1 - Math.min(1, resIn)) * 3 : 0;
    const sweep = easeOutQuint(clamp01((t - sweepT) / 520));

    // Depth: the paper card tosses in top-hinged (casual, not glossy) and keeps a slight
    // 3D sway on top of its seeded desk tilt — it never flattens into a scan.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -70, swayDeg: 1.5 });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 26,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `${pose} translateY(${((1 - enter) * height * 0.07).toFixed(2)}px) rotate(${(tilt + (1 - enter) * 1.8).toFixed(3)}deg)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          padding: `${Math.round(height * 0.09)}px ${Math.round(width * 0.055)}px`,
          boxSizing: 'border-box',
          overflow: 'hidden',
          ...el('card'),
        }}
      >
        <div
          style={{
            width: '100%', height: '100%',
            display: 'flex', flexWrap: 'wrap',
            alignItems: 'center', justifyContent: 'center', alignContent: 'center',
            columnGap: width * 0.032, rowGap: height * 0.055,
          }}
        >
          {parts.map((text, i) => {
            const rise = boxIn(partT(i));
            const rot = (random(`${seed}-p${i}`) - 0.5) * 3;
            // Z-stagger: each ingredient box swings up from its own slightly different
            // angle, with a landing smear that dies as its spring settles.
            const riseBlur = rise > 0.001 && rise < 0.985 ? (1 - Math.min(1, rise)) * 2.5 : 0;
            return (
              <div key={i} style={{ display: 'contents' }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: fsPart, fontWeight: 700, color: p.ink, lineHeight: 1.15,
                    background: rgba('#FFFFFF', 0.5),
                    border: `${bw.toFixed(1)}px solid ${rgba(p.ink, 0.85)}`,
                    borderRadius: sketchRadius(`${seed}-bx${i}`),
                    boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
                    padding: `${Math.round(height * 0.028)}px ${Math.round(width * 0.038)}px`,
                    opacity: interpolate(rise, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
                    filter: riseBlur > 0.3 ? `blur(${riseBlur.toFixed(2)}px)` : undefined,
                    transform: `${swingIn(rise, { rx: -13 - i * 2, z: -50 })} translateY(${((1 - rise) * height * 0.05).toFixed(2)}px) scale(${(0.7 + 0.3 * rise).toFixed(4)}) rotate(${rot.toFixed(2)}deg)`,
                    ...el(`part${i + 1}`),
                  }}
                >
                  {text}
                </span>
                {i < n - 1 && (
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: fsOp, fontWeight: 800, color: rgba(p.ink, 0.7), lineHeight: 1,
                      ...stamp(partT(i) + 380, `plus${i}`),
                      ...el('ops'),
                    }}
                  >
                    +
                  </span>
                )}
              </div>
            );
          })}

          <span
            style={{
              display: 'inline-block',
              fontSize: fsOp, fontWeight: 800, color: rgba(p.ink, 0.7), lineHeight: 1,
              ...stamp(eqT, 'eq'),
              ...el('ops'),
            }}
          >
            =
          </span>

          <span
            style={{
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
              fontSize: fsRes, fontWeight: 800, color: p.ink, lineHeight: 1.15,
              background: rgba('#FFFFFF', 0.6),
              border: `${(bw * 1.15).toFixed(1)}px solid ${rgba(p.ink, 0.9)}`,
              borderRadius: sketchRadius(`${seed}-res`),
              boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
              padding: `${Math.round(height * 0.032)}px ${Math.round(width * 0.045)}px`,
              opacity: interpolate(resIn, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
              filter: resBlur > 0.3 ? `blur(${resBlur.toFixed(2)}px)` : undefined,
              transform: `${swingIn(resIn, { rx: -16, z: -70 })} translateY(${((1 - resIn) * height * 0.06).toFixed(2)}px) scale(${(0.6 + 0.4 * resIn).toFixed(4)}) rotate(${((random(`${seed}-rr`) - 0.5) * 3).toFixed(2)}deg)`,
              ...el('result'),
            }}
          >
            {p.result}
            <svg
              viewBox="0 0 100 12" preserveAspectRatio="none"
              style={{ width: '92%', height: Math.max(6, height * 0.022), marginTop: height * 0.012, overflow: 'visible', ...el('underline') }}
            >
              <path
                d={wobblyStroke(2, 6, 98, 6, `${seed}-uw`, 2.4)}
                fill="none" stroke={p.accent} strokeWidth={3.2}
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={120} strokeDashoffset={((1 - sweep) * 120).toFixed(1)}
              />
            </svg>
          </span>
        </div>
      </div>
    );
  },
});
