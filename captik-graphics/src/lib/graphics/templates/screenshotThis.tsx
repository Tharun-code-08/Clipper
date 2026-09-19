// "SCREENSHOT THIS" — the action-bait frame. Four camera-UI corner brackets snap in around a
// clear centre (footage shows through), a white shutter flash blinks the box, and an amber pill
// with a drawn camera glyph stamps in below with shake + sparkles. The craft: the shutter is a
// RHYTHM — it re-fires every shutterMs, and each capture pinches the brackets, pops the label
// chroma and ticks the glyph, so the ask ("screenshot this") repeats without a single keyframe.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { chromaPop, depthPose, idleFloat, impactFlash, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH, swingIn, vel } from '../juice';

const CORNERS = [
  { pos: { left: 0, top: 0 },     dx: -1, dy: -1, rot: 0 },
  { pos: { right: 0, top: 0 },    dx: 1,  dy: -1, rot: 90 },
  { pos: { right: 0, bottom: 0 }, dx: 1,  dy: 1,  rot: 180 },
  { pos: { left: 0, bottom: 0 },  dx: -1, dy: 1,  rot: 270 },
] as const;

export const screenshotThis = defineGraphicsTemplate({
  id: 'screenshot_this',
  name: 'Screenshot This',
  category: 'cta',
  tags: ['Brackets', 'Frame', 'Flash', 'Pill', 'Camera'],
  badge: 'Hot',
  design: { w: 900, h: 1040 },
  // The centre is deliberately clear footage — a plate would defeat the whole point.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 56 },
  fonts: ['montserrat'],

  elements: [
    { key: 'brackets', label: 'Corner brackets', hideable: false },
    { key: 'flash',    label: 'Shutter flash' },
    { key: 'pill',     label: 'Label pill' },
    { key: 'glyph',    label: 'Camera glyph' },
  ],

  params: [
    { type: 'text', key: 'label', label: 'Label', group: 'Content', default: 'SCREENSHOT THIS', maxLength: 22 },

    { type: 'color', key: 'bracketCol', label: 'Brackets', group: 'Style', default: '#FFFFFF' },
    { type: 'color', key: 'accent',     label: 'Pill', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',        label: 'Pill text', group: 'Style', default: '#0B0B0D' },

    { type: 'number', key: 'shutterMs', label: 'Shutter every', group: 'Motion', default: 2500, min: 1200, max: 6000, step: 100, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Shutter fires on the FIRST capture beat only (cues are static; the visual re-fires every
  // shutterMs), then the label pill pops in at its land.
  sfx: (p) => [
    { atMs: p.delay + 800, id: 'shutter', gain: 0.8 },
    { atMs: p.delay + 1150, id: 'pop', gain: 0.6 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    const m = Math.min(height, width * (1040 / 900));

    // ── Beats: brackets snap → first shutter → pill stamp → shutter keeps re-firing ──
    const firstShutter = 800;
    const pillAt = 1000;
    const pillLand = pillAt + 150;
    const lastShutter = t >= firstShutter
      ? firstShutter + Math.floor((t - firstShutter) / p.shutterMs) * p.shutterMs
      : firstShutter;
    const shutterK = t >= firstShutter ? impactFlash(t, lastShutter, 130) : 0;

    const stampAt = (ms: number) => spring({
      frame: fr(ms - pillAt), fps: FPS,
      config: { damping: 13, mass: 0.65, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const stamp = stampAt(t);
    const rootShakeA = shakeDecay(t, pillLand, m * 0.01, { seed });
    const rootShakeB = t >= firstShutter ? shakeDecay(t, lastShutter, m * 0.005, { seed: `${seed}-sh` }) : { x: 0, y: 0 };
    const drift = idleFloat(t, seed, m * 0.006, 3100);
    const glowK = pulse(t, 1500, 0.5, 1);
    const breathe = pulse(t, 2200, 0, m * 0.008);
    const sparks = sparkleField(seed, 8, t, pillLand, { spreadMs: 360, lifeMs: 580 });

    // DEPTH: the pill swings in top-hinged and keeps swaying (it is a graphic, so it may live in
    // space); the bracket frame mimics camera UI glued to the footage, so it gets NO sway — only
    // a subtle 0.2-depth parallax counter-drift against the pill, plus per-corner 3D snap-ins.
    const pillPose = depthPose(t, seed, { enter: stamp, rx: -18, z: -90, swayDeg: 2 });
    const pillSmear = smear(0, vel((ms: number) => 1.7 - 0.7 * stampAt(ms), t) * m * 0.35);
    const parFrame = parallax(t, seed, 0.2, m * 0.012);

    const b = m * 0.14;
    const glyphS = m * 0.055;
    const fsLabel = m * 0.05;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          transform: `translate(${(rootShakeA.x + rootShakeB.x).toFixed(2)}px, ${(rootShakeA.y + rootShakeB.y).toFixed(2)}px)`,
        }}
      >
        {/* ── Bracket frame — the centre stays clear footage ── */}
        <div
          style={{
            position: 'absolute',
            left: width * 0.05, right: width * 0.05,
            top: height * 0.03, bottom: height * 0.26,
            transform: `translate(${parFrame.x.toFixed(2)}px, ${parFrame.y.toFixed(2)}px)`,
            ...el('brackets'),
          }}
        >
          {CORNERS.map((c, i) => {
            const sAt = (ms: number) => spring({
              frame: fr(ms - 120 - i * 70), fps: FPS,
              config: { damping: 14, mass: 0.6, stiffness: 240 },
              durationInFrames: Math.max(1, Math.round(fr(420))),
            });
            const s = sAt(t);
            const out = (1 - s) * m * 0.12 + breathe - shutterK * m * 0.014;
            // Each corner folds in from its OWN diagonal (z-stagger) and smears with its snap
            // velocity — four objects arriving in space, not four divs appearing.
            const vSnap = vel((ms: number) => (1 - sAt(ms)) * m * 0.12, t);
            const snapSmear = smear(c.dx * vSnap, c.dy * vSnap);
            return (
              <svg
                key={i}
                width={b} height={b} viewBox="0 0 100 100"
                style={{
                  position: 'absolute', ...c.pos,
                  opacity: Math.min(1, s * 2),
                  transform: `${swingIn(s, { rx: c.dy * 14, ry: c.dx * 18, z: -80 })} translate(${(c.dx * out).toFixed(2)}px, ${(c.dy * out).toFixed(2)}px) rotate(${c.rot}deg)`,
                  filter: [
                    snapSmear.blurPx > 0.3 ? `blur(${snapSmear.blurPx.toFixed(2)}px)` : '',
                    `drop-shadow(0 ${(m * 0.004).toFixed(1)}px ${(m * 0.012).toFixed(1)}px rgba(0,0,0,0.6))`,
                  ].filter(Boolean).join(' '),
                }}
              >
                <path d="M 10 62 L 10 10 L 62 10" fill="none" stroke={p.bracketCol} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            );
          })}

          {/* shutter flash blinks the whole box */}
          {shutterK > 0.02 && (
            <div
              style={{
                position: 'absolute', inset: 0,
                borderRadius: m * 0.02,
                background: '#FFFFFF',
                opacity: (0.42 * shutterK).toFixed(3),
                pointerEvents: 'none',
                ...el('flash'),
              }}
            />
          )}
        </div>

        {/* ── Pill stamp + sparkle burst ── */}
        <div
          style={{
            position: 'absolute',
            left: '10%', right: '10%',
            top: height * 0.66, height: m * 0.24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: m * 0.022,
              padding: `${m * 0.024}px ${m * 0.048}px`,
              borderRadius: 999,
              background: p.accent,
              boxShadow: [
                `0 ${m * 0.014}px ${m * 0.045}px rgba(0,0,0,0.5)`,
                `0 0 ${(m * 0.07 * glowK).toFixed(1)}px ${rgba(p.accent, 0.55 * glowK)}`,
                'inset 0 1.5px 0 rgba(255,255,255,0.4)',
              ].join(', '),
              opacity: Math.min(1, stamp * 2),
              filter: pillSmear.blurPx > 0.3 ? `blur(${pillSmear.blurPx.toFixed(2)}px)` : undefined,
              transform: [
                pillPose,
                `translate(${drift.x.toFixed(2)}px, ${drift.y.toFixed(2)}px)`,
                `rotate(${drift.rot.toFixed(3)}deg)`,
                `scale(${((1.7 - 0.7 * stamp) * pillSmear.sx).toFixed(4)}, ${((1.7 - 0.7 * stamp) * pillSmear.sy).toFixed(4)})`,
              ].join(' '),
              ...el('pill'),
            }}
          >
            {/* drawn camera glyph — ticks on every shutter */}
            <svg
              width={glyphS} height={glyphS} viewBox="0 0 24 24"
              style={{
                transform: `scale(${(1 + shutterK * 0.12).toFixed(3)})`,
                ...el('glyph'),
              }}
            >
              <path d="M8.2 6 L9.6 3.6 L14.4 3.6 L15.8 6" fill="none" stroke={p.ink} strokeWidth={1.9} strokeLinejoin="round" />
              <rect x="2" y="6" width="20" height="14.5" rx="3" fill="none" stroke={p.ink} strokeWidth={1.9} />
              <circle cx="12" cy="13.2" r="4.4" fill="none" stroke={p.ink} strokeWidth={1.9} />
              <circle cx="18.6" cy="9.2" r="1" fill={p.ink} />
            </svg>
            <span
              style={{
                fontFamily: fontStack('montserrat'),
                fontWeight: 800,
                fontSize: fsLabel,
                letterSpacing: '0.13em',
                whiteSpace: 'nowrap',
                color: p.ink,
                textShadow: [
                  chromaPop(t, pillLand, m * 0.008),
                  t >= firstShutter + p.shutterMs ? chromaPop(t, lastShutter, m * 0.008) : '',
                ].filter(Boolean).join(', ') || undefined,
              }}
            >
              {p.label}
            </span>
          </div>

          {sparks.map((s, i) => (
            <svg
              key={i}
              width={m * 0.05} height={m * 0.05} viewBox="0 0 24 24"
              style={{
                position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
                transform: `translate(-50%,-50%) scale(${s.s.toFixed(3)}) rotate(${s.rot.toFixed(1)}deg)`,
                opacity: s.o,
              }}
            >
              <path d={SPARKLE_PATH} fill={p.accent} />
            </svg>
          ))}
        </div>
      </div>
    );
  },
});
