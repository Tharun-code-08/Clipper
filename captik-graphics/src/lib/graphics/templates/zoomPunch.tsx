// Zoom-punch beat — the shorts punch-in, as a repeating frame-wide hit: hard vignette + white
// blink + red/cyan edge fringe + radiating speedline hints + a corner-bracket frame that snaps
// down with a decay-shake, then releases. The craft: the attack (70ms) and speedline life
// (220ms) are both SHORTER than the bracket spring's settle, so the eye reads impact-then-release
// like a real punch — and between beats the vignette breathes instead of flatlining.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { FPS, clamp01, fr, rgba } from '../motion';
import { idleFloat, impactFlash, pulse, shakeDecay, vel } from '../juice';

export const zoomPunch = defineGraphicsTemplate({
  id: 'zoom_punch',
  name: 'Zoom Punch',
  category: 'fx',
  tags: ['Punch', 'Vignette', 'Speedlines', 'Brackets', 'Impact'],
  badge: 'Hot',
  design: { w: 900, h: 900 },
  // Frame-wide effect: hugs the REAL video frame at any aspect. Every size below is a fraction
  // of min(width,height) — fullBleed render() gets canvas px, never the design canvas.
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 4200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  // No text is drawn; 'inter' satisfies the export font-warm gate at zero cost.
  fonts: ['inter'],

  elements: [
    { key: 'vignette', label: 'Vignette', hideable: false },
    { key: 'brackets', label: 'Bracket frame' },
    { key: 'lines',    label: 'Speedlines' },
    { key: 'fringe',   label: 'Colour fringe' },
  ],

  params: [
    { type: 'color',  key: 'accent',    label: 'Bracket colour', group: 'Style', default: '#FFFFFF' },
    { type: 'number', key: 'intensity', label: 'Intensity', group: 'Style', default: 1, min: 0.3, max: 1.5, step: 0.05 },
    { type: 'number', key: 'vignette',  label: 'Vignette', group: 'Style', default: 0.7, min: 0, max: 1, step: 0.05 },
    { type: 'number', key: 'lineCount', label: 'Speedlines', group: 'Style', default: 20, min: 8, max: 36, step: 1 },

    { type: 'number', key: 'beatMs', label: 'Beat every', group: 'Motion', default: 1400, min: 600, max: 4000, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // ONE trailer hit on the first punch beat only — scoring every beat would flatten the punch
  // into a metronome; the repeats live on the visual alone.
  sfx: (p) => [
    { atMs: p.delay, id: 'boom', gain: 0.65 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    const m = Math.min(width, height);
    const cycle = Math.floor(t / p.beatMs);
    const b = t % p.beatMs;

    // Punch envelope: 70ms attack, ~240ms release — the hit, then the let-go.
    const attack = 70;
    const rise = 1 - Math.pow(1 - clamp01(b / attack), 3);
    const fall = b <= attack ? 1 : Math.exp(-(b - attack) / 240);
    const k = rise * fall * p.intensity;

    const flash = impactFlash(b, 0, 120) * p.intensity;
    const shake = shakeDecay(b, 0, m * 0.008, { seed: `${seed}-c${cycle}` });
    const drift = idleFloat(t, seed, m * 0.0035, 3100);
    const glowB = pulse(t, 2100, 0.4, 1);

    // Bracket frame snaps DOWN onto the shot each beat, overshoots, settles.
    const snapAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 13, mass: 0.6, stiffness: 260 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });
    const snap = snapAt(b);
    const bScale = 1.1 - snap * 0.1;
    // MOTION BLUR on the snap only: the corners' radial speed (scale rate x corner radius)
    // smears the brackets for the few frames they are moving, then dies — the frame itself
    // is the camera and never blurs.
    const vBr = Math.abs(vel(snapAt, b)) * 0.1 * m * 0.45;
    const brBlur = Math.min(3, vBr * 2.2);

    // Vignette: punch spike over a breathing base — never a constant, never zero motion.
    const vAlpha = clamp01(pulse(t, 2600, 0.1, 0.18) * p.vignette + 0.55 * k * p.vignette);

    // Speedline hints: reseeded every beat, alive only for the first ~220ms.
    const cx = width / 2;
    const cy = height / 2;
    const R = Math.hypot(width, height) / 2;
    const lineK = k * clamp01(1 - b / 220);
    const nLines = Math.round(p.lineCount);

    const fringeD = m * 0.006 * k;
    const inset = m * 0.07;
    const arm = m * 0.09;
    const th = m * 0.01;

    const corner = (pos: React.CSSProperties, radii: React.CSSProperties): React.CSSProperties => ({
      position: 'absolute',
      width: arm, height: arm,
      borderColor: p.accent,
      borderStyle: 'solid',
      borderWidth: 0,
      ...pos,
      ...radii,
    });

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {/* hard vignette + white blink */}
        <div style={{ position: 'absolute', inset: 0, ...el('vignette') }}>
          <div
            style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(ellipse at center, transparent 48%, rgba(0,0,0,${vAlpha.toFixed(3)}) 100%)`,
            }}
          />
          {flash > 0.02 && (
            <div
              style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(circle, rgba(255,255,255,${(0.16 * flash).toFixed(3)}) 0%, transparent 70%)`,
              }}
            />
          )}
        </div>

        {/* chromatic edge fringe — thin red/cyan inner borders pushed apart by the hit */}
        <div style={{ position: 'absolute', inset: 0, ...el('fringe') }}>
          <div
            style={{
              position: 'absolute', inset: 0,
              border: `${(m * 0.008).toFixed(1)}px solid rgba(255,45,85,${(0.7 * k).toFixed(3)})`,
              transform: `translate(${(-fringeD).toFixed(2)}px, ${(-fringeD * 0.4).toFixed(2)}px)`,
              mixBlendMode: 'screen',
            }}
          />
          <div
            style={{
              position: 'absolute', inset: 0,
              border: `${(m * 0.008).toFixed(1)}px solid rgba(10,215,255,${(0.7 * k).toFixed(3)})`,
              transform: `translate(${fringeD.toFixed(2)}px, ${(fringeD * 0.4).toFixed(2)}px)`,
              mixBlendMode: 'screen',
            }}
          />
        </div>

        {/* speedline hints radiating from centre toward the edges */}
        {lineK > 0.02 && (
          <svg
            width={width} height={height} viewBox={`0 0 ${width} ${height}`}
            style={{ position: 'absolute', inset: 0, ...el('lines') }}
          >
            {Array.from({ length: nLines }, (_, i) => {
              const r = (s: string) => random(`${seed}-l${cycle}-${i}${s}`);
              const a = r('a') * Math.PI * 2;
              const r0 = R * (0.52 + r('r') * 0.16);
              const r1 = r0 + R * (0.12 + r('e') * 0.26) * (0.4 + lineK * 0.6);
              return (
                <line
                  key={i}
                  x1={(cx + Math.cos(a) * r0).toFixed(1)}
                  y1={(cy + Math.sin(a) * r0).toFixed(1)}
                  x2={(cx + Math.cos(a) * r1).toFixed(1)}
                  y2={(cy + Math.sin(a) * r1).toFixed(1)}
                  stroke={`rgba(255,255,255,${(lineK * (0.35 + r('o') * 0.4)).toFixed(3)})`}
                  strokeWidth={(m * 0.004 * (0.6 + r('w') * 0.8)).toFixed(2)}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        )}

        {/* corner-bracket frame — snaps down with the beat, shakes, breathes between hits */}
        <div
          style={{
            position: 'absolute', inset: 0,
            transform: `translate(${(shake.x + drift.x).toFixed(2)}px, ${(shake.y + drift.y).toFixed(2)}px) scale(${bScale.toFixed(4)})`,
            filter: `${brBlur > 0.3 ? `blur(${brBlur.toFixed(2)}px) ` : ''}drop-shadow(0 0 ${(m * 0.012 * glowB).toFixed(1)}px ${rgba(p.accent, 0.6 * glowB)})`,
            opacity: 0.55 + 0.45 * k,
            ...el('brackets'),
          }}
        >
          <div style={corner({ left: inset, top: inset, borderLeftWidth: th, borderTopWidth: th }, { borderTopLeftRadius: m * 0.012 })} />
          <div style={corner({ right: inset, top: inset, borderRightWidth: th, borderTopWidth: th }, { borderTopRightRadius: m * 0.012 })} />
          <div style={corner({ left: inset, bottom: inset, borderLeftWidth: th, borderBottomWidth: th }, { borderBottomLeftRadius: m * 0.012 })} />
          <div style={corner({ right: inset, bottom: inset, borderRightWidth: th, borderBottomWidth: th }, { borderBottomRightRadius: m * 0.012 })} />
        </div>
      </div>
    );
  },
});
