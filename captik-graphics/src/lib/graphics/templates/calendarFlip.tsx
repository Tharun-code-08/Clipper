// Desk flip-calendar — amber month strip over a huge Playfair date; the top half collapses,
// the bottom half unfolds, and date A becomes date B like a split-flap. The craft: the flip is
// 2D scaleY but the LIGHT sells the 3D — shadow gradients trade places at the fold — and the
// landing spring's overshoot is spent as a card dip + shadow pulse instead of bending the flap
// past flat.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

export const calendarFlip = defineGraphicsTemplate({
  id: 'calendar_flip',
  name: 'Calendar Flip',
  category: 'story',
  tags: ['Calendar', 'Date', 'Flip', 'Month', 'Paper'],
  badge: 'New',
  design: { w: 700, h: 700 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 34 },
  fonts: ['playfair', 'montserrat'],

  elements: [
    { key: 'card',    label: 'Card', hideable: false },
    { key: 'header',  label: 'Month strip' },
    { key: 'numeral', label: 'Date', hideable: false },
    { key: 'flap',    label: 'Flip flap' },
  ],

  params: [
    { type: 'text', key: 'month', label: 'Month', group: 'Content', default: 'MARCH', maxLength: 12 },
    { type: 'text', key: 'dateA', label: 'Date before', group: 'Content', default: '14', maxLength: 4 },
    { type: 'text', key: 'dateB', label: 'Date after', group: 'Content', default: '15', maxLength: 4 },

    { type: 'color', key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'flipAt', label: 'Flip at', group: 'Motion', default: 1500, min: 400, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay',  group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER language: a light pass as the card arrives, the page flick as the top flap falls,
  // a dry snap when the split-flap lands (330 fall + ~420 settle, same maths as the render).
  sfx: (p) => [
    { atMs: p.delay + 100, id: 'swish', gain: 0.3 },
    { atMs: p.delay + p.flipAt + 120, id: 'paper', gain: 0.55 },
    { atMs: p.delay + p.flipAt + 750, id: 'snap', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2.4;
    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });

    // Top half accelerates DOWN like a falling page; the bottom half lands on a spring whose
    // overshoot is clamped off the flap and spent on the card instead.
    const p1At = (ms: number) => {
      const raw = clamp01((ms - p.flipAt) / 330);
      return raw * raw;
    };
    const s2At = (ms: number) => spring({
      frame: fr(ms - p.flipAt - 330), fps: FPS,
      config: { damping: 15, mass: 0.7, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const p1 = p1At(t);
    const s2 = s2At(t);
    const p2 = Math.min(1, s2);
    const bump = Math.max(0, s2 - 1);
    const tLand = p.flipAt + 330 + 420;
    const pulse = t >= tLand ? Math.max(0, 1 - (t - tLand) / 320) : 0;

    const hH = Math.round(height * 0.16);
    const aH = height - hH;

    // The card is TOSSED in on a casual paper hinge and keeps a small resting sway; the flaps
    // get TRUE velocity blur — each half's fold speed (scaleY derivative at the flap's edge)
    // smears the paper mid-flip and dies dead the moment the fold rests.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -80, swayDeg: 1.1 });
    const blurTop = smear(0, vel(p1At, t) * aH * 0.5, 1).blurPx;
    const blurBot = smear(0, vel((ms) => Math.min(1, s2At(ms)), t) * aH * 0.5, 1).blurPx;
    const fsNum = Math.round(height * 0.44);
    const fsMonth = Math.round(height * 0.05);

    const digits = (v: string) => (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: fontStack('playfair'), fontWeight: 700,
          fontSize: fsNum, letterSpacing: '-0.02em', color: p.ink,
        }}
      >
        {v}
      </div>
    );

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 28,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: `0 ${(12 + pulse * 10).toFixed(1)}px ${(28 + pulse * 16).toFixed(1)}px rgba(0,0,0,${(0.12 + pulse * 0.07).toFixed(3)}), 0 30px 60px rgba(0,0,0,0.08)`,
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          transform:
            `${pose} translateY(${((1 - enter) * height * 0.07 + bump * 7).toFixed(2)}px) ` +
            `rotate(${(tilt + (1 - enter) * 1.8).toFixed(3)}deg)`,
          fontFamily: fontStack('montserrat'),
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          ...el('card'),
        }}
      >
        <div
          style={{
            height: hH, flexShrink: 0,
            background: p.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: fsMonth, fontWeight: 700, color: inkOn(p.accent),
            letterSpacing: '0.3em', paddingLeft: '0.3em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            ...el('header'),
          }}
        >
          {p.month}
        </div>

        <div style={{ position: 'relative', flex: 1, ...el('numeral') }}>
          {/* Base: the NEXT date, revealed as the flaps move. */}
          {digits(p.dateB)}

          {/* Old date's bottom half stays until the new bottom flap unfolds over it. */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: aH / 2, height: aH / 2, overflow: 'hidden', background: p.paper }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: -aH / 2, height: aH }}>{digits(p.dateA)}</div>
          </div>

          <div style={{ position: 'absolute', inset: 0, ...el('flap') }}>
            {/* Top flap: old date's upper half, collapsing toward the fold. */}
            <div
              style={{
                position: 'absolute', left: 0, right: 0, top: 0, height: aH / 2,
                overflow: 'hidden', background: p.paper,
                transformOrigin: '50% 100%',
                filter: blurTop > 0.3 ? `blur(${blurTop.toFixed(2)}px)` : undefined,
                transform: `scaleY(${(1 - p1).toFixed(4)})`,
              }}
            >
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: aH }}>{digits(p.dateA)}</div>
              <div
                style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.45))',
                  opacity: (p1 * 0.85).toFixed(3),
                }}
              />
            </div>

            {/* Bottom flap: new date's lower half, unfolding from the fold. */}
            <div
              style={{
                position: 'absolute', left: 0, right: 0, top: aH / 2, height: aH / 2,
                overflow: 'hidden', background: p.paper,
                transformOrigin: '50% 0%',
                filter: blurBot > 0.3 ? `blur(${blurBot.toFixed(2)}px)` : undefined,
                transform: `scaleY(${p2.toFixed(4)})`,
              }}
            >
              <div style={{ position: 'absolute', left: 0, right: 0, top: -aH / 2, height: aH }}>{digits(p.dateB)}</div>
              <div
                style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0))',
                  opacity: ((1 - p2) * 0.8).toFixed(3),
                }}
              />
            </div>
          </div>

          {/* Paper edges at the fold. */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: aH / 2 - 6, height: 2, background: rgba(p.ink, 0.06) }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: aH / 2 - 1, height: 2, background: rgba(p.ink, 0.16) }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: aH / 2 + 4, height: 2, background: rgba(p.ink, 0.06) }} />
        </div>
      </div>
    );
  },
});
