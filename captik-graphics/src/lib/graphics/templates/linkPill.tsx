// Link CTA: an amber pill with a chain-link glyph lands on a friendly spring, the URL types on,
// then a cursor slides in from bottom-right and CLICKS it. The press is a fast 80ms dip released
// through an underdamped spring — the tiny rebound past 1.0 is what sells the click — plus a
// one-shot expanding ring from the click point. URL text auto-shrinks to stay inside the pill.

import { interpolate, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

export const linkPill = defineGraphicsTemplate({
  id: 'link_pill',
  name: 'Link Pill',
  category: 'cta',
  tags: ['Pill', 'Link', 'Button', 'Cursor', 'Click'],
  badge: 'New',
  design: { w: 800, h: 260 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3800,
  defaultBox: { xPercent: 50, yPercent: 64, widthPercent: 62 },
  fonts: ['montserrat'],

  elements: [
    { key: 'pill',   label: 'Pill', hideable: false },
    { key: 'url',    label: 'URL text' },
    { key: 'cursor', label: 'Cursor' },
    { key: 'ring',   label: 'Click ring' },
  ],

  params: [
    { type: 'text', key: 'url', label: 'Link text', group: 'Content', default: 'captik.in/tools', maxLength: 32 },

    { type: 'boolean', key: 'dark', label: 'Dark pill', group: 'Style', default: false },
    { type: 'color',  key: 'fill', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'size', label: 'Text size', group: 'Style', default: 44, min: 28, max: 60, step: 1, unit: 'px' },

    { type: 'number', key: 'charMs', label: 'Type speed', group: 'Motion', default: 50, min: 25, max: 120, step: 5, unit: 'ms' },
    { type: 'number', key: 'clickAt', label: 'Click at', group: 'Motion', default: 2350, min: 800, max: 3400, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Pop on the landing, ONE typewriter tick as the URL starts typing (340 mirrors typeStart),
  // and a dry snap AT the click beat — all keyed to the same delay/clickAt the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 120, id: 'pop', gain: 0.55 },
    { atMs: p.delay + 340, id: 'tick', gain: 0.4 },
    { atMs: p.delay + p.clickAt, id: 'snap', gain: 0.8 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const pillW = width * 0.86;
    const pillH = height * 0.585;

    // Landing: friendly spring — a visible but dignified overshoot.
    const landAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 16, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const land = landAt(t);

    // DEPTH + BLUR: the pill swings in top-hinged on the same landing spring and keeps a
    // gentle ±1.5° sway; its drop velocity smears it in flight and dies the frame it lands.
    const yAt = (ms: number) => (1 - landAt(ms)) * 46;
    const pillSmear = smear(0, vel(yAt, t), 1.3);
    const pose = depthPose(t, seed, { enter: land, rx: -16, z: -90, swayDeg: 1.5 });

    // Typing: chars are a floor of timeMs — pure. Caret holds solid while typing, blinks after.
    const full = p.url;
    const typeStart = 340;
    const chars = Math.max(0, Math.floor((t - typeStart) / p.charMs));
    const shown = full.slice(0, Math.min(chars, full.length));
    const doneT = typeStart + full.length * p.charMs;
    const caretOn = t < doneT + 700 && (t < doneT || Math.floor(t / 420) % 2 === 0);

    // Click: 80ms dip, released through an underdamped spring (rebounds a hair past 1.0).
    const tc = t - p.clickAt;
    const down = tc <= 0 ? 0 : Math.min(1, tc / 80);
    const rel = spring({
      frame: fr(tc - 80), fps: FPS,
      config: { damping: 13, mass: 0.6, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const pressK = down * (1 - rel);
    const pressScale = 1 - 0.045 * pressK;

    // Cursor glides in from bottom-right over the 650ms before the click, then holds.
    const travel = interpolate(t, [p.clickAt - 650, p.clickAt], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    });
    const cx = interpolate(travel, [0, 1], [width * 0.94, width * 0.655]);
    const cy = interpolate(travel, [0, 1], [height * 1.05, height * 0.585]);

    // One-shot click ring from the click point.
    const rip = tc > 0 ? Math.min(1, tc / 650) : 0;
    const ringD = 40 + rip * 190;
    const ringCx = width * 0.655, ringCy = height * 0.57;

    const dark = p.dark;
    const ink = dark ? '#F4F1E8' : inkOn(p.fill);
    const glyphCol = dark ? p.fill : ink;
    const ringCol = dark ? '#FBBF24' : '#FFFFFF';
    const fs = Math.min(p.size, (pillW - 200) / Math.max(1, full.length * 0.58));

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: fontStack('montserrat') }}>
        <div
          style={{
            position: 'absolute',
            left: (width - pillW) / 2,
            top: (height - pillH) / 2,
            width: pillW, height: pillH,
            borderRadius: pillH / 2,
            display: 'flex', alignItems: 'center',
            gap: 20, paddingLeft: 44, paddingRight: 44,
            boxSizing: 'border-box',
            background: dark
              ? 'linear-gradient(180deg, #1A190F 0%, #0B0B0D 100%)'
              : `linear-gradient(165deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 52%), ${p.fill}`,
            border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(255,255,255,0.35)',
            boxShadow:
              `0 ${Math.round(pillH * 0.06)}px ${Math.round(pillH * 0.16)}px rgba(0,0,0,0.28), `
              + `0 ${Math.round(pillH * 0.2)}px ${Math.round(pillH * 0.5)}px rgba(0,0,0,0.2), `
              + `0 0 ${Math.round(pillH * 0.45)}px ${rgba(p.fill, dark ? 0.14 : 0.22)}`,
            opacity: clamp01(land * 2.2),
            filter: pillSmear.blurPx > 0.3 ? `blur(${pillSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${pose} translateY(${(yAt(t) + pressK * 3).toFixed(2)}px) scale(${((0.82 + land * 0.18) * pressScale * pillSmear.sx).toFixed(4)}, ${((0.82 + land * 0.18) * pressScale * pillSmear.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('pill'),
          }}
        >
          {/* Chain-link glyph: two interlocked rounded rects */}
          <svg width={58} height={32} viewBox="0 0 44 24" aria-hidden="true" style={{ flexShrink: 0 }}>
            <rect x="2" y="4" width="25" height="16" rx="8" fill="none" stroke={glyphCol} strokeWidth="3.4" />
            <rect x="17" y="4" width="25" height="16" rx="8" fill="none" stroke={glyphCol} strokeWidth="3.4" />
          </svg>

          <span
            style={{
              fontSize: fs.toFixed(1) + 'px', fontWeight: 600, color: ink,
              letterSpacing: '0.01em', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center',
              ...el('url'),
            }}
          >
            {shown}
            <span
              style={{
                display: 'inline-block',
                width: 3, height: fs * 1.05,
                marginLeft: 4,
                background: dark ? p.fill : ink,
                opacity: caretOn ? 0.9 : 0,
              }}
            />
          </span>
        </div>

        {rip > 0 && rip < 1 && (
          <div
            style={{
              position: 'absolute',
              left: (ringCx - ringD / 2).toFixed(1) + 'px',
              top: (ringCy - ringD / 2).toFixed(1) + 'px',
              width: ringD.toFixed(1) + 'px', height: ringD.toFixed(1) + 'px',
              borderRadius: '50%',
              border: `4px solid ${ringCol}`,
              opacity: ((1 - rip) * 0.85).toFixed(3),
              ...el('ring'),
            }}
          />
        )}

        {travel > 0 && (
          <svg
            width={44} height={55} viewBox="0 0 16 20" aria-hidden="true"
            style={{
              position: 'absolute', left: cx.toFixed(1) + 'px', top: cy.toFixed(1) + 'px',
              opacity: Math.min(1, travel * 3),
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
              transform: `scale(${(1 - 0.1 * pressK).toFixed(3)})`,
              transformOrigin: 'top left',
              ...el('cursor'),
            }}
          >
            <path d="M1 1l12.5 8.2-5.6.7 3.2 6.4-2.6 1.3-3.2-6.4L1 15.4Z" fill="#ffffff" stroke="#111" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    );
  },
});
