// Reference: launch-videos/a-story-about-the-world.mp4  (window 0-9000ms, one card every ~2250ms)
// Full-bleed colour cards that swap, each carrying a short line, with a progress row counting them
// off. The card behind cross-fades while the incoming word scales up from slightly small, so the
// colour change and the word change do not land on the same instant — that offset is what stops it
// reading as a slideshow.
//
// Every card carries its OWN headline scale and vertical anchor, because the reference's do: its
// "beginning" sits centred at a modest size while "OCEANS" is twice as large and pinned low. One
// shared layout for all cards is what made this read as a template rather than as a story.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { sway3d } from '../juice';

const MAX_CARDS = 8;

export const storyCards = defineGraphicsTemplate({
  id: 'story_cards',
  name: 'Story Cards',
  category: 'story',
  tags: ['Story', 'Cards', 'Sequence', 'Serif', 'Chapters', 'Fullscreen', 'Luxury'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 9000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter', 'playfair'],

  elements: [
    { key: 'card',  label: 'Card', hideable: false },
    { key: 'lead',  label: 'Lead-in word' },
    { key: 'word',  label: 'Headline' },
    { key: 'dots',  label: 'Progress dots' },
  ],

  params: [
    { type: 'text', key: 'cards', label: 'Cards', group: 'Content', multiline: true, maxLength: 500,
      default:
        'In the|beginning|#F4F1E8|#141418|0.85|50\n'
        + '|>SILENCE|#0B0B0D|#F4F1E8|0.9|50\n'
        + 'then / came|LIGHT|#F59E0B|#241A07|1|55\n'
        + '|OCEANS|#1A190F|#F59E0B|2|78',
      help: 'One card per line: lead-in | headline | background | text colour | size multiplier '
        + '| vertical position %. Split the lead-in with " / " to stack it as separate lines. '
        + 'Prefix the headline with ">" to type it out with a caret instead of scaling it in.' },
    { type: 'image', key: 'bg1', label: 'Card 1 photo', group: 'Content', default: '', help: 'Optional — the card keeps its colour field when empty.' },
    { type: 'image', key: 'bg2', label: 'Card 2 photo', group: 'Content', default: '', help: 'Optional — the card keeps its colour field when empty.' },
    { type: 'image', key: 'bg3', label: 'Card 3 photo', group: 'Content', default: '', help: 'Optional — the card keeps its colour field when empty.' },
    { type: 'image', key: 'bg4', label: 'Card 4 photo', group: 'Content', default: '', help: 'Optional — the card keeps its colour field when empty.' },
    { type: 'image', key: 'bg5', label: 'Card 5 photo', group: 'Content', default: '', help: 'Optional — the card keeps its colour field when empty.' },
    { type: 'image', key: 'bg6', label: 'Card 6 photo', group: 'Content', default: '', help: 'Optional — the card keeps its colour field when empty.' },
    { type: 'image', key: 'bg7', label: 'Card 7 photo', group: 'Content', default: '', help: 'Optional — the card keeps its colour field when empty.' },
    { type: 'image', key: 'bg8', label: 'Card 8 photo', group: 'Content', default: '', help: 'Optional — the card keeps its colour field when empty.' },

    { type: 'font',   key: 'font',  label: 'Font',    group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',  label: 'Headline size', group: 'Style', default: 116, min: 20, max: 220, step: 4, unit: 'px' },
    { type: 'number', key: 'leadSize', label: 'Lead-in size', group: 'Style', default: 38, min: 8, max: 90, step: 2, unit: 'px' },
    { type: 'boolean', key: 'rule', label: 'Rule above the headline', group: 'Style', default: false },
    { type: 'number', key: 'spread', label: 'Line spread', group: 'Style', default: 34, min: 0, max: 80, step: 2, unit: '%',
      help: 'How far the lead-in sits above the headline. The reference spaces them widely; a tight stack reads as one block.' },
    { type: 'boolean', key: 'dots', label: 'Progress dots', group: 'Style', default: true },

    { type: 'number', key: 'hold',  label: 'Time per card', group: 'Motion', default: 2250, min: 300, max: 6000, step: 50, unit: 'ms' },
    { type: 'number', key: 'fadeMs', label: 'Colour cross-fade', group: 'Motion', default: 420, min: 60, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'wordMs', label: 'Word settle',  group: 'Motion', default: 520, min: 100, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'typeMs', label: 'Typing speed', group: 'Motion', default: 80, min: 20, max: 600, step: 10, unit: 'ms/char',
      help: 'Only affects cards whose headline is prefixed with ">".' },
    { type: 'number', key: 'typeAt', label: 'Typing starts', group: 'Motion', default: 1350, min: 0, max: 4000, step: 50, unit: 'ms',
      help: 'Measured from the start of the card. The reference holds a bare caret for a beat '
        + 'before the first character lands — that pause is the whole effect.' },
  ],

  // Cues fire on the FIRST cycle only — a sweep under card one, an air pass on the first swap,
  // and ONE key thock when a typing card opens its burst. A cue per card ×8 would read as noise.
  sfx: (p) => {
    const lines = p.cards.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_CARDS);
    const typerIdx = lines.findIndex((l) => (l.split('|')[1] ?? '').trim().startsWith('>'));
    return [
      { atMs: 80, id: 'sweep' as const, gain: 0.35 },
      ...(lines.length > 1 ? [{ atMs: p.hold + 60, id: 'whoosh' as const, gain: 0.4 }] : []),
      ...(typerIdx >= 0 ? [{ atMs: typerIdx * p.hold + p.typeAt, id: 'type' as const, gain: 0.45 }] : []),
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const cards = p.cards.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_CARDS)
      .map((l) => {
        const [lead = '', raw = '', bg = '#F4F1E8', ink = '#141418', mul = '1', yPct = '50'] =
          l.split('|').map((s) => s.trim());
        // A ">" prefix marks a card that TYPES rather than scales in — the reference does both and
        // one entrance for all of them flattens the sequence.
        const types = raw.startsWith('>');
        const scale = Number(mul) > 0 ? Number(mul) : 1;
        const y = Number(yPct);
        return { lead, word: types ? raw.slice(1) : raw, bg, ink, types, scale,
          y: Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50 };
      });
    if (!cards.length) return null;

    const i = Math.min(cards.length - 1, Math.floor(timeMs / Math.max(1, p.hold)));
    const within = timeMs - i * p.hold;
    const cur = cards[i];
    const prev = cards[Math.max(0, i - 1)];
    // Optional per-card background photo — card k uses photos[k]; empty keeps the colour field.
    const photos = [p.bg1, p.bg2, p.bg3, p.bg4, p.bg5, p.bg6, p.bg7, p.bg8];
    const curPhoto = photos[i] || '';
    const prevPhoto = photos[Math.max(0, i - 1)] || '';
    const leadLines = cur.lead ? cur.lead.split('/').map((x) => x.trim()).filter(Boolean) : [];

    // Colour cross-fades first; the word settles after. Different curves on purpose.
    const fade = interpolate(within, [0, p.fadeMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    // Characters revealed on a typing card — a floor() of elapsed time, never a CSS animation.
    const typed = Math.max(0, Math.floor((within - p.typeAt) / Math.max(1, p.typeMs)));
    const caretOn = (timeMs % 900) < 470;

    const word = spring({
      frame: fr(within - p.fadeMs * 0.35), fps: FPS,
      config: { damping: 26, mass: 0.7, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(p.wordMs))),
    });

    // DOCU camera: every card gets its own Ken-Burns push — the field grows over the card's
    // hold and CUTS back on the swap (the outgoing layer stays frozen at full push, so the
    // cross-fade reads as a cut between two moving shots). The type block sways in 3D over it.
    const push = 1 + Math.min(1, within / Math.max(1, p.hold)) * 0.045;
    const pose = sway3d(timeMs, seed, 1.1, 5200);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: ff, ...el('card') }}>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${rgba('#ffffff', 0.05)} 0%, ${rgba('#000000', 0.16)} 100%), ${prev.bg}`, transform: 'scale(1.045)' }}>
          {prevPhoto && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={prevPhoto} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {/* Dark scrim so the serif text stays readable over any photo. */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.52) 100%)' }} />
            </>
          )}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${rgba('#ffffff', 0.05)} 0%, ${rgba('#000000', 0.16)} 100%), ${cur.bg}`, opacity: fade, transform: `scale(${push.toFixed(4)})` }}>
          {curPhoto && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={curPhoto} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {/* Dark scrim so the serif text stays readable over any photo. */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.52) 100%)' }} />
            </>
          )}
        </div>

        <div
          style={{
            position: 'absolute', left: '8%', right: '8%', top: `${cur.y}%`,
            transform: `${pose} translateY(-50%)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            // Spread, not a tight stack: in the reference the lead-in sits well above the headline
            // with open space between them, which is most of why our block measured short.
            gap: height * (p.spread / 100) * 0.44,
          }}
        >
          {leadLines.map((line, k) => {
            // Each lead line arrives on its own beat, so a two-line lead reads as a thought
            // being spoken rather than a caption appearing — and racks into focus as it does.
            const leadIn = interpolate(within, [k * 320, k * 320 + 420], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            return (
              <span
                key={k}
                style={{
                  fontSize: p.leadSize, color: rgba(cur.ink, 0.7), lineHeight: 1.2,
                  fontStyle: 'italic', letterSpacing: '0.04em',
                  opacity: clamp01(leadIn * 1.4),
                  filter: (1 - leadIn) * 3 > 0.3 ? `blur(${((1 - leadIn) * 3).toFixed(2)}px)` : undefined,
                  ...el('lead'),
                }}
              >
                {line}
              </span>
            );
          })}

          {p.rule && (
            <div style={{ width: `${(clamp01(word) * 62).toFixed(1)}%`, height: 2, background: rgba(cur.ink, 0.35) }} />
          )}

          <span
            style={{
              fontSize: p.size * cur.scale, fontWeight: 700, color: cur.ink,
              lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap',
              letterSpacing: cur.types ? p.size * cur.scale * 0.12 : undefined,
              opacity: cur.types ? 1 : clamp01(word * 1.5),
              // RACK FOCUS: the headline arrives soft and snaps sharp with its settle — the
              // documentary "this matters". Typing cards keep their caret character instead.
              filter: !cur.types && (1 - clamp01(word)) * 6 > 0.3
                ? `blur(${((1 - clamp01(word)) * 6).toFixed(2)}px)`
                : undefined,
              transform: cur.types ? undefined : `scale(${interpolate(word, [0, 1], [0.88, 1]).toFixed(4)})`,
              ...el('word'),
            }}
          >
            {cur.types ? cur.word.slice(0, typed) : cur.word}
            {cur.types && typed < cur.word.length && <span style={{ opacity: caretOn ? 1 : 0 }}>|</span>}
          </span>
        </div>

        {p.dots && (
          <div
            style={{
              position: 'absolute', left: 0, right: 0, bottom: '5%',
              display: 'flex', justifyContent: 'center', gap: width * 0.028,
              ...el('dots'),
            }}
          >
            {cards.map((c, k) => (
              <span
                key={k}
                style={{
                  width: width * 0.018, height: width * 0.018, borderRadius: '50%',
                  background: rgba(cur.ink, k <= i ? 0.75 : 0.2),
                }}
              />
            ))}
          </div>
        )}

        <div style={luxeVignette(0.35)} />
        <div style={luxeGrain(0.05)} />
      </div>
    );
  },
});
