// Y2K liquid-chrome headline. The glyph fill is TWO stacked background layers clipped to the
// text — a 220%-tall chrome gradient that slowly ROLLS (the "liquid") under a sheen band that
// sweeps every ~2.8s — with transparent fill, so the breathing glow and the landing chroma pop
// read at the glyph edges. Star sparkles pop at the lockup's edges on a steady beat; a thin
// stroked echo floats behind. Slam entrance: flash + decay-shake + chroma pop.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { chromaPop, depthPose, idleFloat, impactFlash, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH, vel } from '../juice';

/** rgb() mix of two hexes — the chrome ramp takes a cool tint without a dozen colour params. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export const chromeWave = defineGraphicsTemplate({
  id: 'chrome_wave',
  name: 'Chrome Wave',
  category: 'title',
  tags: ['Chrome', 'Metallic', 'Y2K', 'Shine', 'Sparkle'],
  badge: 'Hot',
  design: { w: 900, h: 420 },
  // Pure typography — floats over footage; a plate would kill the chrome-on-video read.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 30, widthPercent: 70 },
  fonts: ['druk'],

  elements: [
    { key: 'text',     label: 'Headline', hideable: false },
    { key: 'echo',     label: 'Outline echo' },
    { key: 'sparkles', label: 'Sparkles' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Headline', group: 'Content', default: 'STAY DELUSIONAL', maxLength: 18 },

    { type: 'color',   key: 'tint', label: 'Chrome tint', group: 'Style', default: '#C7DBEE' },
    { type: 'color',   key: 'star', label: 'Star colour', group: 'Style', default: '#FFFFFF' },
    { type: 'boolean', key: 'echo', label: 'Outline echo', group: 'Style', default: true },

    { type: 'number', key: 'sweepEvery', label: 'Sheen every', group: 'Motion', default: 2800, min: 1200, max: 6000, step: 100, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Air into the stamp, the stamp itself, then a luxe ping on the second sparkle burst — the
  // same 300ms / +1500ms beats the slam and sparkle field are cut to.
  sfx: (p) => [
    { atMs: p.delay + 180, id: 'whoosh', gain: 0.6 },
    { atMs: p.delay + 300, id: 'slam', gain: 0.9 },
    { atMs: p.delay + 1800, id: 'glass', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    const m = Math.min(height, width * (420 / 900));
    const slamAt = 300;

    const slamOf = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 13, mass: 0.7, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(450))),
    });
    const slam = slamOf(t);
    const shake = shakeDecay(t, slamAt, m * 0.022, { seed });
    const flash = impactFlash(t, slamAt, 150);
    const drift = idleFloat(t, seed, m * 0.014, 2900);
    const glowK = pulse(t, 1700, 0.4, 1);

    // Druk Wide is WIDE — fit the line to the canvas width rather than trusting a fixed size.
    const fsHead = Math.min(m * 0.46, (width * 0.94) / Math.max(4, p.text.length) / 0.88);

    // Y2K chrome is a physical object, not a web font: the lockup stamps in through space on the
    // slam spring (side-hinged, so the metal catches the light as it turns) and keeps a ±2.2°
    // sway afterwards. The zoom's own velocity at the glyph edge smears the type for the few
    // frames it is flying and is gone the frame it lands — the chrome must land razor-sharp.
    const pose = depthPose(t, seed, { enter: slam, rx: -10, ry: 16, z: -140, swayDeg: 2.2, periodMs: 3400 });
    const zoomAt = (ms: number) => 1.55 - slamOf(ms) * 0.55;
    const zoom = zoomAt(t);
    const headSm = smear(vel(zoomAt, t) * fsHead, 0, 1.15);
    // Echo floats FORWARD of the plate, sparkles sit just behind it — the sway shears the three
    // planes apart instead of sliding them as one sticker.
    const parEcho = parallax(t, seed, 0.85, m * 0.03, 3400);
    const parSpark = parallax(t, seed, 0.3, m * 0.03, 3400);

    // Liquid roll: the chrome ramp is 220% tall and its position undulates — the horizon swims.
    const rollY = 50 + Math.sin(t / 1900) * 9 + Math.sin(t / 3300 + 1.7) * 4;
    // Bright-biased ramp: the dark "horizon" band stays THIN (48-52%) and everything else
    // lives in the white/silver range — a dark-heavy ramp made the line illegible on footage.
    const chrome = `linear-gradient(180deg,
      #FFFFFF 0%,
      ${mixHex('#F2F6FA', p.tint, 0.22)} 18%,
      ${mixHex('#C7D4E0', p.tint, 0.3)} 44%,
      ${mixHex('#4A5866', p.tint, 0.4)} 50%,
      ${mixHex('#9FB0C0', p.tint, 0.32)} 54%,
      ${mixHex('#EFF4F9', p.tint, 0.22)} 70%,
      #FFFFFF 82%,
      ${mixHex('#B7C6D4', p.tint, 0.3)} 100%)`;

    // Sheen band sweeps the glyphs once per beat.
    const sweepQ = t < slamAt ? 0 : ((t - slamAt) % p.sweepEvery) / p.sweepEvery;
    const sweepX = -40 + clamp01(sweepQ / 0.45) * 180;
    const sheen = `linear-gradient(104deg, transparent ${sweepX - 14}%, rgba(255,255,255,0.95) ${sweepX}%, transparent ${sweepX + 14}%)`;

    // Sparkles pop on a steady beat, biased to the lockup's EDGES (chrome stars live on corners).
    const sc = Math.max(0, Math.floor((t - slamAt) / 1500));
    const sparks = sparkleField(`${seed}-w${sc}`, sc === 0 ? 10 : 5, t, slamAt + sc * 1500, { spreadMs: 600, lifeMs: 620 })
      .map((s) => ({ ...s, x: s.x < 50 ? s.x * 0.45 : 100 - (100 - s.x) * 0.45 }));

    const headStyle = {
      fontFamily: fontStack('druk'),
      fontSize: fsHead,
      lineHeight: 1,
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap' as const,
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: Math.min(1, slam * 2),
          transform: `${pose} translate(${(shake.x + drift.x).toFixed(2)}px, ${(shake.y + drift.y).toFixed(2)}px) rotate(${drift.rot.toFixed(3)}deg) scale(${(zoom * headSm.sx).toFixed(4)}, ${(zoom * headSm.sy).toFixed(4)})`,
        }}
      >
        <div
          style={{
            position: 'relative',
            filter: headSm.blurPx > 0.3 ? `blur(${headSm.blurPx.toFixed(2)}px)` : undefined,
          }}
        >
          {/* stroked echo floating behind, offset down-right */}
          {p.echo && (
            <span
              style={{
                ...headStyle,
                position: 'absolute', left: 0, top: 0,
                color: 'transparent',
                WebkitTextStroke: `${(m * 0.006).toFixed(1)}px ${rgba(p.tint, 0.45)}`,
                transform: `translate(${(m * 0.022 + parEcho.x).toFixed(2)}px, ${(m * 0.028 + parEcho.y).toFixed(2)}px)`,
                ...el('echo'),
              }}
            >
              {p.text}
            </span>
          )}

          {/* Shadow/glow UNDERLAY: with background-clip text the fill is transparent, so any
              text-shadow on the chrome span itself bleeds THROUGH the glyphs and muddies the
              ramp — shadows must live on a solid twin behind it. */}
          <span
            aria-hidden
            style={{
              ...headStyle,
              position: 'absolute', left: 0, top: 0,
              color: '#0B0B0D',
              textShadow: [
                `0 ${m * 0.02}px ${m * 0.07}px rgba(0,0,0,0.8)`,
                `0 0 ${(m * 0.1 * glowK).toFixed(1)}px ${rgba(p.tint, 0.5 * glowK)}`,
                chromaPop(t, slamAt, m * 0.016),
              ].filter(Boolean).join(', '),
            }}
          >
            {p.text}
          </span>
          {/* chrome headline — sheen layer over the rolling chrome ramp, clipped to glyphs */}
          <span
            style={{
              ...headStyle,
              position: 'relative',
              color: 'transparent',
              backgroundImage: `${sheen}, ${chrome}`,
              backgroundSize: '100% 100%, 100% 220%',
              backgroundPosition: `0 0, 0 ${rollY.toFixed(2)}%`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              ...el('text'),
            }}
          >
            {p.text}
          </span>
        </div>

        {/* impact flash + edge sparkles */}
        {flash > 0.02 && (
          <div
            style={{
              position: 'absolute', inset: '-6%',
              background: `radial-gradient(circle, rgba(255,255,255,${(0.55 * flash).toFixed(3)}) 0%, transparent 60%)`,
              pointerEvents: 'none',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute', inset: 0,
            transform: `translate(${parSpark.x.toFixed(2)}px, ${parSpark.y.toFixed(2)}px)`,
            ...el('sparkles'),
          }}
        >
          {sparks.map((s, i) => (
            <svg
              key={i}
              width={m * 0.09} height={m * 0.09} viewBox="0 0 24 24"
              style={{
                position: 'absolute', left: `${s.x.toFixed(2)}%`, top: `${s.y}%`,
                transform: `translate(-50%,-50%) scale(${s.s.toFixed(3)}) rotate(${s.rot.toFixed(1)}deg)`,
                opacity: s.o,
                filter: `drop-shadow(0 0 ${(m * 0.02).toFixed(1)}px ${rgba(p.tint, 0.8)})`,
              }}
            >
              <path d={SPARKLE_PATH} fill={p.star} />
            </svg>
          ))}
        </div>
      </div>
    );
  },
});
