// Split-lock title: the word arrives as its own top and bottom halves — two overflow-hidden
// windows onto the SAME full glyph run — sliding in from opposite sides and locking flush.
// Each window renders the complete word (offset inside the window), so the seam is a real
// glyph midline, not a masked rectangle: the lock reads seamless at any scale. A 2px flash
// on the seam marks the lock and dies inside a quarter second.

import type { CSSProperties } from 'react';
import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, outRamp, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeLabel } from '../luxe';
import { ghosts, parallax, smear, sway3d, vel } from '../juice';

// Spring starts at 240ms and first crosses 1 (the halves touching) near here — the flash and
// the kicker are keyed to this moment, not to the spring's start.
const LOCK_MS = 660;

export const splitReveal = defineGraphicsTemplate({
  id: 'split_reveal',
  name: 'Split Reveal',
  category: 'title',
  tags: ['Split', 'Halves', 'Slide', 'Lock', 'Bold'],
  badge: 'New',
  design: { w: 900, h: 500 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 74 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'top',    label: 'Top half', hideable: false },
    { key: 'bottom', label: 'Bottom half', hideable: false },
    { key: 'kicker', label: 'Kicker' },
    { key: 'seam',   label: 'Seam flash' },
  ],

  params: [
    { type: 'text', key: 'word',   label: 'Word',   group: 'Content', default: 'DISCIPLINE', maxLength: 16 },
    { type: 'text', key: 'kicker', label: 'Kicker', group: 'Content', default: 'CHAPTER 02', maxLength: 32 },

    { type: 'color', key: 'ink',    label: 'Text',       group: 'Style', default: '#F4F1E8' },
    { type: 'color', key: 'accent', label: 'Flash tint', group: 'Style', default: '#F59E0B' },
    { type: 'font',  key: 'font',   label: 'Font',       group: 'Style', default: 'anton' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Air as the halves fly, the lone hit at the LOCK instant (same constant the flash keys off),
  // then a quiet chime under the kicker — a title lock, not a barrage.
  sfx: (p) => [
    { atMs: p.delay + 280, id: 'whoosh', gain: 0.6 },
    { atMs: p.delay + LOCK_MS, id: 'slam', gain: 0.9 },
    { atMs: p.delay + 960, id: 'chime', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const out = outRamp(timeMs, durationMs, 320);

    // Damping 17 leaves a small overshoot: the halves cross a few px past flush, then settle.
    // That crossing IS the lock impact — flush-perfect arrival would read weightless. A closure
    // of absolute ms so vel() can sample the same motion for the smear.
    const slideAt = (ms: number) => spring({
      frame: fr(ms - 240), fps: FPS,
      config: { damping: 17, mass: 0.85, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });
    const slide = slideAt(t);
    const topX = (1 - slide) * -width * 0.45;
    const botX = (1 - slide) * width * 0.45;
    // MOTION BLUR: the halves smear along their slide (blur + horizontal-ONLY stretch — any
    // vertical squash would open the seam) and trail ghost frames that vanish at the lock.
    const vTop = vel((ms) => (1 - slideAt(ms)) * -width * 0.45, t);
    const smHalf = smear(vTop, 0, 0.85);
    const ghTop = ghosts(vTop, 0);
    const ghBot = ghosts(-vTop, 0);

    const flash = t < LOCK_MS ? 0 : clamp01((t - LOCK_MS) / 40) * Math.exp(-(t - LOCK_MS) / 240);
    const kickIn = easeOutQuint(clamp01((t - 880) / 460));
    // After the lock the word never goes dead: the whole block holds a slow ±1.9° 3D sway and
    // the kicker parallaxes against it.
    const parKick = parallax(t, seed, 0.6, height * 0.008);

    const fs = Math.round(Math.min(height * 0.42, (width * 1.5) / Math.max(3, p.word.length)));
    const H = fs * 1.1;
    const fsKick = Math.round(height * 0.052);

    const glyph: CSSProperties = {
      fontSize: fs, fontWeight: 400, lineHeight: 1,
      letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      color: p.ink, textShadow: '0 10px 30px rgba(0,0,0,0.45)',
    };
    const halfWin: CSSProperties = {
      position: 'absolute', left: 0, right: 0, height: H / 2, overflow: 'hidden',
    };
    const innerBase = (x: number, top: number): CSSProperties => ({
      position: 'absolute', left: 0, right: 0, top, height: H,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: `translateX(${x.toFixed(2)}px)`,
    });
    const inner = (x: number, top: number): CSSProperties => ({
      ...innerBase(x, top),
      transform: `translateX(${x.toFixed(2)}px) scale(${smHalf.sx.toFixed(4)}, 1)`,
      filter: smHalf.blurPx > 0.3 ? `blur(${smHalf.blurPx.toFixed(2)}px)` : undefined,
    });

    return (
      <div
        style={{
          position: 'absolute', inset: 0, opacity: clamp01(t / 140) * out,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: height * 0.045, fontFamily: fontStack(p.font),
        }}
      >
        <span
          style={{
            fontFamily: fontStack('montserrat'),
            ...luxeLabel(fsKick, LUXE.inkDim),
            opacity: kickIn,
            transform: `translate(${parKick.x.toFixed(2)}px, ${((1 - kickIn) * -height * 0.02 + parKick.y).toFixed(2)}px)`,
            ...el('kicker'),
          }}
        >
          {p.kicker}
        </span>

        <div style={{ position: 'relative', width: '100%', height: H, transform: sway3d(t, seed, 1.9) }}>
          <div style={{ ...halfWin, top: 0, ...el('top') }}>
            {ghTop.map((g, i) => (
              <div key={`gt${i}`} aria-hidden style={{ ...innerBase(topX + g.dx, 0), opacity: g.opacity }}>
                <span style={glyph}>{p.word}</span>
              </div>
            ))}
            <div style={inner(topX, 0)}>
              <span style={glyph}>{p.word}</span>
            </div>
          </div>
          <div style={{ ...halfWin, top: H / 2, ...el('bottom') }}>
            {ghBot.map((g, i) => (
              <div key={`gb${i}`} aria-hidden style={{ ...innerBase(botX + g.dx, -H / 2), opacity: g.opacity }}>
                <span style={glyph}>{p.word}</span>
              </div>
            ))}
            <div style={inner(botX, -H / 2)}>
              <span style={glyph}>{p.word}</span>
            </div>
          </div>
          <div
            style={{
              position: 'absolute', left: '10%', right: '10%', top: H / 2 - 1, height: 2,
              background: p.ink,
              boxShadow: `0 0 12px ${rgba(p.accent, 0.8)}, 0 0 34px ${rgba(p.accent, 0.4)}`,
              opacity: flash,
              ...el('seam'),
            }}
          />
        </div>
      </div>
    );
  },
});
