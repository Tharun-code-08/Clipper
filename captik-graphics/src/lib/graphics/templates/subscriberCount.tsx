// DOCU glass subscriber counter: a huge tabular numeral counts start→end with velocity blur
// that sharpens exactly at landing, then holds amber past the milestone. The one-shot flash
// ring fires at the ANALYTICALLY inverted crossing time of the ease (t* = countMs·(1−(1−p*)^⅕)),
// not by comparing consecutive frames — so the beat is identical at any fps and any scrub.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeGlow, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax } from '../juice';

function group(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const subscriberCount = defineGraphicsTemplate({
  id: 'subscriber_count',
  name: 'Subscriber Count',
  category: 'social',
  tags: ['Subscribers', 'Counter', 'Milestone', 'Glass', 'Play'],
  badge: 'New',
  design: { w: 900, h: 500 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 36, widthPercent: 72 },
  fonts: ['montserrat'],

  elements: [
    { key: 'panel', label: 'Panel', hideable: false },
    { key: 'label', label: 'Label' },
    { key: 'count', label: 'Count', hideable: false },
    { key: 'flash', label: 'Milestone flash' },
  ],

  params: [
    { type: 'text',   key: 'label',     label: 'Label',     group: 'Content', default: 'SUBSCRIBERS', maxLength: 24 },
    { type: 'image',  key: 'iconImg',   label: 'Channel icon', group: 'Content', default: '', help: 'Optional — the play badge is drawn when empty.' },
    { type: 'number', key: 'start',     label: 'Start at',  group: 'Content', default: 998000, min: 0, max: 99999999, step: 100 },
    { type: 'number', key: 'end',       label: 'End at',    group: 'Content', default: 1000000, min: 0, max: 99999999, step: 100 },
    { type: 'number', key: 'milestone', label: 'Milestone', group: 'Content', default: 1000000, min: 0, max: 99999999, step: 100 },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'font',  key: 'font',   label: 'Font',   group: 'Style', default: 'montserrat' },

    { type: 'number', key: 'countMs', label: 'Count-up', group: 'Motion', default: 2200, min: 400, max: 4000, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',    group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: air sweep on the swing-in, ONE tick as the count starts rolling,
  // and the chime at the analytically exact milestone crossing — the same inverted-ease
  // millisecond the flash ring uses, so retimed params retime the sound with the motion.
  sfx: (p) => {
    const span = p.end - p.start;
    const hasCross = span > 0 && p.milestone > p.start && p.milestone <= p.end;
    const pStar = hasCross ? (p.milestone - p.start) / span : 1;
    const tCross = 150 + p.countMs * (hasCross ? 1 - Math.pow(1 - pStar, 0.2) : 1);
    return [
      { atMs: p.delay + 60, id: 'whoosh', gain: 0.45 },
      { atMs: p.delay + 150, id: 'tick', gain: 0.4 },
      { atMs: p.delay + Math.round(tCross), id: 'chime', gain: 0.55 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    // Panel entrance: heavy-damped spring rise — a settle, not a bounce.
    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 34, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    // Depth: the panel swings in top-hinged and holds a ±1.8° sway; the label row and the
    // flash ring sit at different parallax depths so the sway shears the layers while the
    // numeral stays glued to the glass.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -80, swayDeg: 1.8 });
    const parLabel = parallax(t, seed, 0.45, height * 0.012);
    const parFlash = parallax(t, seed, 0.8, height * 0.012);

    const span = p.end - p.start;
    const cu = easeOutQuint(clamp01((t - 150) / Math.max(1, p.countMs)));
    const shown = span > 0 ? Math.round(p.start + span * cu) : Math.round(p.end);
    const blur = span > 0 ? (1 - cu) * 8 * (t > 0 ? 1 : 0) : 0;

    // Milestone: invert e = 1-(1-u)^5 at p* to get the exact crossing millisecond.
    const hasCross = span > 0 && p.milestone > p.start && p.milestone <= p.end;
    const pStar = hasCross ? (p.milestone - p.start) / span : 0;
    const tCross = hasCross ? 150 + p.countMs * (1 - Math.pow(1 - pStar, 0.2)) : Infinity;
    const past = hasCross ? t >= tCross : p.milestone > 0 && p.start >= p.milestone;
    const flashU = hasCross ? clamp01((t - tCross) / 700) : 1;
    const glowRamp = past ? (hasCross ? clamp01((t - tCross) / 300) : 1) : 0;

    const fsLabel = Math.round(height * 0.055);
    const fsCount = Math.round(height * 0.22);
    const glyphW = Math.round(fsLabel * 1.5);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...luxePanel(Math.round(height * 0.075)),
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.06).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
          fontFamily: ff,
          overflow: 'hidden',
          ...el('panel'),
        }}
      >
        <div style={{ position: 'absolute', left: width * 0.08, top: height * 0.17, display: 'flex', flexDirection: 'column', gap: height * 0.075 }}>
          {/* Play glyph + tracked label */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: Math.round(width * 0.02),
              transform: `translate(${parLabel.x.toFixed(2)}px, ${parLabel.y.toFixed(2)}px)`,
              ...el('label'),
            }}
          >
            {p.iconImg ? (
              <div style={{ width: glyphW, height: Math.round(glyphW * 0.7), borderRadius: Math.round(glyphW * 0.2), overflow: 'hidden', flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.iconImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ) : (
              <svg viewBox="0 0 40 28" width={glyphW} height={Math.round(glyphW * 0.7)}>
                <rect x="0" y="0" width="40" height="28" rx="8" fill={p.accent} />
                <path d="M16 8l11 6-11 6z" fill="#0B0B0D" />
              </svg>
            )}
            <span style={luxeLabel(fsLabel)}>{p.label}</span>
          </div>

          {/* The numeral */}
          <span
            style={{
              fontSize: fsCount, fontWeight: 700, lineHeight: 1,
              color: past ? p.accent : LUXE.ink,
              letterSpacing: '0.01em', fontVariantNumeric: 'tabular-nums',
              filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
              textShadow: glowRamp > 0 ? luxeGlow(p.accent, glowRamp) : undefined,
              ...el('count'),
            }}
          >
            {group(shown)}
          </span>
        </div>

        {/* One-shot flash ring, expanding from the numeral */}
        {flashU > 0 && flashU < 1 && (
          <div
            style={{
              position: 'absolute', left: width * 0.41, top: height * 0.43,
              width: width * 0.34, height: width * 0.34,
              borderRadius: '50%',
              border: `4px solid ${p.accent}`,
              boxShadow: `0 0 30px ${rgba(p.accent, 0.5)}, inset 0 0 30px ${rgba(p.accent, 0.3)}`,
              transform: `translate(-50%, -50%) translate(${parFlash.x.toFixed(2)}px, ${parFlash.y.toFixed(2)}px) scale(${(0.35 + easeOutQuint(flashU) * 1.5).toFixed(3)})`,
              opacity: (1 - flashU) * 0.85,
              ...el('flash'),
            }}
          />
        )}

        <div style={luxeGrain(0.045)} />
      </div>
    );
  },
});
