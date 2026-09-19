// "WAIT FOR IT" — the retention hook banner. A drawn siren beacon with a ROTATING light sweep
// slams in over huge condensed type, lands with flash + decay-shake + a one-beat chromatic pop,
// then never sits still: the beacon glow breathes, a highlight sweeps the type every ~2.6s and a
// chevron bounces the eye down toward the payoff. The craft: urgency is a RHYTHM (pulse + sweep
// + bounce all detuned), not a red rectangle.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { chromaPop, depthPose, idleFloat, impactFlash, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH, vel } from '../juice';

export const waitForIt = defineGraphicsTemplate({
  id: 'wait_for_it',
  name: 'Wait For It',
  category: 'notify',
  tags: ['Hook', 'Siren', 'Alert', 'Retention', 'Arrow'],
  badge: 'Hot',
  design: { w: 900, h: 460 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 24, widthPercent: 62 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'beacon', label: 'Siren beacon' },
    { key: 'text',   label: 'Headline', hideable: false },
    { key: 'sub',    label: 'Subline' },
    { key: 'arrow',  label: 'Arrow' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Headline', group: 'Content', default: 'WAIT FOR IT', maxLength: 18 },
    { type: 'text', key: 'sub',  label: 'Subline', group: 'Content', default: 'watch till the end', maxLength: 32 },

    { type: 'color', key: 'siren', label: 'Siren', group: 'Style', default: '#FF3B30' },
    { type: 'color', key: 'ink',   label: 'Headline colour', group: 'Style', default: '#F6F2E8' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Air sweeps in 300ms ahead of the slam (at 340), then the alert blip lands ON the hit.
  sfx: (p) => [
    { atMs: p.delay + 40, id: 'whoosh', gain: 0.7 },
    { atMs: p.delay + 340, id: 'blip', gain: 0.8 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    // Type fits the WIDTH even when an aspect preset makes the canvas taller than designed.
    const m = Math.min(height, width * (460 / 900));
    const slamAt = 340;

    const slamSpring = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 15, mass: 0.8, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const slam = slamSpring(t);
    const shake = shakeDecay(t, slamAt, m * 0.02, { seed });
    const flash = impactFlash(t, slamAt, 150);
    const drift = idleFloat(t, seed, m * 0.008);

    // DEPTH: the lockup swings in top-hinged through 3D and keeps a ±2° sway after; the
    // entrance velocity smears the headline so the slam ARRIVES instead of appearing, and the
    // beacon / subline / chevron sit at different parallax depths so the sway shears them.
    const pose = depthPose(t, seed, { enter: slam, rx: -18, z: -110, swayDeg: 2 });
    const headSmear = smear(0, vel(slamSpring, t) * m * 0.5);
    const parBeacon = parallax(t, seed, 0.6, m * 0.014);
    const parSub = parallax(t, seed, 0.35, m * 0.014);
    const parArrow = parallax(t, seed, 0.85, m * 0.014);

    // Beacon: dome + base; the rotating sweep is a conic highlight faked with a gradient wedge
    // whose angle is a pure function of t. Glow breathes; everything detuned.
    const beaconR = m * 0.16;
    const sweepDeg = ((t / 1400) * 360) % 360;
    const glowK = pulse(t, 1100, 0.45, 1);

    // Highlight sweep across the type every 2.6s: background-position of a clipped gradient.
    const sweepQ = ((t - 900) % 2600) / 2600;
    const sweepX = -60 + clamp01(sweepQ) * 220;

    const fsHead = m * 0.30;
    const fsSub = m * 0.085;
    const chevron = m * 0.11;
    const bounce = Math.abs(Math.sin((t / 640) * Math.PI)) * m * 0.05;
    const sparks = sparkleField(seed, 7, t, slamAt, { spreadMs: 320, lifeMs: 560 });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: m * 0.035,
          opacity: Math.min(1, slam * 1.6),
          transform: `${pose} translate(${(shake.x + drift.x).toFixed(2)}px, ${(shake.y + drift.y).toFixed(2)}px) rotate(${drift.rot.toFixed(3)}deg) scale(${(0.86 + slam * 0.14).toFixed(4)})`,
          transformOrigin: '50% 30%',
        }}
      >
        {/* ── Siren beacon ── */}
        <div style={{ position: 'relative', width: beaconR * 2.4, height: beaconR * 1.5, transform: `translate(${parBeacon.x.toFixed(2)}px, ${parBeacon.y.toFixed(2)}px)`, ...el('beacon') }}>
          {/* breathing glow */}
          <div
            style={{
              position: 'absolute', left: '50%', top: '58%',
              width: beaconR * 4.4, height: beaconR * 4.4,
              transform: 'translate(-50%,-50%)',
              background: `radial-gradient(circle, ${rgba(p.siren, 0.5 * glowK)} 0%, ${rgba(p.siren, 0.16 * glowK)} 42%, transparent 70%)`,
              borderRadius: '50%',
            }}
          />
          {/* dome with rotating light wedge */}
          <div
            style={{
              position: 'absolute', left: '50%', bottom: beaconR * 0.28,
              width: beaconR * 2, height: beaconR,
              transform: 'translateX(-50%)',
              borderRadius: `${beaconR}px ${beaconR}px ${beaconR * 0.14}px ${beaconR * 0.14}px`,
              background: `linear-gradient(180deg, ${rgba(p.siren, 0.98)} 0%, ${rgba(p.siren, 0.72)} 100%)`,
              overflow: 'hidden',
              boxShadow: `0 0 ${(beaconR * 0.9 * glowK).toFixed(1)}px ${rgba(p.siren, 0.65 * glowK)}, inset 0 ${beaconR * 0.1}px 0 rgba(255,255,255,0.35)`,
            }}
          >
            <div
              style={{
                position: 'absolute', inset: -beaconR * 0.6,
                background: `conic-gradient(from ${sweepDeg.toFixed(1)}deg, rgba(255,255,255,0.9) 0deg, transparent 55deg, transparent 360deg)`,
                opacity: 0.85,
              }}
            />
          </div>
          {/* base */}
          <div
            style={{
              position: 'absolute', left: '50%', bottom: 0,
              width: beaconR * 2.4, height: beaconR * 0.3,
              transform: 'translateX(-50%)',
              borderRadius: beaconR * 0.15,
              background: 'linear-gradient(180deg, #3A3A40 0%, #1B1B1F 100%)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
          />
        </div>

        {/* ── Headline with sweep + chroma pop ── */}
        <span
          style={{
            fontFamily: fontStack('anton'),
            fontSize: fsHead,
            lineHeight: 1,
            letterSpacing: '0.02em',
            color: p.ink,
            whiteSpace: 'nowrap',
            textShadow: [
              `0 ${m * 0.012}px ${m * 0.05}px rgba(0,0,0,0.75)`,
              `0 0 ${(m * 0.09 * glowK).toFixed(1)}px ${rgba(p.siren, 0.35 * glowK)}`,
              chromaPop(t, slamAt, m * 0.014),
            ].filter(Boolean).join(', '),
            backgroundImage: `linear-gradient(105deg, transparent ${sweepX - 18}%, rgba(255,255,255,0.85) ${sweepX}%, transparent ${sweepX + 18}%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            filter: headSmear.blurPx > 0.3 ? `blur(${headSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `scale(${headSmear.sx.toFixed(4)}, ${headSmear.sy.toFixed(4)})`,
            ...el('text'),
          }}
        >
          {p.text}
        </span>

        {p.sub && (
          <span
            style={{
              fontFamily: fontStack('montserrat'),
              fontSize: fsSub, fontWeight: 700,
              letterSpacing: '0.34em', textTransform: 'uppercase',
              color: rgba(p.accent, 0.95),
              paddingLeft: '0.34em',
              textShadow: `0 0 ${(m * 0.04 * glowK).toFixed(1)}px ${rgba(p.accent, 0.5 * glowK)}, 0 2px 10px rgba(0,0,0,0.7)`,
              opacity: clamp01((t - 620) / 400),
              transform: `translate(${parSub.x.toFixed(2)}px, ${parSub.y.toFixed(2)}px)`,
              ...el('sub'),
            }}
          >
            {p.sub}
          </span>
        )}

        {/* ── Bouncing chevron ── */}
        <svg
          width={chevron * 1.7} height={chevron}
          viewBox="0 0 34 20"
          style={{
            transform: `translate(${parArrow.x.toFixed(2)}px, ${(bounce + parArrow.y).toFixed(2)}px)`,
            opacity: clamp01((t - 850) / 400) * pulse(t, 640, 0.55, 1),
            filter: `drop-shadow(0 0 ${(m * 0.025).toFixed(1)}px ${rgba(p.accent, 0.6)})`,
            ...el('arrow'),
          }}
        >
          <path d="M3 3 L17 15 L31 3" fill="none" stroke={p.accent} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* impact flash + sparkles */}
        {flash > 0.02 && (
          <div
            style={{
              position: 'absolute', inset: '-4%',
              background: `radial-gradient(circle, rgba(255,255,255,${(0.5 * flash).toFixed(3)}) 0%, transparent 62%)`,
              pointerEvents: 'none',
            }}
          />
        )}
        {sparks.map((s, i) => (
          <svg
            key={i}
            width={m * 0.06} height={m * 0.06} viewBox="0 0 24 24"
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
    );
  },
});
