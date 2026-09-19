// Bento recap — the 2x2 stat-grid flex. Tiles spring in staggered, but the HERO tile is pulled
// out of grid order and ALWAYS lands last with a slam (flash + grid shake + chroma pop +
// sparkles), then idle-floats forever while the other tiles hold a breathing border. The craft:
// land order is hero-last regardless of which cell the hero occupies, so the eye ends on the flex.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, inkOn, rgba } from '../motion';
import { chromaPop, idleFloat, impactFlash, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH, sway3d, swingIn, vel } from '../juice';

export const bentoRecap = defineGraphicsTemplate({
  id: 'bento_recap',
  name: 'Bento Recap',
  category: 'story',
  tags: ['Bento', 'Grid', 'Stats', 'Tiles', 'Recap'],
  badge: 'Hot',
  design: { w: 900, h: 900 },
  // Paints its own tiles — the shared plate would only peek out through the grid gaps.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 56 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'tile1', label: 'Tile 1' },
    { key: 'tile2', label: 'Tile 2' },
    { key: 'tile3', label: 'Tile 3' },
    { key: 'tile4', label: 'Tile 4' },
  ],

  params: [
    { type: 'text', key: 'tiles', label: 'Tiles', group: 'Content', multiline: true, maxLength: 240,
      default: '10M|views this month\n+42K|new followers\n3|brand deals\n1|goal: hit 100K',
      help: 'One tile per line: value | label. Four lines fill the grid.' },
    { type: 'number', key: 'hero', label: 'Hero tile', group: 'Content', default: 1, min: 1, max: 4, step: 1,
      help: 'This tile goes amber and lands last.' },

    { type: 'color', key: 'heroCol', label: 'Hero', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'card',    label: 'Tiles', group: 'Style', default: '#15151A' },
    { type: 'color', key: 'ink',     label: 'Text', group: 'Style', default: '#F6F2E8' },

    { type: 'number', key: 'stagger', label: 'Stagger', group: 'Motion', default: 150, min: 60, max: 400, step: 10, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Three quiet pops as the supporting tiles land (in stagger order), then the hero slam —
  // retiming stagger retimes the whole build (hero lands at 3*stagger + 360, like the motion).
  sfx: (p) => [
    { atMs: p.delay + 140, id: 'pop', gain: 0.4 },
    { atMs: p.delay + p.stagger + 140, id: 'pop', gain: 0.45 },
    { atMs: p.delay + p.stagger * 2 + 140, id: 'pop', gain: 0.5 },
    { atMs: p.delay + p.stagger * 3 + 360, id: 'slam', gain: 0.9 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;
    const m = Math.min(width, height);
    const ffM = fontStack('montserrat');

    const lines = p.tiles.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4);
    const tiles: { value: string; label: string }[] = [];
    for (let i = 0; i < 4; i++) {
      const [value = '', label = ''] = (lines[i] ?? '').split('|').map((s) => s.trim());
      tiles.push({ value, label });
    }

    const heroI = Math.min(3, Math.max(0, Math.round(p.hero) - 1));
    // Land order: the three non-hero tiles in grid order, then the hero — plus a held beat.
    const order = [0, 1, 2, 3].filter((i) => i !== heroI).concat(heroI);
    const startOf = (i: number) => order.indexOf(i) * p.stagger + (i === heroI ? 160 : 0);
    const slamAt = startOf(heroI) + 200;

    const gridShake = shakeDecay(t, slamAt, m * 0.012, { seed });
    const heroFloat = idleFloat(t, seed, m * 0.006, 3000);
    const flash = impactFlash(t, slamAt, 150);
    const glowK = pulse(t, 1900, 0.5, 1);
    const heroInk = inkOn(p.heroCol);
    const sparks = sparkleField(`${seed}-h`, 8, t, slamAt, { spreadMs: 360, lifeMs: 600 });

    const fsVal = m * 0.1;
    const fsLab = m * 0.031;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: m * 0.03,
          // The whole bento lives in 3D — a slow ±1.4° sway the per-tile parallax shears against.
          transform: `${sway3d(t, seed, 1.4)} translate(${gridShake.x.toFixed(2)}px, ${gridShake.y.toFixed(2)}px)`,
        }}
      >
        {tiles.map((tile, i) => {
          const isHero = i === heroI;
          const sAt = (ms: number) => spring({
            frame: fr(ms - startOf(i)), fps: FPS,
            config: { damping: isHero ? 13 : 19, mass: 0.7, stiffness: isHero ? 240 : 170 },
            durationInFrames: Math.max(1, Math.round(fr(560))),
          });
          const s = sAt(t);
          const breathe = 0.1 + 0.1 * pulse(t, 2600, 0, 1, i * 1.4);
          // Z-STAGGER: each tile folds in from its own grid diagonal; the hero (foreground,
          // depth 0.85) smears with its slam velocity and lands crisp.
          const from = { rx: (i >> 1) === 0 ? -16 : 12, ry: (i % 2) === 0 ? -14 : 14, z: -80 };
          const par = parallax(t, seed, isHero ? 0.85 : 0.3 + i * 0.12, m * 0.009);
          const heroSmear = isHero ? smear(0, vel((ms: number) => 0.72 + 0.28 * sAt(ms), t) * m * 0.5) : null;
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                borderRadius: m * 0.05,
                padding: m * 0.04,
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
                gap: m * 0.012,
                fontFamily: ffM,
                background: isHero
                  ? `linear-gradient(165deg, ${rgba(p.heroCol, 1)} 0%, ${rgba(p.heroCol, 0.72)} 100%), linear-gradient(180deg, #1A1108 0%, #1A1108 100%)`
                  : `linear-gradient(180deg, ${rgba(p.card, 1)} 0%, #0E0E12 100%)`,
                border: isHero
                  ? `1.5px solid ${rgba(p.heroCol, 0.9)}`
                  : `1.5px solid rgba(255,255,255,${breathe.toFixed(3)})`,
                boxShadow: isHero
                  ? `0 ${m * 0.018}px ${m * 0.055}px rgba(0,0,0,0.45), 0 0 ${(m * 0.055 * glowK).toFixed(1)}px ${rgba(p.heroCol, 0.5 * glowK)}, inset 0 1px 0 rgba(255,255,255,0.35)`
                  : `0 ${m * 0.014}px ${m * 0.04}px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`,
                opacity: Math.min(1, s * 1.6),
                filter: heroSmear && heroSmear.blurPx > 0.3 ? `blur(${heroSmear.blurPx.toFixed(2)}px)` : undefined,
                transform: [
                  swingIn(s, from),
                  isHero ? `translate(${heroFloat.x.toFixed(2)}px, ${heroFloat.y.toFixed(2)}px) rotate(${heroFloat.rot.toFixed(3)}deg)` : '',
                  `translate(${par.x.toFixed(2)}px, ${(par.y + (1 - s) * m * 0.07).toFixed(2)}px)`,
                  heroSmear
                    ? `scale(${((0.72 + 0.28 * s) * heroSmear.sx).toFixed(4)}, ${((0.72 + 0.28 * s) * heroSmear.sy).toFixed(4)})`
                    : `scale(${(0.72 + 0.28 * s).toFixed(4)})`,
                ].filter(Boolean).join(' '),
                ...el(`tile${i + 1}`),
              }}
            >
              {tile.value && (
                <span
                  style={{
                    fontFamily: fontStack('anton'),
                    fontSize: fsVal, lineHeight: 1,
                    color: isHero ? heroInk : p.ink,
                    fontVariantNumeric: 'tabular-nums',
                    textShadow: isHero
                      ? [chromaPop(t, slamAt, m * 0.009)].filter(Boolean).join(', ') || undefined
                      : `0 2px 8px rgba(0,0,0,0.4)`,
                  }}
                >
                  {tile.value}
                </span>
              )}
              {tile.label && (
                <span
                  style={{
                    fontSize: fsLab, fontWeight: 600,
                    letterSpacing: '0.04em',
                    color: isHero ? rgba(heroInk, 0.72) : rgba(p.ink, 0.62),
                  }}
                >
                  {tile.label}
                </span>
              )}

              {isHero && flash > 0.02 && (
                <div
                  style={{
                    position: 'absolute', inset: 0,
                    background: `radial-gradient(circle, rgba(255,255,255,${(0.55 * flash).toFixed(3)}) 0%, transparent 70%)`,
                    pointerEvents: 'none',
                  }}
                />
              )}
              {isHero && sparks.map((sp, j) => (
                <svg
                  key={j}
                  width={m * 0.04} height={m * 0.04} viewBox="0 0 24 24"
                  style={{
                    position: 'absolute', left: `${sp.x}%`, top: `${sp.y}%`,
                    transform: `translate(-50%,-50%) scale(${sp.s.toFixed(3)}) rotate(${sp.rot.toFixed(1)}deg)`,
                    opacity: sp.o * 0.95,
                  }}
                >
                  <path d={SPARKLE_PATH} fill="#FFFBEB" />
                </svg>
              ))}
            </div>
          );
        })}
      </div>
    );
  },
});
