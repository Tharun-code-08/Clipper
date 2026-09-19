// Reference: launch-videos/storytime.mp4  (window 0-9000ms, one beat every ~1400ms)
// A vignette with a chapter mark, then narration arriving one beat at a time. Earlier beats stay
// and dim rather than leaving, so by the end the whole thought is on screen — which is what makes
// it read as a story rather than a sequence of unrelated cards.
//
// Beats can carry an emphasis: *phrase* inside a beat gets the accent colour.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { sway3d } from '../juice';

const MAX_BEATS = 8;

export const storyBeats = defineGraphicsTemplate({
  id: 'story_beats',
  name: 'Story Beats',
  category: 'story',
  tags: ['Story', 'Narration', 'Sequence', 'Luxury'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 9000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'scene',   label: 'Scene', hideable: false },
    { key: 'chapter', label: 'Chapter mark' },
    { key: 'beats',   label: 'Narration' },
    ...Array.from({ length: MAX_BEATS }, (_, i) => ({ key: `beat${i + 1}`, label: `Beat ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'chapter', label: 'Chapter', group: 'Content', default: 'DAY 5', maxLength: 24 },
    { type: 'text', key: 'beats',   label: 'Beats',   group: 'Content', multiline: true, maxLength: 500,
      default:
        'One thought keeps coming back...\n'
        + '"What will people think?"\n'
        + 'Some will say — *it\'s a waste of time.*\n'
        + 'Others will say — *just quit it.*\n'
        + 'A few will say — *they\'ll laugh when they see it.*\n'
        + 'But the truth is —',
      help: 'One beat per line. Wrap a phrase in *asterisks* to accent it.' },

    { type: 'color',  key: 'bg',     label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#C9C5B8' },
    { type: 'color',  key: 'accent', label: 'Accent',     group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',   label: 'Beat size',  group: 'Style', default: 60, min: 10, max: 80, step: 1, unit: 'px' },
    { type: 'number', key: 'chapterSize', label: 'Chapter size', group: 'Style', default: 150, min: 12, max: 180, step: 2, unit: 'px' },
    { type: 'number', key: 'lineGap', label: 'Beat gap',  group: 'Style', default: 26, min: 0, max: 90, step: 2, unit: 'px' },
    { type: 'number', key: 'bloom',  label: 'Bloom',      group: 'Style', default: 0.3, min: 0, max: 1, step: 0.05,
      help: 'Soft halo around the type, the way a film transfer blooms.' },
    { type: 'number', key: 'dim',    label: 'Older beats fade to', group: 'Style', default: 0.4, min: 0.05, max: 1, step: 0.05 },
    { type: 'boolean', key: 'fill',  label: 'Paint the background', group: 'Style', default: true },
    { type: 'boolean', key: 'vignette', label: 'Vignette', group: 'Style', default: true },

    { type: 'number', key: 'chapterMs', label: 'Chapter holds', group: 'Motion', default: 1500, min: 0, max: 5000, step: 50, unit: 'ms' },
    { type: 'number', key: 'perBeat',   label: 'Time per beat', group: 'Motion', default: 1300, min: 200, max: 5000, step: 50, unit: 'ms' },
  ],

  // DOCU whispers: a long airy sweep under the chapter mark, then a luxe ping as the first two
  // beats land — gains stay low; the narration carries this template, the cues only underline it.
  sfx: (p) => [
    { atMs: 80, id: 'sweep', gain: 0.4 },
    { atMs: p.chapterMs + 180, id: 'glass', gain: 0.35 },
    { atMs: p.chapterMs + p.perBeat + 180, id: 'glass', gain: 0.28 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const beats = p.beats.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_BEATS);

    // DOCU camera: a slow Ken-Burns push over the whole window plus a faint 3D sway on the
    // TYPE only (the black field is the camera; swaying the frame itself would read as broken).
    const push = 1 + Math.min(1, timeMs / Math.max(1, durationMs)) * 0.04;
    const pose = sway3d(timeMs, seed, 1.2, 5200);

    const chapterIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 26, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    // The chapter mark must be GONE by the time beat one lands, not fading through it.
    const chapterOut = interpolate(timeMs, [Math.max(0, p.chapterMs - 340), p.chapterMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const beatsIn = interpolate(timeMs, [p.chapterMs, p.chapterMs + 200], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const glowY = interpolate(timeMs, [0, p.chapterMs, p.chapterMs + 2 * p.perBeat], [13, 15, 22], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? `linear-gradient(180deg, ${rgba('#ffffff', 0.02)} 0%, ${rgba('#000000', 0.4)} 100%), ${p.bg}` : 'transparent',
          fontFamily: ff,
          ...el('scene'),
        }}
      >
        {p.vignette && (
          <div
            style={{
              position: 'absolute', inset: 0,
              // The pool of light opens up as the story fills, so the frame breathes with the beats
              // instead of sitting in one fixed puddle.
              background: `radial-gradient(38% ${glowY.toFixed(1)}% at 50% 50%, ${rgba('#F4F1E8', 0.095)} 0%, ${rgba('#F4F1E8', 0.085)} 70%, ${rgba('#000000', 0)} 100%)`,
              transform: `scale(${push.toFixed(4)})`,
            }}
          />
        )}

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: '42%',
            textAlign: 'center',
            fontSize: p.chapterSize, fontWeight: 700, color: p.accent,
            letterSpacing: p.chapterSize * 0.14, textTransform: 'uppercase',
            textShadow: p.bloom > 0
              ? `0 0 ${p.chapterSize * 0.3}px ${rgba(p.accent, p.bloom * 1.4)}, 0 0 ${p.chapterSize * 0.9}px ${rgba(p.accent, p.bloom)}`
              : 'none',
            opacity: clamp01(chapterIn) * (1 - chapterOut),
            // RACK FOCUS: the mark arrives soft and snaps sharp (documentary "this matters"),
            // then defocuses again as it hands off to the narration. Sharp whenever at rest.
            filter: ((1 - clamp01(chapterIn)) * 7 + chapterOut * 5) > 0.3
              ? `blur(${((1 - clamp01(chapterIn)) * 7 + chapterOut * 5).toFixed(2)}px)`
              : undefined,
            transform: `translateY(${(-chapterOut * height * 0.03).toFixed(2)}px) scale(${push.toFixed(4)})`,
            ...el('chapter'),
          }}
        >
          {p.chapter}
        </div>

        <div
          style={{
            // Bottom-anchored: the newest beat always lands on the same line and the older ones ride
            // up and out. Centring the whole stack would sink the live beat as the story grew.
            position: 'absolute', left: '9%', right: '9%', bottom: '32%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
            gap: p.lineGap,
            opacity: beatsIn,
            transform: `${pose} scale(${push.toFixed(4)})`,
            ...el('beats'),
          }}
        >
          {beats.map((raw, i) => {
            const at = p.chapterMs + i * p.perBeat;
            // Nothing exists before its beat: the stack is bottom-anchored, so an unmounted future
            // beat would otherwise hold the live one up off the line.
            if (timeMs < at) return null;
            const s = spring({
              frame: fr(timeMs - at), fps: FPS,
              config: { damping: 26, mass: 0.7, stiffness: 165 },
              durationInFrames: Math.max(1, Math.round(fr(520))),
            });
            // Older beats stay and recede, then let go entirely so the live pair keeps its size.
            const ageF = (timeMs - p.chapterMs) / Math.max(1, p.perBeat) - i;
            const strength = interpolate(ageF, [0, 0.85, 1.9, 2.5], [1, 1, p.dim, 0], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            const parts = raw.split(/(\*[^*]+\*)/).filter(Boolean);
            // Estimated wrapped height, used to slide the beat up into place instead of snapping the
            // whole stack the frame it mounts.
            const perLine = Math.max(8, (width * 0.82) / (p.size * 0.5));
            const estH = Math.ceil(raw.length / perLine) * p.size * 1.4 + p.lineGap;
            return (
              <div
                key={i}
                style={{
                  marginTop: -estH * (1 - clamp01(s)),
                  fontSize: p.size, lineHeight: 1.4, textAlign: 'center',
                  textShadow: p.bloom > 0 ? `0 0 ${p.size * 1.4}px ${rgba(p.accent, p.bloom * 0.9)}` : 'none',
                  opacity: clamp01(s * 1.6) * strength,
                  // Each beat RACKS into focus as it lands — blur is entrance-only, sharp at rest.
                  filter: (1 - clamp01(s)) * 5 > 0.3 ? `blur(${((1 - clamp01(s)) * 5).toFixed(2)}px)` : undefined,
                  transform: `translateY(${((1 - s) * width * 0.014).toFixed(2)}px)`,
                  ...el(`beat${i + 1}`),
                }}
              >
                {parts.map((part, k) => {
                  const acc = part.startsWith('*') && part.endsWith('*') && part.length > 2;
                  return (
                    <span
                      key={k}
                      style={{
                        color: acc ? p.accent : p.ink,
                        fontWeight: acc ? 700 : 400,
                      }}
                    >
                      {acc ? part.slice(1, -1) : part}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>

        {p.fill && <div style={luxeVignette(0.45)} />}
        {p.fill && <div style={luxeGrain(0.05)} />}
      </div>
    );
  },
});
