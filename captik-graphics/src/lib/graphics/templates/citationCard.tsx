// An academic "receipt" — tracked journal masthead with a year pill, then a Playfair claim
// whose key phrase gets a highlighter swept across it. The highlighted phrase is its OWN
// param rendered as its own inline-block, so the translucent amber rect inherits the exact
// text metrics — no guessing at where the words land.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, smear, vel } from '../juice';

export const citationCard = defineGraphicsTemplate({
  id: 'citation_card',
  name: 'Study Citation',
  category: 'story',
  tags: ['Citation', 'Study', 'Highlighter', 'Journal', 'Quote'],
  badge: 'New',
  design: { w: 900, h: 520 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 66 },
  fonts: ['playfair', 'montserrat'],

  elements: [
    { key: 'card',      label: 'Card', hideable: false },
    { key: 'label',     label: 'Journal row' },
    { key: 'quote',     label: 'Quote', hideable: false },
    { key: 'highlight', label: 'Highlighter' },
  ],

  params: [
    { type: 'text', key: 'journal', label: 'Journal', group: 'Content', default: 'JOURNAL OF APPLIED PSYCHOLOGY', maxLength: 40 },
    { type: 'text', key: 'year',    label: 'Year',    group: 'Content', default: '2019', maxLength: 8 },
    { type: 'text', key: 'pre',     label: 'Quote — before', group: 'Content', default: 'People who wrote their goals were', maxLength: 80 },
    { type: 'text', key: 'phrase',  label: 'Highlighted phrase', group: 'Content', default: '42% more likely', maxLength: 40 },
    { type: 'text', key: 'post',    label: 'Quote — after', group: 'Content', default: 'to achieve them', maxLength: 80 },

    { type: 'color', key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER language: a page flick as the receipt lands, a glossy pop for the year pill, a
  // fast light pass as the highlighter sweeps (sweep starts at 1400 in the render).
  sfx: (p) => [
    { atMs: p.delay + 260, id: 'paper', gain: 0.5 },
    { atMs: p.delay + 560, id: 'pop', gain: 0.45 },
    { atMs: p.delay + 1450, id: 'swish', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2;

    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });
    const enter = enterAt(t);
    // The receipt is TOSSED onto the desk: a casual paper hinge in, then a small resting sway
    // so the card never flattens back into a web page. Its descent's own velocity smears it —
    // blur + stretch die the instant it lands.
    const pose = depthPose(t, seed, { enter, rx: -12, ry: -6, z: -80, swayDeg: 1.1 });
    const yAt = (ms: number) => (1 - enterAt(ms)) * height * 0.08;
    const sm = smear(0, vel(yAt, t), 1);
    const labelIn = easeOutQuint(clamp01((t - 300) / 420));
    const pillPop = spring({
      frame: fr(t - 460), fps: FPS,
      config: { damping: 15, mass: 0.6, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const quoteIn = spring({
      frame: fr(t - 560), fps: FPS,
      config: { damping: 23, mass: 0.75, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    // The highlighter waits for the sentence to be readable, then sweeps once.
    const sweep = easeOutQuint(clamp01((t - 1400) / 540));

    const fsLabel = Math.round(height * 0.042);
    const fsPill = Math.round(height * 0.038);
    const fsQuote = Math.round(height * 0.088);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 22,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
          transform:
            `${pose} translateY(${yAt(t).toFixed(2)}px) ` +
            `rotate(${(tilt + (1 - enter) * 1.6).toFixed(3)}deg) ` +
            `scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
          fontFamily: fontStack('montserrat'),
          padding: `${Math.round(height * 0.095)}px ${Math.round(width * 0.075)}px`,
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          ...el('card'),
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: width * 0.025,
            paddingBottom: height * 0.055,
            borderBottom: `2px dashed ${rgba(p.ink, 0.16)}`,
            opacity: labelIn,
            transform: `translateY(${((1 - labelIn) * height * 0.02).toFixed(2)}px)`,
            ...el('label'),
          }}
        >
          <span
            style={{
              fontSize: fsLabel, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: rgba(p.ink, 0.55), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {p.journal}
          </span>
          <span
            style={{
              marginLeft: 'auto', flexShrink: 0,
              fontSize: fsPill, fontWeight: 700, letterSpacing: '0.06em',
              color: inkOn(p.accent), background: p.accent,
              borderRadius: 999,
              padding: `${Math.round(height * 0.014)}px ${Math.round(height * 0.036)}px`,
              boxShadow: `0 4px 14px ${rgba(p.accent, 0.35)}`,
              transform: `scale(${pillPop.toFixed(4)})`,
            }}
          >
            {p.year}
          </span>
        </div>

        <div
          style={{
            marginTop: height * 0.075,
            fontFamily: fontStack('playfair'), fontSize: fsQuote, fontWeight: 500,
            color: p.ink, lineHeight: 1.38,
            opacity: interpolate(quoteIn, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
            transform: `translateY(${((1 - quoteIn) * height * 0.05).toFixed(2)}px)`,
            ...el('quote'),
          }}
        >
          <span>&ldquo;{p.pre}{p.pre ? ' ' : ''}</span>
          <span style={{ position: 'relative', display: 'inline-block', padding: '0 0.12em', margin: '0 -0.04em' }}>
            {/* Both spans are positioned, so DOM order paints the rect BEHIND the words. */}
            <span
              style={{
                position: 'absolute', inset: '8% -2% 0%',
                background: rgba(p.accent, 0.38),
                borderRadius: fsQuote * 0.1,
                transform: `skewX(-2deg) scaleX(${sweep.toFixed(4)})`,
                transformOrigin: 'left center',
                ...el('highlight'),
              }}
            />
            <span style={{ position: 'relative' }}>{p.phrase}</span>
          </span>
          <span>{p.post ? ' ' : ''}{p.post}&rdquo;</span>
        </div>
      </div>
    );
  },
});
