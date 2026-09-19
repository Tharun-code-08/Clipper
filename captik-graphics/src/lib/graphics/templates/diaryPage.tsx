// Reference: ui-elements/writing-diary-1.mp4  (window 640-7720ms, page full ~6520ms)
// A sheet of paper filling itself with paragraphs, one line at a time, some phrases underlined as
// they land. Revealing per LINE rather than per character is what the reference actually does, and
// it keeps a long page readable instead of turning it into a typewriter.
//
// Each line is clipped by its own mask and slides up into view, so the ink appears to be laid down
// rather than faded on.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose } from '../juice';

const MAX_LINES = 14;
/** _underlined_ marks a phrase the reference draws a rule beneath. */
const MARK = /_([^_]+)_/g;

export const diaryPage = defineGraphicsTemplate({
  id: 'diary_page',
  name: 'Diary Page',
  category: 'story',
  tags: ['Paper', 'Writing', 'Document'],
  design: { w: 760, h: 1040 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 7200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 66 },
  fonts: ['inter', 'playfair'],

  elements: [
    { key: 'page',  label: 'Page', hideable: false },
    ...Array.from({ length: MAX_LINES }, (_, i) => ({ key: `line${i + 1}`, label: `Line ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'body', label: 'Text', group: 'Content', multiline: true, maxLength: 700,
      default:
        'Lorem ipsum dolor sit amet, consectetur\n'
        + 'adipiscing elit. Sed do eiusmod tempor\n'
        + 'incididunt ut labore et dolore magna aliqua.\n\n'
        + 'Ut enim ad minim veniam, quis nostrud\n'
        + 'exercitation ullamco laboris nisi ut _aliquip ex_\n'
        + 'ea commodo consequat. Duis aute irure\n'
        + 'dolor in reprehenderit in voluptate velit esse\n'
        + 'cillum dolore eu fugiat _nulla pariatur_.',
      help: 'One line per row. Wrap a phrase in _underscores_ to underline it.' },

    { type: 'color',  key: 'paper', label: 'Paper', group: 'Style', default: '#F8F4E9' },
    { type: 'color',  key: 'ink',   label: 'Text',  group: 'Style', default: '#3B362C' },
    { type: 'color',  key: 'rule',  label: 'Underline', group: 'Style', default: '#D97706' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'playfair' },
    { type: 'number', key: 'size',  label: 'Text size', group: 'Style', default: 27, min: 8, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'lead',  label: 'Line height', group: 'Style', default: 1.6, min: 1, max: 3, step: 0.05 },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 6, min: 0, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.14, min: 0, max: 0.5, step: 0.02 },

    { type: 'number', key: 'pageAt',  label: 'Page in at', group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'firstAt', label: 'First line at', group: 'Motion', default: 1500, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'perLine', label: 'Per line',    group: 'Motion', default: 640, min: 40, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER language, quiet: a page flick as the sheet settles, one light pass as the first
  // line of ink lays down — a diary whispers, it never announces.
  sfx: (p) => [
    { atMs: p.pageAt + 260, id: 'paper', gain: 0.55 },
    { atMs: p.firstAt + 40, id: 'swish', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);
    const lines = p.body.split('\n').slice(0, MAX_LINES);

    const pageIn = spring({
      frame: fr(timeMs - p.pageAt), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(620))),
    });
    // The sheet is laid onto the desk with casual paper physics — a shallow top hinge in and
    // a sub-degree resting sway (it's a reading surface; the sway must never fight the ink).
    // The entrance is also a rack focus: the page sharpens as it settles, crisp at rest.
    const pose = depthPose(timeMs - p.pageAt, seed, { enter: pageIn, rx: -11, z: -80, swayDeg: 0.9, periodMs: 4400 });
    const rack = (1 - Math.min(1, pageIn)) * 3.5;

    const lineH = p.size * p.lead;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper, borderRadius: p.radius,
          border: `1px solid ${rgba('#000000', 0.05)}`,
          padding: `${width * 0.1}px ${width * 0.1}px ${width * 0.1}px ${width * 0.14}px`,
          boxSizing: 'border-box',
          // The body sits in the MIDDLE of the sheet, not tucked under its top edge.
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          fontFamily: ff, color: p.ink, overflow: 'hidden',
          boxShadow: p.shadow > 0
            ? `0 ${width * 0.016}px ${width * 0.04}px ${rgba('#000000', p.shadow * 0.8)}, 0 ${width * 0.055}px ${width * 0.12}px ${rgba('#000000', p.shadow)}`
            : undefined,
          opacity: clamp01(pageIn * 1.8),
          filter: rack > 0.3 ? `blur(${rack.toFixed(2)}px)` : undefined,
          transform: `${pose} scale(${interpolate(pageIn, [0, 1], [0.94, 1]).toFixed(4)})`,
          ...el('page'),
        }}
      >
        {/* Binding spine down the left edge — the reference is a bound book, not a loose sheet. */}
        <div
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: width * 0.075,
            background: `linear-gradient(90deg, ${rgba('#3B2F1E', 0.14)}, ${rgba('#3B2F1E', 0)})`,
            borderLeft: `${Math.max(2, width * 0.004)}px solid ${rgba('#3B2F1E', 0.12)}`,
          }}
        />
        {lines.map((raw, i) => {
          const s = spring({
            frame: fr(timeMs - p.firstAt - i * p.perLine), fps: FPS,
            config: { damping: 30, mass: 0.6, stiffness: 170 },
            durationInFrames: Math.max(1, Math.round(fr(460))),
          });
          MARK.lastIndex = 0;
          const parts: { text: string; mark: boolean }[] = [];
          let last = 0;
          for (let m = MARK.exec(raw); m; m = MARK.exec(raw)) {
            if (m.index > last) parts.push({ text: raw.slice(last, m.index), mark: false });
            parts.push({ text: m[1], mark: true });
            last = m.index + m[0].length;
          }
          if (last < raw.length) parts.push({ text: raw.slice(last), mark: false });

          return (
            <div
              key={i}
              style={{
                height: lineH, overflow: 'hidden',
                ...el(`line${i + 1}`),
              }}
            >
              <div
                style={{
                  fontSize: p.size, lineHeight: p.lead, whiteSpace: 'pre',
                  opacity: clamp01(s * 2),
                  transform: `translateY(${((1 - s) * lineH * 0.9).toFixed(2)}px)`,
                }}
              >
                {parts.map((part, k) => (
                  <span
                    key={k}
                    style={part.mark
                      ? { borderBottom: `2px solid ${p.rule}`, paddingBottom: 1 }
                      : undefined}
                  >
                    {part.text}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
});
