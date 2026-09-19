// PUNCH versus title — two names clash in from opposite sides on fast underdamped springs (they
// overshoot past their slot and get pulled back), then a bold VS badge stamps in with settle-shake
// and a one-shot expanding impact ring. The ring rides the SAME element transform as the badge, so
// hiding or nudging the badge takes its shockwave with it.

import type { CSSProperties } from 'react';
import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { ghosts, parallax, smear, sway3d, swingIn, vel } from '../juice';

const INK = '#F4F1E8';
const BG = '#0B0B0D';

/** Decaying settle-shake: pure function of ms-since-impact, dead within ~450ms. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

export const versusClash = defineGraphicsTemplate({
  id: 'versus_clash',
  name: 'Versus',
  category: 'title',
  tags: ['Versus', 'Clash', 'Names', 'Badge', 'Ring'],
  badge: 'New',
  design: { w: 900, h: 500 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 35, widthPercent: 80 },
  fonts: ['anton'],

  elements: [
    { key: 'left',  label: 'Left name', hideable: false },
    { key: 'right', label: 'Right name', hideable: false },
    { key: 'badge', label: 'VS badge' },
  ],

  params: [
    { type: 'text', key: 'left',   label: 'Left name',  group: 'Content', default: 'SKILL', maxLength: 14 },
    { type: 'image', key: 'leftImg',  label: 'Left photo',  group: 'Content', default: '', help: 'Optional — nothing is drawn when empty.' },
    { type: 'text', key: 'right',  label: 'Right name', group: 'Content', default: 'LUCK', maxLength: 14 },
    { type: 'image', key: 'rightImg', label: 'Right photo', group: 'Content', default: '', help: 'Optional — nothing is drawn when empty.' },
    { type: 'text', key: 'vsText', label: 'Badge text', group: 'Content', default: 'VS', maxLength: 4 },

    { type: 'color',   key: 'accent', label: 'Accent',          group: 'Style', default: '#F59E0B' },
    { type: 'font',    key: 'font',   label: 'Font',            group: 'Style', default: 'anton' },
    { type: 'boolean', key: 'plate',  label: 'Draw background', group: 'Style', default: true },

    { type: 'number', key: 'shake', label: 'Shake', group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // One whoosh per name flying in, then the lone full-gain slam when the badge stamps at 1190
  // (the same impact instant the ring and settle-shake key off).
  sfx: (p) => [
    { atMs: p.delay + 40, id: 'whoosh', gain: 0.55 },
    { atMs: p.delay + 380, id: 'whoosh', gain: 0.6 },
    { atMs: p.delay + 1190, id: 'slam', gain: 1 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const dist = width * 0.55;
    const fsL = Math.min(height * 0.27, (width * 0.6) / (0.56 * Math.max(2, p.left.length)));
    const fsR = Math.min(height * 0.27, (width * 0.6) / (0.56 * Math.max(2, p.right.length)));
    const d = height * 0.30;
    const cy = height * 0.5;

    // Fast clash springs — damping 14 carries each name PAST its resting slot for a beat.
    // Kept as closures of absolute ms so vel() can sample the same motion for the smear.
    const clashAt = (at: number) => (ms: number) => spring({
      frame: fr(ms - at), fps: FPS,
      config: { damping: 14, mass: 0.75, stiffness: 240 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const sLAt = clashAt(120);
    const sRAt = clashAt(460);
    const sL = sLAt(t);
    const sR = sRAt(t);
    const xL = (1 - sL) * -dist;
    const xR = (1 - sR) * dist;
    // MOTION BLUR: each name's fly-in velocity drives a horizontal smear + trailing ghost
    // frames that die the instant it parks — the clash arrives, it doesn't fade in.
    const vL = vel((ms) => (1 - sLAt(ms)) * -dist, t);
    const vR = vel((ms) => (1 - sRAt(ms)) * dist, t);
    const smL = smear(vL, 0, 0.9);
    const smR = smear(vR, 0, 0.9);
    const ghL = ghosts(vL, 0);
    const ghR = ghosts(vR, 0);

    // Badge stamps last: scale slams down, then settle-shake + one-shot ring at impact.
    const sBAt = (ms: number) => spring({
      frame: fr(ms - 1020), fps: FPS,
      config: { damping: 16, mass: 0.8, stiffness: 210 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const sB = sBAt(t);
    const vB = vel((ms) => 2.3 - 1.3 * sBAt(ms), t) * d * 0.5;
    const smB = smear(0, vB, 1.15);
    const impact = 1190;
    const shk = settle(t - impact, p.shake);
    const tRing = t - impact;
    const ringOn = tRing > 0 && tRing < 420;
    const rp = easeOut(tRing / 420);

    // The held card keeps living in space: root sway + the badge (foreground chip) parallaxing
    // over the two names, which sit closer to the plate.
    const parL = parallax(t, seed, 0.22, width * 0.008);
    const parR = parallax(t, seed, 0.3, width * 0.008);
    const parB = parallax(t, seed, 0.7, width * 0.008);

    const leftBase: CSSProperties = {
      position: 'absolute', left: width * 0.06, top: height * 0.09,
      fontSize: Math.round(fsL), fontWeight: 900, lineHeight: 1,
      letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      color: INK,
      textShadow: '0 10px 30px rgba(0,0,0,0.5)',
    };
    const rightBase: CSSProperties = {
      position: 'absolute', right: width * 0.06, bottom: height * 0.09,
      fontSize: Math.round(fsR), fontWeight: 900, lineHeight: 1,
      letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      color: p.accent,
      textShadow: `0 0 ${Math.round(fsR * 0.25)}px ${rgba(p.accent, 0.35)}, 0 10px 30px rgba(0,0,0,0.5)`,
    };

    const leftContent = (
      <>
        {p.leftImg && (
          <span
            style={{
              display: 'inline-flex', verticalAlign: 'middle', boxSizing: 'border-box',
              width: Math.round(fsL * 0.9), height: Math.round(fsL * 0.9),
              marginRight: Math.round(fsL * 0.18),
              borderRadius: '50%', overflow: 'hidden',
              border: `3px solid ${INK}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.leftImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </span>
        )}
        {p.left}
      </>
    );
    const rightContent = (
      <>
        {p.right}
        {p.rightImg && (
          <span
            style={{
              display: 'inline-flex', verticalAlign: 'middle', boxSizing: 'border-box',
              width: Math.round(fsR * 0.9), height: Math.round(fsR * 0.9),
              marginLeft: Math.round(fsR * 0.18),
              borderRadius: '50%', overflow: 'hidden',
              border: `3px solid ${p.accent}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.rightImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </span>
        )}
      </>
    );

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: clamp01(t / 120),
          fontFamily: ff,
          borderRadius: 28,
          overflow: p.plate ? 'hidden' : 'visible',
          background: p.plate ? `linear-gradient(180deg, #17171A 0%, ${BG} 55%)` : 'transparent',
          border: p.plate ? '1px solid rgba(255,255,255,0.10)' : 'none',
          boxShadow: p.plate ? '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' : 'none',
          transform: sway3d(t, seed, 1.6),
        }}
      >
        {ghL.map((g, i) => (
          <span
            key={`gl${i}`}
            aria-hidden
            style={{
              ...leftBase,
              opacity: clamp01(sL * 2.5) * g.opacity,
              transform: `translateX(${(xL + g.dx).toFixed(2)}px)`,
              ...el('left'),
            }}
          >
            {leftContent}
          </span>
        ))}
        <span
          style={{
            ...leftBase,
            opacity: clamp01(sL * 2.5),
            filter: smL.blurPx > 0.3 ? `blur(${smL.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(sL, { ry: -22, z: -120 })} translateX(${xL.toFixed(2)}px) translate(${parL.x.toFixed(2)}px, ${parL.y.toFixed(2)}px) scale(${smL.sx.toFixed(4)}, ${smL.sy.toFixed(4)})`,
            ...el('left'),
          }}
        >
          {leftContent}
        </span>

        {ghR.map((g, i) => (
          <span
            key={`gr${i}`}
            aria-hidden
            style={{
              ...rightBase,
              opacity: clamp01(sR * 2.5) * g.opacity,
              transform: `translateX(${(xR + g.dx).toFixed(2)}px)`,
              ...el('right'),
            }}
          >
            {rightContent}
          </span>
        ))}
        <span
          style={{
            ...rightBase,
            opacity: clamp01(sR * 2.5),
            filter: smR.blurPx > 0.3 ? `blur(${smR.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(sR, { ry: 22, z: -120 })} translateX(${xR.toFixed(2)}px) translate(${parR.x.toFixed(2)}px, ${parR.y.toFixed(2)}px) scale(${smR.sx.toFixed(4)}, ${smR.sy.toFixed(4)})`,
            ...el('right'),
          }}
        >
          {rightContent}
        </span>

        {ringOn && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', ...el('badge') }}>
            <circle
              cx={(width / 2).toFixed(1)} cy={cy.toFixed(1)}
              r={(d * 0.55 + rp * d * 0.75).toFixed(1)}
              fill="none" stroke={p.accent}
              strokeWidth={(12 * (1 - rp) + 2).toFixed(2)}
              opacity={(1 - rp).toFixed(3)}
            />
          </svg>
        )}

        <div
          style={{
            position: 'absolute', left: width / 2 - d / 2, top: cy - d / 2,
            width: d, height: d, borderRadius: '50%',
            boxSizing: 'border-box',
            background: p.accent,
            border: `6px solid ${BG}`,
            boxShadow: `0 12px 30px rgba(0,0,0,0.5), 0 0 24px ${rgba(p.accent, 0.35)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: clamp01(sB * 3),
            filter: smB.blurPx > 0.3 ? `blur(${smB.blurPx.toFixed(2)}px)` : undefined,
            transform: `translate(${(shk.x + parB.x).toFixed(2)}px, ${(shk.y + parB.y).toFixed(2)}px) scale(${((2.3 - 1.3 * sB) * smB.sx).toFixed(4)}, ${((2.3 - 1.3 * sB) * smB.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            ...el('badge'),
          }}
        >
          <span style={{ fontSize: Math.round(d * 0.4), fontWeight: 900, color: BG, letterSpacing: '0.02em', lineHeight: 1 }}>
            {p.vsText}
          </span>
        </div>
      </div>
    );
  },
});
