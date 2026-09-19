// Two stacked cream verdict cards — PROS lands first, CONS follows — with hand-drawn
// underlines and per-line ± marks. The craft decision: the signs DRAW on (dash-swept wobbly
// strokes) rather than fade, and the cons card repeats its warm-gray minus colour in its own
// underline, so the verdict is carried by colour before anyone reads a word. Empty line
// params collapse, so the same card serves 1-, 2- and 3-point arguments.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, smear, swingIn, vel } from '../juice';

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

export const prosCons = defineGraphicsTemplate({
  id: 'pros_cons',
  name: 'Pros & Cons',
  category: 'story',
  tags: ['Pros', 'Cons', 'List', 'Cards', 'Plus', 'Minus'],
  badge: 'New',
  design: { w: 900, h: 800 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5500,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 58 },
  fonts: ['montserrat'],

  elements: [
    { key: 'pros', label: 'Pros card', hideable: false },
    { key: 'cons', label: 'Cons card' },
    { key: 'pro1', label: 'Pro 1' },
    { key: 'pro2', label: 'Pro 2' },
    { key: 'pro3', label: 'Pro 3' },
    { key: 'con1', label: 'Con 1' },
    { key: 'con2', label: 'Con 2' },
    { key: 'con3', label: 'Con 3' },
  ],

  params: [
    { type: 'text', key: 'prosTitle', label: 'Pros heading', group: 'Content', default: 'PROS', maxLength: 14 },
    { type: 'text', key: 'pro1', label: 'Pro 1', group: 'Content', default: 'Compounds over time', maxLength: 40 },
    { type: 'text', key: 'pro2', label: 'Pro 2', group: 'Content', default: 'Low startup cost', maxLength: 40 },
    { type: 'text', key: 'pro3', label: 'Pro 3', group: 'Content', default: 'You learn a real skill', maxLength: 40 },
    { type: 'text', key: 'consTitle', label: 'Cons heading', group: 'Content', default: 'CONS', maxLength: 14 },
    { type: 'text', key: 'con1', label: 'Con 1', group: 'Content', default: 'Slow for months', maxLength: 40 },
    { type: 'text', key: 'con2', label: 'Con 2', group: 'Content', default: 'No guarantees', maxLength: 40 },
    { type: 'text', key: 'con3', label: 'Con 3', group: 'Content', default: '', maxLength: 40 },

    { type: 'color', key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER ×2: each verdict card thumps onto the desk on its own beat, and each side's first
  // point gets a soft pop as it seats — the argument builds in pairs, never a wall of cues.
  sfx: (p) => [
    { atMs: p.delay + 240, id: 'paper', gain: 0.5 },
    { atMs: p.delay + 800, id: 'pop', gain: 0.35 },
    { atMs: p.delay + 1390, id: 'paper', gain: 0.5 },
    { atMs: p.delay + 1950, id: 'pop', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const cardH = height * 0.46;
    const fsTitle = Math.round(height * 0.047);
    const fsLine = Math.round(height * 0.035);
    const rowH = height * 0.063;
    const signS = Math.round(height * 0.042);
    const uw = width * 0.185;
    const uh = Math.max(8, height * 0.016);
    const lenSign = signS * 1.4;
    const lenU = uw * 1.2;

    const card = (key: 'pros' | 'cons', pre: 'pro' | 'con', title: string, items: string[], cardT: number, top: number) => {
      const plus = pre === 'pro';
      const tilt = (random(`${seed}-${key}-tilt`) - 0.5) * 2;
      const enterAt = (ms: number) => spring({
        frame: fr(ms - cardT), fps: FPS,
        config: { damping: 23, mass: 0.8, stiffness: 155 },
        durationInFrames: Math.max(1, Math.round(fr(640))),
      });
      const enter = enterAt(t);
      // Each card is tossed onto the desk with its own casual paper hinge (pros and cons lean
      // opposite ways) and keeps a faint sway; drop velocity smears the card, crisp on landing.
      const pose = depthPose(t, `${seed}-${key}`, { enter, rx: -12, ry: plus ? -6 : 6, z: -70, swayDeg: 0.8 });
      const vCard = vel((ms) => (1 - enterAt(ms)) * height * 0.05, t);
      const smCard = smear(0, vCard, 1.2);
      const titleIn = easeOutQuint(clamp01((t - cardT - 200) / 420));
      const underDraw = easeOutQuint(clamp01((t - cardT - 380) / 450));
      const signCol = plus ? p.accent : rgba(p.ink, 0.45);
      const underPath = wobblyStroke(3, uh * 0.55, uw - 3, uh * 0.5, `${seed}-${key}-u`, uh * 0.42);

      return (
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top, height: cardH,
            background: p.paper,
            borderRadius: 24,
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
            opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
            filter: smCard.blurPx > 0.3 ? `blur(${smCard.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} translateY(${((1 - enter) * height * 0.05).toFixed(2)}px) rotate(${(tilt + (1 - enter) * 1.8).toFixed(3)}deg) scale(${smCard.sx.toFixed(4)}, ${smCard.sy.toFixed(4)})`,
            padding: `${Math.round(height * 0.042)}px ${Math.round(width * 0.06)}px`,
            boxSizing: 'border-box',
            overflow: 'hidden',
            ...el(key),
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: fsTitle, fontWeight: 800, color: p.ink,
              letterSpacing: '0.08em', lineHeight: 1.1,
              opacity: titleIn,
              transform: `translateY(${((1 - titleIn) * height * 0.02).toFixed(2)}px)`,
            }}
          >
            {title}
          </span>
          <svg width={uw} height={uh} viewBox={`0 0 ${uw.toFixed(1)} ${uh.toFixed(1)}`} style={{ marginTop: height * 0.006, overflow: 'visible' }}>
            <path
              d={underPath} fill="none"
              stroke={plus ? p.accent : rgba(p.ink, 0.35)}
              strokeWidth={Math.max(4, height * 0.011)}
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={lenU} strokeDashoffset={((1 - underDraw) * lenU).toFixed(1)}
            />
          </svg>

          <div style={{ marginTop: height * 0.02, display: 'flex', flexDirection: 'column' }}>
            {items.map((text, i) => {
              const k = `${pre}${i + 1}`;
              const rowT = cardT + 620 + i * 380;
              // Z-STAGGER: rows hinge in from alternating angles with a velocity smear that
              // dies as each point seats — objects arriving, not divs appearing.
              const riseAt = (ms: number) => spring({
                frame: fr(ms - rowT), fps: FPS,
                config: { damping: 22, mass: 0.7, stiffness: 175 },
                durationInFrames: Math.max(1, Math.round(fr(520))),
              });
              const rise = riseAt(t);
              const vRow = vel((ms) => (1 - riseAt(ms)) * rowH * 0.4, t);
              const smRow = smear(0, vRow, 1.2);
              const s1 = easeOutQuint(clamp01((t - rowT - 160) / 230));
              const s2 = easeOutQuint(clamp01((t - rowT - 290) / 230));
              return (
                <div
                  key={k}
                  style={{
                    display: 'flex', alignItems: 'center', gap: width * 0.028, height: rowH,
                    opacity: interpolate(rise, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
                    filter: smRow.blurPx > 0.3 ? `blur(${smRow.blurPx.toFixed(2)}px)` : undefined,
                    transform: `${swingIn(rise, { rx: -12, ry: (plus ? -1 : 1) * (i % 2 ? 8 : 5), z: -50 })} translateY(${((1 - rise) * rowH * 0.4).toFixed(2)}px) scale(${smRow.sx.toFixed(4)}, ${smRow.sy.toFixed(4)})`,
                    ...el(k),
                  }}
                >
                  <svg width={signS} height={signS} viewBox={`0 0 ${signS} ${signS}`} style={{ overflow: 'visible', flexShrink: 0 }}>
                    <path
                      d={wobblyStroke(3, signS / 2, signS - 3, signS / 2, `${seed}-${k}-h`, 1.6)}
                      fill="none" stroke={signCol} strokeWidth={Math.max(4, signS * 0.16)}
                      strokeLinecap="round" strokeLinejoin="round"
                      strokeDasharray={lenSign} strokeDashoffset={((1 - s1) * lenSign).toFixed(1)}
                    />
                    {plus && (
                      <path
                        d={wobblyStroke(signS / 2, 3, signS / 2, signS - 3, `${seed}-${k}-v`, 1.6)}
                        fill="none" stroke={signCol} strokeWidth={Math.max(4, signS * 0.16)}
                        strokeLinecap="round" strokeLinejoin="round"
                        strokeDasharray={lenSign} strokeDashoffset={((1 - s2) * lenSign).toFixed(1)}
                      />
                    )}
                  </svg>
                  <span
                    style={{
                      fontSize: fsLine, fontWeight: 600, lineHeight: 1.25,
                      color: plus ? p.ink : rgba(p.ink, 0.8),
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    const pros = [p.pro1, p.pro2, p.pro3].map((s) => s.trim()).filter(Boolean);
    const cons = [p.con1, p.con2, p.con3].map((s) => s.trim()).filter(Boolean);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff }}>
        {card('pros', 'pro', p.prosTitle, pros, 0, 0)}
        {card('cons', 'con', p.consTitle, cons, 1150, height * 0.54)}
      </div>
    );
  },
});
