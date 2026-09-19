// Reference: ui-elements/sticky-notes-animation.mp4  (window 0-6440ms, last note lands ~3920ms)
// Sticky notes drop onto a board one at a time. Each note is independent: it falls with a spring,
// carries its own seeded tilt, and its handwriting wipes on afterwards — so the stack builds up
// rather than appearing at once. The tape strip on each note fades in fractionally before the note
// settles, which is what sells the "stuck down" moment.

import { interpolate, random, spring, Easing } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { depthPose, smear, vel } from '../juice';

/** "Don't forget!|#E8D77E" — text, optional colour. */
function parseNotes(raw: string) {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((l) => {
      const [text = '', colour = ''] = l.split('|').map((s) => s.trim());
      return { text, colour };
    });
}

const FALLBACK = ['#E8D77E', '#E5AFA7', '#A7C4DC', '#B9CDA1', '#CBB3D6', '#E5C39A'];

export const stickyNotes = defineGraphicsTemplate({
  id: 'sticky_notes',
  name: 'Sticky Notes',
  category: 'story',
  tags: ['Notes', 'List', 'Handwritten'],
  design: { w: 620, h: 1080 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 6600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter', 'playfair'],

  elements: [
    { key: 'notes', label: 'Notes', hideable: false },
    { key: 'tape',  label: 'Tape' },
    ...Array.from({ length: 6 }, (_, i) => ({ key: `note${i + 1}`, label: `Note ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'notes', label: 'Notes', group: 'Content', multiline: true, maxLength: 400,
      default: "Don't forget!\nCall Mom ♥\nBuy milk",
      help: 'One per line. Add |#hex for a specific colour.' },

    { type: 'font',   key: 'font',  label: 'Font',        group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',  label: 'Text size',   group: 'Style', default: 42, min: 14, max: 90, step: 2, unit: 'px' },
    { type: 'color',  key: 'ink',   label: 'Ink',         group: 'Style', default: '#3A342B' },
    { type: 'number', key: 'tilt',  label: 'Max tilt',    group: 'Style', default: 4, min: 0, max: 14, step: 0.5, unit: '°' },
    { type: 'number', key: 'overlap', label: 'Overlap',   group: 'Style', default: 12, min: -20, max: 45, step: 1, unit: '%' },
    { type: 'boolean', key: 'showTape', label: 'Tape strips', group: 'Style', default: true },

    { type: 'number', key: 'firstAt', label: 'First note at', group: 'Motion', default: 260, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'stagger', label: 'Note stagger', group: 'Motion', default: 900, min: 150, max: 2500, step: 50, unit: 'ms' },
    { type: 'number', key: 'writeMs', label: 'Handwriting', group: 'Motion', default: 520, min: 0, max: 1600, step: 20, unit: 'ms',
      help: 'How long the text takes to wipe on after its note lands. 0 shows it immediately.' },
  ],

  // PAPER: a page flick as each of the leading notes slaps the board, then a soft pop as the
  // last one sticks — firstAt/stagger retime the cues with the drops.
  sfx: (p) => {
    const n = Math.max(1, p.notes.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6).length);
    return [
      ...Array.from({ length: Math.min(3, n - 1) }, (_, i) => ({
        atMs: p.firstAt + i * p.stagger + 220,
        id: 'paper' as const,
        gain: 0.45,
      })),
      { atMs: p.firstAt + (n - 1) * p.stagger + 240, id: 'pop' as const, gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, seed, width, height }) => {
    const notes = parseNotes(p.notes);
    if (!notes.length) return null;

    const ff = fontStack(p.font);
    const n = notes.length;
    // Notes are square-ish and overlap slightly, like a real stack pinned down the board. Size them
    // off the run so the stack fills the board top to bottom however many notes there are.
    const lap = 1 - p.overlap / 100;
    const noteSize = Math.min(width * 0.82, (height * 0.94) / (1 + (n - 1) * lap));
    const step = noteSize * lap;
    const top0 = (height - (noteSize + (n - 1) * step)) / 2;

    return (
      <div style={{ position: 'absolute', inset: 0, ...el('notes') }}>
        {notes.map((note, i) => {
          const at = p.firstAt + i * p.stagger;
          const sAt = (ms: number) => spring({
            frame: fr(ms - at), fps: FPS,
            config: { damping: 17, mass: 0.8, stiffness: 150 },
            durationInFrames: Math.max(1, Math.round(fr(520))),
          });
          const s = sAt(timeMs);
          // Each note is SLAPPED onto the board through 3D space — a seeded hinge per note (so
          // the stack builds as objects, not divs) plus a faint resting sway that keeps the
          // board alive after the last one lands. Fall velocity smears the note in flight.
          const pose = depthPose(timeMs, `${seed}p${i}`, {
            enter: s,
            rx: -(11 + random(`${seed}rx${i}`) * 7),
            ry: (random(`${seed}ry${i}`) - 0.5) * 12,
            z: -70,
            swayDeg: 0.8,
          });
          const vNote = vel((ms) => (1 - sAt(ms)) * noteSize * 0.5, timeMs);
          const smNote = smear(0, vNote, 1.1);
          // Seeded so the scatter is identical in the preview and every export frame.
          const tilt = (random(`${seed}n${i}`) - 0.5) * 2 * p.tilt;
          const dx = (random(`${seed}x${i}`) - 0.5) * width * 0.06;
          const colour = note.colour || FALLBACK[i % FALLBACK.length];
          // Handwriting wipes on left-to-right once the note has landed.
          const write = p.writeMs <= 0 ? 1 : interpolate(timeMs - at - 260, [0, p.writeMs], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
          });

          return (
            <div
              key={`${note.text}-${i}`}
              style={{
                position: 'absolute',
                left: (width - noteSize) / 2 + dx,
                top: top0 + i * step,
                width: noteSize, height: noteSize,
                background: `linear-gradient(180deg, ${rgba('#ffffff', 0.28)} 0%, ${rgba('#000000', 0.04)} 100%), ${colour}`,
                border: `1px solid ${rgba('#000000', 0.06)}`,
                boxShadow: `0 ${Math.round(noteSize * 0.015)}px ${Math.round(noteSize * 0.04)}px ${rgba('#000000', 0.14)}, 0 ${Math.round(noteSize * 0.05)}px ${Math.round(noteSize * 0.12)}px ${rgba('#000000', 0.2)}`,
                opacity: interpolate(s, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
                filter: smNote.blurPx > 0.3 ? `blur(${smNote.blurPx.toFixed(2)}px)` : undefined,
                transform:
                  `${pose} translateY(${((1 - s) * noteSize * 0.5).toFixed(3)}px) ` +
                  `rotate(${(tilt * s).toFixed(3)}deg) ` +
                  `scale(${(interpolate(s, [0, 1], [0.9, 1]) * smNote.sx).toFixed(4)}, ${(interpolate(s, [0, 1], [0.9, 1]) * smNote.sy).toFixed(4)})`,
                transformOrigin: 'center top',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
                padding: noteSize * 0.14, boxSizing: 'border-box',
                ...el(`note${i + 1}`),
              }}
            >
              {p.showTape && (
                <div
                  style={{
                    position: 'absolute', top: -noteSize * 0.035, left: '50%',
                    width: noteSize * 0.3, height: noteSize * 0.09,
                    marginLeft: -noteSize * 0.15,
                    background: rgba('#ffffff', 0.5),
                    border: `1px solid ${rgba('#000000', 0.04)}`,
                    boxShadow: `0 1px 3px ${rgba('#000000', 0.08)}`,
                    transform: `rotate(${(-tilt * 0.7).toFixed(2)}deg)`,
                    opacity: interpolate(s, [0.25, 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                    ...el('tape'),
                  }}
                />
              )}
              <span
                style={{
                  fontSize: p.size, color: p.ink, fontFamily: ff, lineHeight: 1.25,
                  fontStyle: 'italic',
                  // Wipe rather than fade: closer to how the reference draws the handwriting on.
                  clipPath: `inset(0 ${((1 - write) * 100).toFixed(2)}% 0 0)`,
                }}
              >
                {note.text}
              </span>
            </div>
          );
        })}
      </div>
    );
  },
});
