// Reference: text/simple-timelapse-2.mp4  (window 0-4480ms, runs 04:00 PM -> 07:35 PM)
// A clock winding forward. The minute value is a pure function of timeMs, so scrubbing to the same
// millisecond always shows the same time — a counter driven by an accumulating variable would drift
// between the preview and every exported frame.
//
// Each character sits in its own fixed-width cell so a 1 turning into an 8 cannot shove the rest of
// the line sideways. That jitter is the giveaway on every hand-rolled clock.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { depthPose, parallax } from '../juice';

/** "16:00" -> minutes since midnight. Falls back to 0 rather than NaN on junk. */
function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2})\s*:\s*(\d{1,2})$/.exec(hhmm.trim());
  if (!m) return 0;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return h * 60 + mm;
}

function format(totalMin: number, ampm: boolean): string {
  const wrapped = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (!ampm) return `${pad(h24)}:${pad(mm)}`;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${pad(h12)}:${pad(mm)} ${suffix}`;
}

export const timeLapse = defineGraphicsTemplate({
  id: 'time_lapse',
  name: 'Time Lapse Clock',
  category: 'chart',
  tags: ['Clock', 'Counter', 'Time'],
  design: { w: 900, h: 320 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 90 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'clock', label: 'Clock', hideable: false },
    { key: 'label', label: 'Caption' },
  ],

  params: [
    { type: 'text', key: 'from',  label: 'From',    group: 'Content', default: '16:00', maxLength: 5, help: '24-hour, HH:MM.' },
    { type: 'text', key: 'to',    label: 'To',      group: 'Content', default: '19:35', maxLength: 5 },
    { type: 'text', key: 'label', label: 'Caption', group: 'Content', default: '', maxLength: 40, help: 'Optional line under the clock.' },
    { type: 'boolean', key: 'ampm', label: '12-hour clock', group: 'Content', default: true },

    { type: 'color',  key: 'ink',  label: 'Text',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',  label: 'Caption', group: 'Style', default: '#8C887D' },
    { type: 'font',   key: 'font', label: 'Font',  group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size', label: 'Size',  group: 'Style', default: 186, min: 24, max: 260, step: 4, unit: 'px' },
    { type: 'number', key: 'weight', label: 'Weight', group: 'Style', default: 600, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'cell', label: 'Digit width', group: 'Style', default: 0.62, min: 0.4, max: 1.2, step: 0.02,
      help: 'Relative to the size. Keeps the line from jittering as digits change.' },

    { type: 'number', key: 'startAt', label: 'Starts at', group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'runMs',   label: 'Runs over', group: 'Motion', default: 4100, min: 200, max: 12000, step: 100, unit: 'ms' },
  ],

  // Counter rules: ONE tick as the lapse starts winding and a chime as it lands on the final
  // time — the same startAt/runMs clock as the digits. No per-minute ticks: the minutes roll
  // nearly every frame and a cue per swap would read as a geiger counter.
  sfx: (p) => [
    { atMs: p.startAt, id: 'tick', gain: 0.45 },
    { atMs: p.startAt + p.runMs, id: 'chime', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);
    const a = toMinutes(p.from);
    const b = toMinutes(p.to);

    const tOf = (ms: number) => interpolate(ms, [p.startAt, p.startAt + p.runMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const t = tOf(timeMs);
    const text = format(a + (b - a) * t, p.ampm);
    // The clock ~130ms ahead: any cell whose character differs is mid-roll and gets a smear
    // scaled to the wind rate. At the final time both strings match, so every digit lands
    // crisp — and slow lapses fall below the visibility threshold and never blur at all.
    const ahead = format(a + (b - a) * tOf(timeMs + 130), p.ampm);
    const rollBlur = Math.min(2.2, (Math.abs(b - a) / Math.max(1, p.runMs)) * 26);

    const enter = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 24, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    // Depth wraps the clock: a top-hinged swing-in and a faint resting sway; the caption
    // rides a parallax depth under the digits so the sway shears the two lines.
    const pose = depthPose(timeMs, seed, { enter, rx: -12, z: -60, swayDeg: 1.4 });
    const parCap = parallax(timeMs, seed, 0.45, p.size * 0.03);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: ff,
          transform: pose,
          transformOrigin: '50% 45%',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'center',
            fontSize: p.size, fontWeight: p.weight, color: p.ink, lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 2px 22px rgba(0,0,0,0.45)',
            opacity: clamp01(enter * 1.6),
            transform: `scale(${interpolate(enter, [0, 1], [0.94, 1]).toFixed(4)})`,
            ...el('clock'),
          }}
        >
          {[...text].map((ch, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block', textAlign: 'center',
                // A colon and a space do not need a full digit cell; digits do, and giving them a
                // fixed one is what stops the line shuffling every minute.
                width: ch === ':' ? p.size * 0.28 : ch === ' ' ? p.size * 0.22 : p.size * p.cell,
                filter: ch !== ahead[i] && rollBlur > 0.3 ? `blur(${rollBlur.toFixed(2)}px)` : undefined,
              }}
            >
              {ch}
            </span>
          ))}
        </div>

        {p.label.trim() && (
          <div
            style={{
              marginTop: p.size * 0.16,
              fontSize: p.size * 0.18, color: p.dim,
              fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase',
              textShadow: '0 1px 12px rgba(0,0,0,0.4)',
              opacity: clamp01(enter),
              transform: `translate(${parCap.x.toFixed(2)}px, ${parCap.y.toFixed(2)}px)`,
              ...el('label'),
            }}
          >
            {p.label}
          </div>
        )}
      </div>
    );
  },
});
