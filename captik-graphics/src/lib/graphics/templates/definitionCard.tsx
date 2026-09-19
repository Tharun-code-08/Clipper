// Dictionary-entry card — Playfair headword, dim italic phonetic, amber part-of-speech chip,
// then the definition TYPES on line by line. Craft: per-line type duration scales with the
// line's character count (short lines don't crawl, long ones don't blur past), and the
// highlighter is an inline child of the word span, so it inherits exact text metrics.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, clamp01, fr, inkOn, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, smear, vel } from '../juice';

/** Non-breaking space — holds a typed line's height before its first character lands. */
const NBSP = ' ';

export const definitionCard = defineGraphicsTemplate({
  id: 'definition_card',
  name: 'Definition Card',
  category: 'story',
  tags: ['Dictionary', 'Definition', 'Word', 'Highlighter', 'Card'],
  badge: 'New',
  design: { w: 900, h: 620 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 60 },
  fonts: ['playfair', 'montserrat'],

  elements: [
    { key: 'card',       label: 'Card', hideable: false },
    { key: 'word',       label: 'Word', hideable: false },
    { key: 'highlight',  label: 'Highlighter' },
    { key: 'phonetic',   label: 'Phonetic' },
    { key: 'pos',        label: 'Part of speech' },
    { key: 'definition', label: 'Definition', hideable: false },
  ],

  params: [
    { type: 'text', key: 'word',     label: 'Word',     group: 'Content', default: 'Compounding', maxLength: 24 },
    { type: 'text', key: 'phonetic', label: 'Phonetic', group: 'Content', default: '/kəmˈpaʊndɪŋ/', maxLength: 28 },
    { type: 'text', key: 'pos',      label: 'Part of speech', group: 'Content', default: 'noun', maxLength: 16 },
    { type: 'text', key: 'definition', label: 'Definition', group: 'Content', multiline: true, maxLength: 180,
      default: 'Growth that feeds on its own results.\nSmall gains, repeated, become unreasonable.' },

    { type: 'color', key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER language: page flick as the card lands, pop for the part-of-speech chip, a light
  // pass as the highlighter sweeps the headword, ONE typewriter tick as the definition
  // starts typing (chip 780, sweep 1000, typing 1500 — same beats as the render).
  sfx: (p) => [
    { atMs: p.delay + 260, id: 'paper', gain: 0.5 },
    { atMs: p.delay + 880, id: 'pop', gain: 0.45 },
    { atMs: p.delay + 1050, id: 'swish', gain: 0.5 },
    { atMs: p.delay + 1520, id: 'tick', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2.4;

    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });
    const enter = enterAt(t);
    // The card is TOSSED onto the desk — casual paper hinge in, then a small resting sway so
    // the pose never dies. Its own descent velocity smears it; blur + stretch die on landing.
    const pose = depthPose(t, seed, { enter, rx: -13, ry: 5, z: -85, swayDeg: 1.1 });
    const yAt = (ms: number) => (1 - enterAt(ms)) * height * 0.07;
    const sm = smear(0, vel(yAt, t), 1);
    const wordIn = spring({
      frame: fr(t - 260), fps: FPS,
      config: { damping: 22, mass: 0.75, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(540))),
    });
    const metaIn = easeOutQuint(clamp01((t - 620) / 420));
    const chipPop = spring({
      frame: fr(t - 780), fps: FPS,
      config: { damping: 16, mass: 0.6, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    // The highlighter waits for the word's spring to settle, then sweeps once.
    const sweep = easeOutQuint(clamp01((t - 1000) / 520));

    const fsWord = Math.round(height * 0.15);
    const fsPhon = Math.round(height * 0.05);
    const fsChip = Math.round(height * 0.036);
    const fsDef = Math.round(height * 0.056);

    // Typing schedule: each line's duration follows its length; lines run back to back.
    const lines = p.definition.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    let cursor = 1500;
    const typed = lines.map((line) => {
      const dur = clamp(line.length * 26, 320, 1050);
      const start = cursor;
      cursor += dur + 160;
      return { line, start, dur };
    });
    const caretOn = Math.sin((t / 1000) * Math.PI * 2 * 2.4) > 0;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 24,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
          transform:
            `${pose} translateY(${yAt(t).toFixed(2)}px) ` +
            `rotate(${(tilt + (1 - enter) * 1.8).toFixed(3)}deg) ` +
            `scale(${sm.sx.toFixed(4)}, ${sm.sy.toFixed(4)})`,
          fontFamily: ff,
          padding: `${Math.round(height * 0.085)}px ${Math.round(width * 0.075)}px`,
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          overflow: 'hidden',
          ...el('card'),
        }}
      >
        <span
          style={{
            position: 'relative', display: 'inline-block',
            fontFamily: fontStack('playfair'), fontSize: fsWord, fontWeight: 700,
            color: p.ink, lineHeight: 1.06, letterSpacing: '-0.01em',
            padding: '0 0.08em', margin: '0 -0.08em',
            opacity: interpolate(wordIn, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
            // Rack focus: the headword arrives soft and sharpens as it settles — dictionary
            // language for "this word matters". Dead crisp at rest.
            filter: (1 - Math.min(1, wordIn)) * 4 > 0.3 ? `blur(${((1 - Math.min(1, wordIn)) * 4).toFixed(2)}px)` : undefined,
            transform: `translateY(${((1 - wordIn) * height * 0.05).toFixed(2)}px)`,
            ...el('word'),
          }}
        >
          {/* Both spans are positioned, so DOM order paints the rect BEHIND the letters. */}
          <span
            style={{
              position: 'absolute', inset: '14% -1% 2%',
              background: rgba(p.accent, 0.38),
              borderRadius: fsWord * 0.1,
              transform: `skewX(-2deg) scaleX(${sweep.toFixed(4)})`,
              transformOrigin: 'left center',
              ...el('highlight'),
            }}
          />
          <span style={{ position: 'relative' }}>{p.word}</span>
        </span>

        <div
          style={{
            alignSelf: 'stretch',
            display: 'flex', alignItems: 'center', gap: width * 0.03,
            marginTop: height * 0.04,
            paddingBottom: height * 0.05,
            borderBottom: `2px dashed ${rgba(p.ink, 0.16)}`,
            opacity: metaIn,
            transform: `translateY(${((1 - metaIn) * height * 0.02).toFixed(2)}px)`,
          }}
        >
          <span
            style={{
              fontSize: fsPhon, fontWeight: 600, fontStyle: 'italic',
              color: rgba(p.ink, 0.5), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              ...el('phonetic'),
            }}
          >
            {p.phonetic}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontSize: fsChip, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: inkOn(p.accent), background: p.accent,
              borderRadius: 999,
              padding: `${Math.round(height * 0.013)}px ${Math.round(height * 0.034)}px`,
              boxShadow: `0 4px 14px ${rgba(p.accent, 0.35)}`,
              transform: `scale(${chipPop.toFixed(4)})`,
              ...el('pos'),
            }}
          >
            {p.pos}
          </span>
        </div>

        <div
          style={{
            marginTop: height * 0.055,
            fontSize: fsDef, fontWeight: 600, color: rgba(p.ink, 0.78), lineHeight: 1.52,
            ...el('definition'),
          }}
        >
          {typed.map((m, i) => {
            const prog = clamp01((t - m.start) / m.dur);
            const n = Math.min(m.line.length, Math.ceil(prog * m.line.length));
            const typing = prog > 0 && prog < 1;
            return (
              <div key={i} style={{ opacity: clamp01((t - m.start) / 160) }}>
                {n > 0 ? m.line.slice(0, n) : NBSP}
                {typing && (
                  <span style={{ color: p.accent, opacity: caretOn ? 1 : 0.15 }}>{'▍'}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
