// "Did you know?" fact card — the eyebrow chip SLAMS in (scale-down landing + decaying-sine
// settle), a hand-wobbled lightbulb draws inside it, then the fact reveals in 3-word
// inline-block chunks. Craft: a chunk wraps as a UNIT, so wrapped lines never re-flow
// mid-reveal — and the bulb's rays flick on only after the chip's slam settles.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, smear, vel } from '../juice';

/** Straight-ish stroke with seeded hand jitter. */
function wobblyStroke(x0: number, y0: number, x1: number, y1: number, seed: string, amp: number): string {
  const N = 6;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const x = x0 + (x1 - x0) * f + (random(`${seed}-x${i}`) - 0.5) * amp;
    const y = y0 + (y1 - y0) * f + (random(`${seed}-y${i}`) - 0.5) * amp;
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

/** Hand-drawn circle: seeded radial noise, closed past its own start point. */
function wobblyRing(cx: number, cy: number, r: number, seed: string): string {
  const N = 14;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI * 0.5;
    const rr = r * (1 + (random(`${seed}-r${i}`) - 0.5) * 0.09);
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

export const didYouKnow = defineGraphicsTemplate({
  id: 'did_you_know',
  name: 'Did You Know',
  category: 'story',
  tags: ['Lightbulb', 'Fact', 'Chip', 'Doodle', 'Card'],
  badge: 'New',
  design: { w: 900, h: 600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 58 },
  fonts: ['montserrat'],

  elements: [
    { key: 'card', label: 'Card', hideable: false },
    { key: 'chip', label: 'Eyebrow chip', hideable: false },
    { key: 'bulb', label: 'Lightbulb' },
    { key: 'fact', label: 'Fact', hideable: false },
  ],

  params: [
    { type: 'text', key: 'label', label: 'Eyebrow', group: 'Content', default: 'DID YOU KNOW?', maxLength: 24 },
    { type: 'text', key: 'fact', label: 'Fact', group: 'Content', multiline: true, maxLength: 160,
      default: 'Honey never spoils.\nSealed jars from ancient tombs are still edible.' },

    { type: 'color', key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Whoosh into the chip's slam (chip lands ~410), a soft chime as the bulb's rays flick on
  // (~740), a light pass when the fact chunks start revealing (1050) — the render's beats.
  sfx: (p) => [
    { atMs: p.delay + 80, id: 'whoosh', gain: 0.5 },
    { atMs: p.delay + 410, id: 'slam', gain: 0.7 },
    { atMs: p.delay + 760, id: 'chime', gain: 0.35 },
    { atMs: p.delay + 1050, id: 'swish', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const tilt = (random(`${seed}-tilt`) - 0.5) * 3.2;
    const chipTilt = (random(`${seed}-ct`) - 0.5) * 3;

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });
    // The card is TOSSED onto the desk: casual paper hinge in, then a small resting sway so
    // the pose never flattens back into a web page.
    const pose = depthPose(t, seed, { enter, rx: -12, ry: -5, z: -85, swayDeg: 1.3 });

    // Chip slam: fast spring landing from oversized, then a decaying-sine settle shake.
    const chipT = 180;
    const slamAt = (ms: number) => spring({
      frame: fr(ms - chipT), fps: FPS,
      config: { damping: 15, mass: 0.7, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const slam = slamAt(t);
    const impact = t - chipT - 230;
    const shake = impact > 0 ? Math.sin((impact / 1000) * Math.PI * 2 * 9) * 3 * Math.exp(-impact / 140) : 0;
    // TRUE stamp smear: the chip's zoom velocity (scale derivative at its edge) drives blur +
    // stretch that peak mid-slam and die the instant the chip lands.
    const chipScaleAt = (ms: number) => 1.9 - 0.9 * slamAt(ms);
    const smChip = smear(0, vel(chipScaleAt, t) * height * 0.12, 1.15);

    const fsChip = Math.round(height * 0.05);
    const fsFact = Math.round(height * 0.076);
    const chipInk = inkOn(p.accent);

    // Bulb geometry (design px inside its own little svg).
    const S = Math.round(fsChip * 1.5);
    const bcx = S * 0.5, bcy = S * 0.42, br = S * 0.26;
    const bulbDraw = easeOutQuint(clamp01((t - chipT - 250) / 480));
    const lenRing = br * Math.PI * 2.4;
    const lenBase = S * 0.5;
    const rays = [-140, -90, -40].map((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const r0 = br * 1.35, r1 = br * 1.75;
      return {
        d: wobblyStroke(bcx + Math.cos(a) * r0, bcy + Math.sin(a) * r0, bcx + Math.cos(a) * r1, bcy + Math.sin(a) * r1, `${seed}-ray${i}`, 1.2),
        on: easeOutQuint(clamp01((t - chipT - 560 - i * 80) / 220)),
      };
    });
    const lenRay = br * 0.7;

    // Fact chunks: up to 3 words each; a chunk is an inline-block, so it wraps atomically.
    const factT = 1050;
    let ci = 0;
    const factLines = p.fact.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4)
      .map((line) => {
        const words = line.split(/\s+/).filter(Boolean);
        const chunks: { text: string; idx: number }[] = [];
        for (let w = 0; w < words.length; w += 3) {
          chunks.push({ text: words.slice(w, w + 3).join(' '), idx: ci++ });
        }
        return chunks;
      });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 26,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `${pose} translateY(${((1 - enter) * height * 0.07).toFixed(2)}px) rotate(${(tilt + (1 - enter) * 2).toFixed(3)}deg)`,
          fontFamily: ff,
          padding: `${Math.round(height * 0.1)}px ${Math.round(width * 0.075)}px`,
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          overflow: 'hidden',
          ...el('card'),
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: fsChip * 0.5,
            background: p.accent,
            color: chipInk,
            borderRadius: 999,
            padding: `${Math.round(fsChip * 0.38)}px ${Math.round(fsChip * 0.8)}px`,
            boxShadow: `0 6px 18px ${rgba(p.accent, 0.4)}`,
            opacity: interpolate(slam, [0, 0.25], [0, 1], { extrapolateRight: 'clamp' }),
            filter: smChip.blurPx > 0.3 ? `blur(${smChip.blurPx.toFixed(2)}px)` : undefined,
            transform:
              `translateX(${shake.toFixed(2)}px) ` +
              `scale(${(chipScaleAt(t) * smChip.sx).toFixed(4)}, ${(chipScaleAt(t) * smChip.sy).toFixed(4)}) ` +
              `rotate(${chipTilt.toFixed(2)}deg)`,
            transformOrigin: 'left center',
            ...el('chip'),
          }}
        >
          <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ overflow: 'visible', flexShrink: 0, ...el('bulb') }}>
            <path
              d={wobblyRing(bcx, bcy, br, `${seed}-bulb`)}
              fill="none" stroke={chipInk} strokeWidth={Math.max(2.5, S * 0.07)}
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={lenRing} strokeDashoffset={((1 - bulbDraw) * lenRing).toFixed(1)}
            />
            <path
              d={wobblyStroke(S * 0.4, S * 0.76, S * 0.6, S * 0.76, `${seed}-b1`, 1)}
              fill="none" stroke={chipInk} strokeWidth={Math.max(2.5, S * 0.07)}
              strokeLinecap="round"
              strokeDasharray={lenBase} strokeDashoffset={((1 - bulbDraw) * lenBase).toFixed(1)}
            />
            <path
              d={wobblyStroke(S * 0.43, S * 0.87, S * 0.57, S * 0.87, `${seed}-b2`, 1)}
              fill="none" stroke={chipInk} strokeWidth={Math.max(2.5, S * 0.07)}
              strokeLinecap="round"
              strokeDasharray={lenBase} strokeDashoffset={((1 - bulbDraw) * lenBase).toFixed(1)}
            />
            {rays.map((ray, i) => (
              <path
                key={i}
                d={ray.d}
                fill="none" stroke={chipInk} strokeWidth={Math.max(2.5, S * 0.07)}
                strokeLinecap="round"
                strokeDasharray={lenRay} strokeDashoffset={((1 - ray.on) * lenRay).toFixed(1)}
              />
            ))}
          </svg>
          <span style={{ fontSize: fsChip, fontWeight: 800, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
            {p.label}
          </span>
        </div>

        <div
          style={{
            marginTop: height * 0.075,
            fontSize: fsFact, fontWeight: 600, color: p.ink, lineHeight: 1.42,
            ...el('fact'),
          }}
        >
          {factLines.map((chunks, li) => (
            <div key={li}>
              {chunks.map((c) => {
                const e = easeOutQuint(clamp01((t - factT - c.idx * 170) / 300));
                return (
                  <span
                    key={c.idx}
                    style={{
                      display: 'inline-block', whiteSpace: 'nowrap',
                      marginRight: '0.3em',
                      opacity: e,
                      transform: `translateY(${((1 - e) * fsFact * 0.35).toFixed(2)}px)`,
                    }}
                  >
                    {c.text}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  },
});
