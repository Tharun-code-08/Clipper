// Reference: social/naval-quote.mp4  (window 1080-3280ms, text lands ~2520ms)
// A post card whose body WRITES ITSELF word by word. The reference does something subtler than a
// plain fade: words appear grey and settle to full ink a beat later, so the text has a leading
// edge — and the card grows to fit as lines arrive.
//
// The word index is floor(elapsed / perWord), a pure function of timeMs. Any typewriter built on
// a timer or CSS steps() renders as a single frozen frame on export.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax } from '../juice';

export const quoteCard = defineGraphicsTemplate({
  id: 'quote_card',
  name: 'Quote Card',
  category: 'social',
  tags: ['Tweet', 'Quote', 'Typing'],
  design: { w: 660, h: 760 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 46, widthPercent: 78 },
  fonts: ['inter'],

  elements: [
    { key: 'card',   label: 'Card', hideable: false },
    { key: 'author', label: 'Author row' },
    { key: 'body',   label: 'Quote' },
  ],

  params: [
    { type: 'text',  key: 'name',   label: 'Name',   group: 'Content', default: 'Naval', maxLength: 30 },
    { type: 'text',  key: 'handle', label: 'Handle', group: 'Content', default: '@naval', maxLength: 30 },
    { type: 'image', key: 'avatar', label: 'Avatar', group: 'Content', default: '' },
    { type: 'text',  key: 'quote',  label: 'Quote',  group: 'Content', multiline: true, maxLength: 300,
      default: 'AI is the great automator, and to\nautomate, it must first imitate.\n\nThe imitation fools people into thinking' },
    { type: 'boolean', key: 'verified', label: 'Verified tick', group: 'Content', default: true },
    { type: 'number',  key: 'highlight', label: 'Highlight last N words', group: 'Content', default: 1, min: 0, max: 8, step: 1 },

    { type: 'color',  key: 'card',   label: 'Card',      group: 'Style', default: '#FDFCFA' },
    { type: 'color',  key: 'ink',    label: 'Text',      group: 'Style', default: '#15161a' },
    { type: 'color',  key: 'accent', label: 'Highlight', group: 'Style', default: '#1d9bf0' },
    { type: 'font',   key: 'font',   label: 'Font',      group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',   label: 'Quote size', group: 'Style', default: 46, min: 12, max: 80, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',    group: 'Style', default: 30, min: 0, max: 70, step: 2, unit: 'px' },

    { type: 'number', key: 'startAt',  label: 'Start typing at', group: 'Motion', default: 40, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'perWord',  label: 'Per word',        group: 'Motion', default: 105, min: 20, max: 500, step: 5, unit: 'ms' },
  ],

  // A soft pop as the card lands, then ONE typewriter tick as the words start writing —
  // retiming startAt retimes the tick with the leading edge.
  sfx: (p) => [
    { atMs: 80, id: 'pop', gain: 0.4 },
    { atMs: p.startAt + 160, id: 'tick', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    // Keep each word's trailing whitespace so the author's own line breaks survive the reveal —
    // the reference quote is a tweet with hard breaks and a blank line, not one wrapped paragraph.
    const chunks = p.quote.match(/\S+\s*/g) ?? [];
    const words = chunks.map((c) => c.replace(/\s+$/, ''));

    const cardIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 135 },
      durationInFrames: Math.max(1, Math.round(fr(380))),
    });
    const authorIn = spring({
      frame: fr(timeMs - 200), fps: FPS,
      config: { damping: 26, mass: 0.55, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(320))),
    });

    const pad = width * 0.045;
    const av = width * 0.10;
    const fsName = Math.round(width * 0.044);
    const fsHandle = Math.round(width * 0.038);

    // DEPTH: the card swings in top-hinged on its existing entrance ramp and rests with a
    // whisper of sway (a tweet card is quiet, not showy); author row and body sit at shallow
    // parallax depths so the sway shears them while the words write themselves.
    const pose = depthPose(timeMs, seed, { enter: cardIn, rx: -10, z: -60, swayDeg: 1.1, periodMs: 4400 });
    const parAuthor = parallax(timeMs, seed, 0.35, width * 0.008, 4400);

    // The reference dumps a burst of words in the first beat then eases into the last few, so the
    // leading edge is a decelerating ramp rather than a metronome.
    const span = Math.max(1, p.perWord * words.length);
    const lead = interpolate(
      timeMs - p.startAt,
      [0, span * 0.118, span * 0.444, span * 0.794],
      [0, 0.611, 0.833, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    ) * words.length;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.card, borderRadius: p.radius,
          padding: pad, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: height * 0.02,
          fontFamily: ff,
          boxShadow: `0 0 0 1px ${rgba('#000000', 0.04)}, 0 ${(height * 0.012).toFixed(1)}px ${(height * 0.035).toFixed(1)}px ${rgba('#000000', 0.06)}, 0 ${(height * 0.05).toFixed(1)}px ${(height * 0.12).toFixed(1)}px ${rgba('#000000', 0.1)}`,
          opacity: interpolate(cardIn, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `${pose} scale(${interpolate(cardIn, [0, 1], [0.96, 1]).toFixed(4)})`,
          transformOrigin: '50% 35%',
          ...el('card'),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: width * 0.025, opacity: interpolate(authorIn, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }), transform: `translate(${parAuthor.x.toFixed(2)}px, ${(parAuthor.y + (1 - authorIn) * height * 0.02).toFixed(2)}px)`, ...el('author') }}>
          <div style={{ width: av, height: av, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: rgba(p.ink, 0.1), display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            {p.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width={av * 0.68} height={av * 0.68} viewBox="0 0 24 24" fill={rgba(p.ink, 0.32)} aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
              </svg>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: width * 0.01, fontSize: fsName, fontWeight: 700, color: p.ink, lineHeight: 1.2 }}>
              {p.name}
              {p.verified && (
                <svg width={fsName * 0.85} height={fsName * 0.85} viewBox="0 0 24 24" fill={p.accent} aria-hidden="true">
                  <path d="M12 1.6 14.5 4l3.4-.3.9 3.3 3 1.6-1.4 3.1 1.4 3.1-3 1.6-.9 3.3-3.4-.3L12 22.4 9.5 20l-3.4.3-.9-3.3-3-1.6L3.6 12 2.2 8.9l3-1.6.9-3.3L9.5 4z" />
                  <path d="M7.6 12.2 10.4 15l6-6" fill="none" stroke={p.card} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span style={{ fontSize: fsHandle, color: rgba(p.ink, 0.5), lineHeight: 1.2 }}>{p.handle}</span>
          </div>
        </div>

        {/* Body: words arrive one at a time, each settling from grey to full ink. */}
        <div style={{ fontSize: p.size, lineHeight: 1.8, color: p.ink, whiteSpace: 'pre-wrap', ...el('body') }}>
          {words.map((w, i) => {
            // Two ramps: appear, then darken. The offset between them is the "leading edge".
            const show = clamp01((lead - i) * 2.2);
            const settle = clamp01((lead - i - 0.5) * 0.55);
            const isHi = p.highlight > 0 && i >= words.length - p.highlight;
            return (
              <span
                key={i}
                style={{
                  opacity: show,
                  color: isHi ? p.accent : rgba(p.ink, 0.38 + 0.62 * settle),
                  background: isHi ? rgba(p.accent, 0.12 * settle) : undefined,
                  borderRadius: isHi ? p.size * 0.16 : undefined,
                  padding: isHi ? `0 ${p.size * 0.1}px` : undefined,
                }}
              >
                {chunks[i]}
              </span>
            );
          })}
        </div>
      </div>
    );
  },
});
