// Reference: text/gravity-thought.mp4  (window 0-5480ms, word lands ~3960ms)
// A grid of phrase pairs with a single script word FALLING through it under gravity, bouncing and
// settling lower each time. The fall is real integration of a constant acceleration against
// timeMs, not an eased tween — that is what makes the bounces read as weight.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGlow } from '../luxe';
import { depthPose, ghosts, parallax, smear, vel } from '../juice';

const MAX_ROWS = 10;

/** "I love to|at work" -> left / right column. */
function parseRows(raw: string) {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_ROWS).map((l) => {
    const [a = '', b = ''] = l.split('|').map((s) => s.trim());
    return { a, b };
  });
}

export const gravityWord = defineGraphicsTemplate({
  id: 'gravity_word',
  name: 'Gravity Word',
  category: 'title',
  tags: ['Kinetic', 'Physics', 'Quote'],
  design: { w: 760, h: 720 },
  defaultDurationMs: 5500,
  defaultBox: { xPercent: 50, yPercent: 46, widthPercent: 88 },
  fonts: ['playfair'],

  elements: [
    { key: 'grid', label: 'Phrase grid', hideable: false },
    { key: 'word', label: 'Falling word', hideable: false },
    ...Array.from({ length: MAX_ROWS }, (_, i) => ({ key: `row${i + 1}`, label: `Row ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'rows', label: 'Phrases', group: 'Content', multiline: true, maxLength: 500,
      default: 'I love to|at work\nWe need to|to learn\nYou have to|to grow\nAlways|to stay creative\nNever stop to|and laugh\nI rest to|even better\nWe need to|to feel alive\nYou have to|to win\nIt’s time to|and learn\nNever stop to|with your ideas',
      help: 'One per line, split with | into left and right columns.' },
    { type: 'text', key: 'word', label: 'Falling word', group: 'Content', default: 'play', maxLength: 24 },

    { type: 'color',  key: 'ink',      label: 'Phrases',   group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'wordCol',  label: 'Word',      group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',     label: 'Phrase font', group: 'Style', default: 'playfair' },
    { type: 'font',   key: 'wordFont', label: 'Word font',   group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',     label: 'Phrase size', group: 'Style', default: 38, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'wordSize', label: 'Word size',   group: 'Style', default: 104, min: 16, max: 160, step: 2, unit: 'px' },
    { type: 'boolean', key: 'ticks',   label: 'Corner ticks', group: 'Style', default: true },

    { type: 'number', key: 'fallMs',  label: 'Fall duration', group: 'Motion', default: 2600, min: 800, max: 8000, step: 100, unit: 'ms' },
    { type: 'number', key: 'bounces', label: 'Bounces',       group: 'Motion', default: 3, min: 0, max: 6, step: 1 },
    { type: 'number', key: 'damp',    label: 'Bounce damping', group: 'Motion', default: 55, min: 10, max: 90, step: 5, unit: '%' },
  ],

  // Weight you can hear: air while the word accelerates, the produced hit on first floor contact
  // (the payoff), a dry tap on the second contact — all off the same fallMs/bounces clock the
  // integration runs on.
  sfx: (p) => {
    const hit = p.fallMs / (p.bounces + 1);
    const cues: { atMs: number; id: 'whoosh' | 'slam' | 'snap'; gain: number }[] = [
      { atMs: Math.max(0, hit - 260), id: 'whoosh', gain: 0.5 },
      { atMs: hit, id: 'slam', gain: 0.9 },
    ];
    if (p.bounces >= 1) cues.push({ atMs: hit * 2, id: 'snap', gain: 0.4 });
    return cues;
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const rows = parseRows(p.rows);
    const ff = fontStack(p.font);

    const gridIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });

    // Integrate a constant acceleration, then reflect at the floor with damping. Piecewise, but
    // continuous — and entirely a function of timeMs (a closure, so vel() can differentiate it).
    const travel = height * 0.62;
    const k = 1 / (p.bounces + 1);
    const yAt = (ms: number) => {
      const tt = clamp01(ms / Math.max(1, p.fallMs));
      let yy = 0;
      let seg = tt;
      let amp = 1;
      for (let i = 0; i <= p.bounces; i += 1) {
        if (seg <= k) {
          const u = seg / k;
          // Down-then-up parabola for bounces after the first drop.
          yy = i === 0 ? travel * (u * u) : travel - amp * travel * (4 * u * (1 - u)) * 0.35;
          break;
        }
        seg -= k;
        amp *= p.damp / 100;
        yy = travel;
      }
      if (tt >= 1) yy = travel;
      return yy;
    };
    const t = clamp01(timeMs / Math.max(1, p.fallMs));
    const y = yAt(timeMs);

    // MOTION BLUR: the fall's true velocity (vel() across the piecewise integration) drives a
    // vertical smear plus two trailing ghost frames — strongest at terminal speed, gone the
    // frame the word rests. On first floor contact the word squashes and recovers over ~110ms.
    const vy = vel(yAt, timeMs);
    const smW = smear(0, vy, 0.9);
    const trail = ghosts(0, vy, 2);
    const hitMs = p.fallMs * k;
    const squash = timeMs > hitMs ? Math.exp(-(timeMs - hitMs) / 110) * 0.16 : 0;

    // Depth: the phrase grid is the back plane — it swings in once and keeps a ±1.3° breath —
    // while the falling word rides a nearer plane that parallax-shears against it.
    const gridPose = depthPose(timeMs, seed, { enter: gridIn, rx: -8, z: -50, swayDeg: 1.3, periodMs: 4200 });
    const parW = parallax(timeMs, seed, 0.6, width * 0.01, 4200);

    const spin = interpolate(t, [0, 1], [-12, 4]);
    const rowH = (height * 0.8) / Math.max(1, rows.length);
    const fsW = p.wordSize;
    const rule = rgba(p.ink, 0.3);
    const hand = Math.max(2, width * 0.011);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: `0 ${width * 0.095}px`, boxSizing: 'border-box',
            opacity: interpolate(gridIn, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
            transform: gridPose,
            ...el('grid'),
          }}
        >
          {rows.map((r, i) => (
            <div
              key={i}
              style={{
                position: 'relative',
                height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: width * 0.05,
                fontSize: p.size, color: p.ink, fontStyle: 'italic',
                borderTop: p.ticks ? `${Math.max(2, width * 0.003)}px solid ${rule}` : undefined,
                ...el(`row${i + 1}`),
              }}
            >
              {p.ticks && [0, 1].map((side) => (
                <span
                  key={side}
                  style={{
                    position: 'absolute', top: -hand / 2, [side ? 'right' : 'left']: -hand / 2,
                    width: hand, height: hand, background: rgba(p.ink, 0.75),
                  }}
                />
              ))}
              <span style={{ textAlign: 'right', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.a}</span>
              <span style={{ textAlign: 'left', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.b}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            position: 'absolute', left: 0, top: height * 0.16, width: '100%', height: 0,
            transform: `translate(${parW.x.toFixed(2)}px, ${(parW.y + y).toFixed(2)}px)`,
            ...el('word'),
          }}
        >
          {p.ticks && (
            <div
              style={{
                position: 'absolute', left: width * 0.03, right: width * 0.03, top: 0,
                height: Math.max(2, width * 0.003), background: rule,
              }}
            />
          )}
          {p.ticks && [0, 1].map((side) => (
            <span
              key={side}
              style={{
                position: 'absolute', top: -hand / 2, [side ? 'right' : 'left']: width * 0.03 - hand / 2,
                width: hand, height: hand, background: rgba(p.ink, 0.75),
              }}
            />
          ))}
          {trail.map((gh, gi) => (
            <span
              key={`gh${gi}`}
              style={{
                position: 'absolute', left: '50%', top: 0,
                fontFamily: fontStack(p.wordFont), fontSize: fsW, fontStyle: 'italic', fontWeight: 700,
                color: p.wordCol, lineHeight: 1,
                opacity: gh.opacity,
                filter: `blur(${(smW.blurPx * 0.7 + 1).toFixed(2)}px)`,
                transform: `translate(-50%, -50%) translate(${gh.dx.toFixed(2)}px, ${gh.dy.toFixed(2)}px) rotate(${spin.toFixed(2)}deg)`,
                whiteSpace: 'nowrap',
              }}
            >
              {p.word}
            </span>
          ))}
          <span
            style={{
              position: 'absolute', left: '50%', top: 0,
              fontFamily: fontStack(p.wordFont), fontSize: fsW, fontStyle: 'italic', fontWeight: 700,
              color: p.wordCol, lineHeight: 1,
              filter: smW.blurPx > 0.3 ? `blur(${smW.blurPx.toFixed(2)}px)` : undefined,
              transform:
                `translate(-50%, -50%) rotate(${spin.toFixed(2)}deg) `
                + `scale(${(smW.sx * (1 + squash * 0.55)).toFixed(4)}, ${(smW.sy * (1 - squash)).toFixed(4)})`,
              // Soft bloom in the word's own colour + the depth shadow that sells the fall.
              textShadow: `${luxeGlow(p.wordCol, 0.7)}, 0 ${fsW * 0.06}px ${fsW * 0.2}px ${rgba('#000000', 0.5)}`,
              whiteSpace: 'nowrap',
            }}
          >
            {p.word}
          </span>
        </div>
      </div>
    );
  },
});
