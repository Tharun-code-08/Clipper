// "Core memory unlocked" — nostalgia film-still frame. A white-bordered window (footage shows
// through) snaps in with a photo flash + settle shake, a warm light leak sweeps the glass over
// live grain, and a pixel-mono strip typewrites the line below, landing with a chroma pop.
// The craft: the leak sweeps HARD once on entry then soft every 4.2s, and the leak / twinkles /
// caret all run on detuned clocks — the frame keeps breathing like a memory, never a static PNG.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain } from '../luxe';
import { chromaPop, depthPose, idleFloat, impactFlash, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH, vel } from '../juice';

const DRIFTERS = 6;

export const coreMemory = defineGraphicsTemplate({
  id: 'core_memory',
  name: 'Core Memory',
  category: 'fx',
  tags: ['Film', 'Frame', 'Grain', 'Typewriter', 'Nostalgia'],
  badge: 'Hot',
  design: { w: 900, h: 840 },
  // Transparent by design — the window IS the footage; a plate would blind it.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 44, widthPercent: 64 },
  fonts: ['pixel'],

  elements: [
    { key: 'frame',    label: 'Film frame', hideable: false },
    { key: 'leak',     label: 'Light leak' },
    { key: 'caption',  label: 'Caption strip' },
    { key: 'sparkles', label: 'Sparkles' },
  ],

  params: [
    { type: 'text', key: 'caption', label: 'Caption', group: 'Content', default: 'core memory unlocked', maxLength: 30 },

    { type: 'color',  key: 'ink',    label: 'Frame & ink', group: 'Style', default: '#FFF7ED' },
    { type: 'color',  key: 'leak',   label: 'Leak colour', group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'accent', label: 'Sparkle',     group: 'Style', default: '#FBBF24' },
    { type: 'number', key: 'grain',  label: 'Grain',       group: 'Style', default: 0.12, min: 0, max: 0.35, step: 0.01 },

    { type: 'number', key: 'typeMs', label: 'Typing speed', group: 'Motion', default: 70, min: 30, max: 140, step: 5, unit: 'ms',
      help: 'Milliseconds per character.' },
    { type: 'number', key: 'zoom',  label: 'Slow zoom', group: 'Motion', default: 0.05, min: 0, max: 0.12, step: 0.01 },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // DOCU whisper: a low airy sweep under the entrance, the camera shutter on the flash (slamAt),
  // ONE typewriter tick as the strip starts, a luxe glass ping on the chroma-pop completion beat —
  // doneAt is the same caption-length arithmetic the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 30, id: 'sweep', gain: 0.35 },
    { atMs: p.delay + 240, id: 'shutter', gain: 0.55 },
    { atMs: p.delay + 760, id: 'tick', gain: 0.4 },
    { atMs: p.delay + 760 + p.caption.length * p.typeMs, id: 'glass', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    // Type fits the WIDTH even when an aspect preset makes the canvas taller than designed.
    const m = Math.min(height, width * (840 / 900));
    const slamAt = 240;

    // A closure of absolute ms so vel() can sample the same entrance for the motion smear.
    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 16, mass: 0.8, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const enter = enterAt(t);
    // DEPTH: the still swings in on a gentle top hinge and then keeps breathing in space —
    // documentary-subtle (~1.1°), never glossy. Caption strip parallaxes as foreground chrome.
    const pose = depthPose(t, seed, { enter, rx: -10, z: -70, swayDeg: 1.1 });
    const parCap = parallax(t, seed, 0.55, m * 0.012);
    // MOTION BLUR: entrance zoom velocity at the frame edge — smears the arrival, lands crisp.
    const vIn = vel((ms) => enterAt(ms) * 0.06, t) * m;
    const smIn = smear(0, vIn, 1);
    const shake = shakeDecay(t, slamAt, m * 0.014, { seed });
    const flash = impactFlash(t, slamAt, 190);
    const drift = idleFloat(t, seed, m * 0.006, 3200);
    const glowK = pulse(t, 2300, 0.5, 1);
    // The whole assembly creeps forward over the window — the "memory pulling you in" read.
    const zoom = 1 + clamp01(t / Math.max(1, durationMs)) * p.zoom;

    const frameW = width * 0.94;
    const frameH = m * 0.56;
    const bw = m * 0.02;
    const fsCap = m * 0.05;

    // Typewriter + completion beat.
    const typeAt = 760;
    const chars = Math.max(0, Math.floor((t - typeAt) / p.typeMs));
    const shown = p.caption.slice(0, chars);
    const doneAt = typeAt + p.caption.length * p.typeMs;
    const capShake = shakeDecay(t, doneAt, m * 0.006, { seed: `${seed}-cap` });
    const caretOn = Math.floor(t / 430) % 2 === 0;

    // Light leak: one hard sweep on entry, then a soft pass every 4.2s.
    const leakCycle = t < slamAt ? 0 : Math.floor((t - slamAt) / 4200);
    const leakLocal = t < slamAt ? 0 : (t - slamAt) % 4200;
    const leakQ = clamp01(leakLocal / 1500);
    const leakX = -55 + leakQ * 210;
    const leakStrength = (leakCycle === 0 ? 0.85 : 0.4) * (1 - Math.pow(leakQ, 3) * 0.5);

    const burst = sparkleField(seed, 8, t, slamAt, { spreadMs: 380, lifeMs: 600 });
    const capBurst = sparkleField(`${seed}-done`, 5, t, doneAt, { spreadMs: 260, lifeMs: 520 });

    // Slow drifting twinkles inside the window — each on its own detuned orbit.
    const drifters = Array.from({ length: DRIFTERS }, (_, i) => {
      const r = (s: string) => random(`${seed}-dr${i}${s}`);
      const period = 2800 + r('p') * 1600;
      const ph = r('h') * Math.PI * 2;
      return {
        x: 10 + r('x') * 80 + Math.sin(t / period + ph) * 4,
        y: 12 + r('y') * 76 + Math.cos(t / (period * 1.27) + ph) * 5,
        s: 0.55 + r('s') * 0.7,
        tw: pulse(t, 1400 + r('t') * 1100, 0.12, 0.95, ph),
        rot: r('r') * 90,
      };
    });

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: m * 0.035,
          opacity: Math.min(1, enter * 1.7),
          filter: smIn.blurPx > 0.3 ? `blur(${smIn.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translate(${(shake.x + drift.x).toFixed(2)}px, ${(shake.y + drift.y).toFixed(2)}px) rotate(${drift.rot.toFixed(3)}deg) scale(${(zoom * (0.94 + enter * 0.06) * smIn.sx).toFixed(4)}, ${(zoom * (0.94 + enter * 0.06) * smIn.sy).toFixed(4)})`,
        }}
      >
        {/* ── Film frame — the window is transparent; footage reads through ── */}
        <div
          style={{
            position: 'relative',
            width: frameW, height: frameH,
            border: `${bw.toFixed(1)}px solid ${p.ink}`,
            borderRadius: m * 0.012,
            boxShadow: [
              `0 ${m * 0.02}px ${m * 0.07}px rgba(0,0,0,0.5)`,
              `0 0 ${(m * 0.06 * glowK).toFixed(1)}px ${rgba(p.leak, 0.22 * glowK)}`,
              `inset 0 0 ${m * 0.05}px rgba(0,0,0,0.35)`,
            ].join(', '),
            ...el('frame'),
          }}
        >
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: m * 0.006 }}>
            <div
              style={{
                position: 'absolute', inset: m * 0.014,
                border: `2px solid ${rgba(p.ink, 0.28)}`,
                borderRadius: m * 0.006,
              }}
            />
            <div
              style={{
                position: 'absolute', inset: '-12%',
                background: `linear-gradient(104deg, transparent ${leakX - 26}%, ${rgba(p.leak, 0.5 * leakStrength)} ${leakX - 6}%, ${rgba('#FFE9C4', 0.75 * leakStrength)} ${leakX}%, ${rgba(p.leak, 0.4 * leakStrength)} ${leakX + 7}%, transparent ${leakX + 24}%)`,
                mixBlendMode: 'screen',
                ...el('leak'),
              }}
            />
            {p.grain > 0 && <div style={luxeGrain(p.grain)} />}
            <div style={{ position: 'absolute', inset: 0, ...el('sparkles') }}>
              {drifters.map((d, i) => (
                <svg
                  key={`d${i}`}
                  width={m * 0.034} height={m * 0.034} viewBox="0 0 24 24"
                  style={{
                    position: 'absolute', left: `${d.x.toFixed(2)}%`, top: `${d.y.toFixed(2)}%`,
                    transform: `translate(-50%,-50%) scale(${d.s.toFixed(3)}) rotate(${d.rot.toFixed(1)}deg)`,
                    opacity: d.tw * clamp01((t - 600) / 500),
                  }}
                >
                  <path d={SPARKLE_PATH} fill={p.accent} />
                </svg>
              ))}
              {burst.map((s, i) => (
                <svg
                  key={`b${i}`}
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
            {flash > 0.02 && (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  background: `radial-gradient(circle, rgba(255,244,224,${(0.6 * flash).toFixed(3)}) 0%, rgba(255,244,224,${(0.25 * flash).toFixed(3)}) 55%, transparent 85%)`,
                }}
              />
            )}
          </div>
        </div>

        {/* ── Mono caption strip — typewriter + blinking caret ── */}
        <div
          style={{
            position: 'relative',
            display: 'flex', alignItems: 'center',
            padding: `${(m * 0.02).toFixed(1)}px ${(m * 0.04).toFixed(1)}px`,
            borderRadius: m * 0.016,
            background: 'rgba(11,11,13,0.74)',
            border: '1.5px solid rgba(255,255,255,0.16)',
            boxShadow: `0 ${m * 0.012}px ${m * 0.04}px rgba(0,0,0,0.45), 0 0 ${(m * 0.035 * glowK).toFixed(1)}px ${rgba(p.leak, 0.18 * glowK)}`,
            opacity: clamp01((t - (typeAt - 220)) / 300),
            transform: `translate(${(capShake.x + parCap.x).toFixed(2)}px, ${(capShake.y + parCap.y).toFixed(2)}px)`,
            ...el('caption'),
          }}
        >
          <span
            style={{
              fontFamily: fontStack('pixel'),
              fontSize: fsCap,
              lineHeight: 1.15,
              letterSpacing: '0.06em',
              color: p.ink,
              whiteSpace: 'pre',
              textShadow: [
                `0 0 ${(m * 0.02 * glowK).toFixed(1)}px ${rgba(p.leak, 0.45 * glowK)}`,
                chromaPop(t, doneAt, m * 0.008),
              ].filter(Boolean).join(', '),
            }}
          >
            {shown}
          </span>
          <span
            style={{
              display: 'inline-block',
              width: fsCap * 0.5, height: fsCap * 0.85,
              marginLeft: fsCap * 0.18,
              background: rgba(p.leak, 0.9),
              opacity: caretOn ? 1 : 0,
            }}
          />
          {capBurst.map((s, i) => (
            <svg
              key={i}
              width={m * 0.04} height={m * 0.04} viewBox="0 0 24 24"
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
